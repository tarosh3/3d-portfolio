import * as THREE from 'three'

export const WATER_LEVEL = 2.08
export const DEPTH_MIN = -8
export const DEPTH_RANGE = 12
export const SHORE_RANGE = 6

/** Two chamfer sweeps propagate nearest seed positions; setup only, never per frame. */
function nearestSeeds(seeds: Uint8Array, size: number) {
  const nearest = new Int32Array(size * size).fill(-1)
  const distance = new Float32Array(size * size).fill(1e6)
  for (let i = 0; i < seeds.length; i++) if (seeds[i]) { nearest[i] = i; distance[i] = 0 }
  const visit = (i: number, neighbor: number, cost: number) => {
    if (distance[neighbor] + cost < distance[i]) {
      distance[i] = distance[neighbor] + cost
      nearest[i] = nearest[neighbor]
    }
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x
    if (x) visit(i, i - 1, 1)
    if (y) {
      visit(i, i - size, 1)
      if (x) visit(i, i - size - 1, Math.SQRT2)
      if (x + 1 < size) visit(i, i - size + 1, Math.SQRT2)
    }
  }
  for (let y = size - 1; y >= 0; y--) for (let x = size - 1; x >= 0; x--) {
    const i = y * size + x
    if (x + 1 < size) visit(i, i + 1, 1)
    if (y + 1 < size) {
      visit(i, i + size, 1)
      if (x) visit(i, i + size - 1, Math.SQRT2)
      if (x + 1 < size) visit(i, i + size + 1, Math.SQRT2)
    }
  }
  return { nearest, distance }
}

/** Rasterize the real seabed into one small, camera-independent height/shore texture. */
export function bakeWaterDepth(model: THREE.Object3D, size = 256) {
  const surfaces: THREE.Mesh[] = []
  const bounds = new THREE.Box3()
  model.updateWorldMatrix(true, true)
  model.traverse(object => {
    if (object instanceof THREE.Mesh && /^(Groundplane_|Rocks_)/.test(object.name)) {
      surfaces.push(object)
      bounds.union(new THREE.Box3().setFromObject(object, true))
    }
  })
  if (bounds.isEmpty()) throw new Error('Water requires the authored sand and rock surfaces')
  const span = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) + 16
  const minX = (bounds.min.x + bounds.max.x - span) / 2
  const minZ = (bounds.min.z + bounds.max.z - span) / 2
  const cell = span / size
  const heights = new Float32Array(size * size).fill(-Infinity)
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const rasterize = (mesh: THREE.Mesh) => {
    const positions = mesh.geometry.getAttribute('position')
    const indices = mesh.geometry.index
    const count = indices ? indices.count : positions.count
    for (let t = 0; t < count; t += 3) {
      a.fromBufferAttribute(positions, indices ? indices.getX(t) : t).applyMatrix4(mesh.matrixWorld)
      b.fromBufferAttribute(positions, indices ? indices.getX(t + 1) : t + 1).applyMatrix4(mesh.matrixWorld)
      c.fromBufferAttribute(positions, indices ? indices.getX(t + 2) : t + 2).applyMatrix4(mesh.matrixWorld)
      const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z)
      if (Math.abs(denominator) < 1e-8) continue
      const x0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - minX) / cell))
      const x1 = Math.min(size - 1, Math.ceil((Math.max(a.x, b.x, c.x) - minX) / cell))
      const z0 = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - minZ) / cell))
      const z1 = Math.min(size - 1, Math.ceil((Math.max(a.z, b.z, c.z) - minZ) / cell))
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const wx = minX + (x + .5) * cell, wz = minZ + (z + .5) * cell
        const u = ((b.z - c.z) * (wx - c.x) + (c.x - b.x) * (wz - c.z)) / denominator
        const v = ((c.z - a.z) * (wx - c.x) + (a.x - c.x) * (wz - c.z)) / denominator
        if (u < 0 || v < 0 || u + v > 1) continue
        const i = z * size + x
        heights[i] = Math.max(heights[i], u * a.y + v * b.y + (1 - u - v) * c.y)
      }
    }
  }
  surfaces.forEach(mesh => { if (/^Groundplane_/.test(mesh.name)) rasterize(mesh) })
  const coverage = new Uint8Array(heights.length)
  for (let i = 0; i < heights.length; i++) coverage[i] = Number.isFinite(heights[i]) ? 1 : 0
  const seabed = nearestSeeds(coverage, size)
  // Extend the sculpted seabed downward beyond the model edge so its cut-out
  // boundary does not create a second, artificial coastline in the water colour.
  for (let i = 0; i < heights.length; i++) if (!coverage[i]) {
    const distance = seabed.distance[i] * cell
    const slope = seabed.nearest[i] < 0 ? DEPTH_MIN : heights[seabed.nearest[i]] - distance * .65
    // The lookup has eight units of padding. Reach exactly open-ocean depth
    // inside that padding, including the last texel: clamping a shallower
    // perimeter otherwise reveals the entire square texture as a hard patch.
    heights[i] = THREE.MathUtils.lerp(slope, DEPTH_MIN, THREE.MathUtils.smoothstep(distance, 2, 7))
  }
  // Smooth only the extrapolated floor. Keep the actual shallow sand accurate;
  // nearest-seed sectors must not become visible rays pointing into the ocean.
  const blurred = new Float32Array(heights.length)
  for (let pass = 0; pass < 12; pass++) {
    blurred.set(heights)
    for (let z = 1; z < size - 1; z++) for (let x = 1; x < size - 1; x++) {
      const i = z * size + x
      if (!coverage[i]) heights[i] = (blurred[i] * 4 + blurred[i - 1] + blurred[i + 1] + blurred[i - size] + blurred[i + size]) / 8
    }
  }
  // Rocks affect local shallows/foam, but must never extrude their heights
  // offshore into radial sandbars.
  surfaces.forEach(mesh => { if (/^Rocks_/.test(mesh.name)) rasterize(mesh) })
  const outside = new Uint8Array(coverage.length)
  for (let i = 0; i < outside.length; i++) outside[i] = 1 - coverage[i]
  const toEdge = nearestSeeds(outside, size).distance
  const land = new Uint8Array(heights.length), sea = new Uint8Array(heights.length)
  for (let i = 0; i < heights.length; i++) { land[i] = heights[i] >= WATER_LEVEL ? 1 : 0; sea[i] = 1 - land[i] }
  const toLand = nearestSeeds(land, size).distance
  const toSea = nearestSeeds(sea, size).distance
  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < heights.length; i++) {
    const distance = (land[i] ? -toSea[i] : toLand[i]) * cell
    data[i * 4] = Math.round(THREE.MathUtils.clamp((heights[i] - DEPTH_MIN) / DEPTH_RANGE, 0, 1) * 255)
    data[i * 4 + 1] = Math.round(THREE.MathUtils.clamp(distance / (2 * SHORE_RANGE) + .5, 0, 1) * 255)
    // Fade underwater visibility before the finite sculpted seabed ends.
    data[i * 4 + 2] = Math.round(Math.min(1, toEdge[i] * cell / 2) * 255)
    data[i * 4 + 3] = 255
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  texture.name = 'Island bathymetry and shoreline'
  texture.minFilter = texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return { texture, bounds: new THREE.Vector4(minX, minZ, span, span) }
}

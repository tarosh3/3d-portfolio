import * as THREE from 'three'

type Lobe = readonly [number, number, number, number, number, number]

// Every ellipsoid contains the origin. Its outward ray intersection is therefore
// continuous in every direction, letting us bake a single closed cloud skin.
// The unequal shoulders and off-centre crown avoid repeated rows of white balls.
const PROFILES: readonly (readonly Lobe[])[] = [
  [
    [0, -.055, 0, .95, .225, .335],
    [-.53, .005, .015, .66, .31, .34],
    [-.09, .105, -.025, .46, .44, .385],
    [.46, -.015, .015, .65, .325, .355],
  ],
  [
    [0, -.065, 0, .98, .225, .335],
    [-.57, -.02, .025, .70, .265, .30],
    [-.24, .12, .015, .52, .43, .37],
    [.42, .025, -.035, .65, .35, .345],
  ],
  [
    [0, -.06, 0, .955, .225, .335],
    [-.47, .015, -.025, .66, .345, .35],
    [.20, .135, .025, .50, .445, .375],
    [.57, -.025, .02, .70, .265, .30],
  ],
]

/**
 * One static, watertight cloud surface: 922 vertices / 1,840 triangles.
 * Smooth radial unions remove intersecting puff surfaces and shared indices
 * give continuous normals at both poles and the longitude seam. Generation is
 * construction-only; the sky moves a handful of instances of this geometry.
 */
export function createCloudGeometry(variant: number): THREE.BufferGeometry {
  const profile = PROFILES[((Math.trunc(variant) % PROFILES.length) + PROFILES.length) % PROFILES.length]
  const longitude = 40, latitude = 24
  const vertexCount = 2 + longitude * (latitude - 1)
  const positions = new Float32Array(vertexCount * 3)
  const indices = new Uint16Array(longitude * (latitude - 1) * 6)
  const intersections = new Float64Array(profile.length)
  let vertex = 0

  function point(x: number, y: number, z: number) {
    let outer = 0
    for (let i = 0; i < profile.length; i++) {
      const [cx, cy, cz, rx, ry, rz] = profile[i]
      const dx = x / rx, dy = y / ry, dz = z / rz
      const ox = cx / rx, oy = cy / ry, oz = cz / rz
      const a = dx * dx + dy * dy + dz * dz
      const b = -2 * (dx * ox + dy * oy + dz * oz)
      const c = ox * ox + oy * oy + oz * oz - 1
      const radius = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
      intersections[i] = radius
      outer = Math.max(outer, radius)
    }
    // Log-sum-exp softly joins shoulders without creases or internal geometry.
    // Subtracting the maximum keeps the exponential stable for all directions.
    let blend = 0
    for (let i = 0; i < intersections.length; i++) blend += Math.exp((intersections[i] - outer) * 22)
    const radius = outer + Math.log(blend) / 22
    const py = y * radius
    // Flatten the underside with a differentiable blend, keeping the upper
    // billows round. A hard clamp here would collapse triangles at the base.
    const t = THREE.MathUtils.clamp((py + .11) / .2, 0, 1)
    const underside = .43 + .57 * t * t * (3 - 2 * t)
    positions[vertex++] = x * radius
    positions[vertex++] = py * underside
    positions[vertex++] = z * radius
  }

  point(0, 1, 0)
  for (let row = 1; row < latitude; row++) {
    const theta = row / latitude * Math.PI
    const ring = Math.sin(theta), y = Math.cos(theta)
    for (let col = 0; col < longitude; col++) {
      const phi = col / longitude * Math.PI * 2
      point(ring * Math.cos(phi), y, ring * Math.sin(phi))
    }
  }
  point(0, -1, 0)

  let index = 0
  for (let col = 0; col < longitude; col++) {
    const next = (col + 1) % longitude
    indices[index++] = 0; indices[index++] = 1 + next; indices[index++] = 1 + col
    for (let row = 0; row < latitude - 2; row++) {
      const a = 1 + row * longitude + col, b = 1 + row * longitude + next
      const c = a + longitude, d = b + longitude
      indices[index++] = a; indices[index++] = b; indices[index++] = c
      indices[index++] = b; indices[index++] = d; indices[index++] = c
    }
    const last = 1 + (latitude - 2) * longitude
    indices[index++] = last + col; indices[index++] = last + next; indices[index++] = vertexCount - 1
  }

  const geometry = new THREE.BufferGeometry()
  geometry.name = `Joined cloud silhouette ${variant + 1}`
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox!
  const halfWidth = (bounds.max.x - bounds.min.x) * .5
  geometry.translate(-(bounds.max.x + bounds.min.x) * .5, 0, 0)
  geometry.scale(1 / halfWidth, 1 / halfWidth, 1 / halfWidth)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

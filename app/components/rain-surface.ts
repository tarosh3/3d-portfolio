import * as THREE from 'three'
import { WATER_LEVEL } from './water-depth'

export const RAIN_HEIGHT_MIN = 0
export const RAIN_HEIGHT_RANGE = 16
export const RAIN_SURFACE_SIZE = 512

// Only stable, solid surfaces shelter rain. Animated leaf cards remain a porous
// canopy; including their baked positions would create moving dry silhouettes.
export const RAIN_SURFACE_MESH = /^(House_|Changing_Cabin_|Groundplane_|Rocks_|Pier_|BeachUmbrella_|Sunbed|Sofa_)/

export type RainSurface = {
  texture: THREE.DataTexture
  bounds: THREE.Vector4
  heights: Float32Array
  shelterHeights: Float32Array
  size: number
  cell: number
}
type SurfaceData = Omit<RainSurface, 'texture'> & { pixels: Uint8Array }
const dataCache = new WeakMap<THREE.Object3D, Map<number, SurfaceData>>()
const textureCache = new WeakMap<THREE.Object3D, { surface: RainSurface; references: number }>()

/** RG is the exact topmost texel-center surface, BA its conservative shelter. */
export const RAIN_SURFACE_GLSL = `
float rainDecodedHeight(vec2 packedHeight) {
  return dot(packedHeight, vec2(65280.0, 255.0)) / 65535.0 * ${RAIN_HEIGHT_RANGE.toFixed(1)} + ${RAIN_HEIGHT_MIN.toFixed(1)};
}
float rainSurfaceHeight(sampler2D surfaceMap, vec4 surfaceBounds, vec2 worldXZ) {
  vec2 surfaceUv = (worldXZ - surfaceBounds.xy) / surfaceBounds.zw;
  if (any(lessThan(surfaceUv, vec2(0.0))) || any(greaterThan(surfaceUv, vec2(1.0)))) return ${WATER_LEVEL};
  return rainDecodedHeight(texture2D(surfaceMap, surfaceUv).ba);
}
float rainExposedHeight(sampler2D surfaceMap, vec4 surfaceBounds, vec2 worldXZ) {
  vec2 surfaceUv = (worldXZ - surfaceBounds.xy) / surfaceBounds.zw;
  if (any(lessThan(surfaceUv, vec2(0.0))) || any(greaterThan(surfaceUv, vec2(1.0)))) return ${WATER_LEVEL};
  return rainDecodedHeight(texture2D(surfaceMap, surfaceUv).rg);
}
`

function bakeSurfaceData(model: THREE.Object3D, size: number): SurfaceData {
  const existing = dataCache.get(model)?.get(size)
  if (existing) return existing
  if (!Number.isInteger(size) || size < 16) throw new Error('Rain surface resolution must be an integer of at least 16')
  const meshes: THREE.Mesh[] = [], bounds = new THREE.Box3()
  model.updateWorldMatrix(true, true)
  model.traverse(object => {
    if (object instanceof THREE.Mesh && RAIN_SURFACE_MESH.test(object.name)) {
      meshes.push(object)
      bounds.union(new THREE.Box3().setFromObject(object, true))
    }
  })
  if (bounds.isEmpty()) throw new Error('Rain requires the authored island shelter and ground surfaces')
  const span = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) + 6
  const minX = (bounds.min.x + bounds.max.x - span) / 2
  const minZ = (bounds.min.z + bounds.max.z - span) / 2
  const cell = span / size, half = cell / 2
  const heights = new Float32Array(size * size).fill(WATER_LEVEL)
  const shelterHeights = new Float32Array(size * size).fill(WATER_LEVEL)
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  for (const mesh of meshes) {
    const positions = mesh.geometry.getAttribute('position'), indices = mesh.geometry.index
    const count = indices ? indices.count : positions.count
    for (let t = 0; t < count; t += 3) {
      a.fromBufferAttribute(positions, indices ? indices.getX(t) : t).applyMatrix4(mesh.matrixWorld)
      b.fromBufferAttribute(positions, indices ? indices.getX(t + 1) : t + 1).applyMatrix4(mesh.matrixWorld)
      c.fromBufferAttribute(positions, indices ? indices.getX(t + 2) : t + 2).applyMatrix4(mesh.matrixWorld)
      const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z)
      const maxY = Math.max(a.y, b.y, c.y)
      if (Math.abs(denominator) < 1e-8 || maxY <= WATER_LEVEL) continue
      // A triangle/cell overlap test, rather than center-only rasterization,
      // seals every roof-edge cell. The planar maximum across that cell also
      // protects steep roofs between samples without a per-frame raycast.
      const ux = (b.z - c.z) / denominator, uz = (c.x - b.x) / denominator
      const vx = (c.z - a.z) / denominator, vz = (a.x - c.x) / denominator
      const uMargin = half * (Math.abs(ux) + Math.abs(uz))
      const vMargin = half * (Math.abs(vx) + Math.abs(vz))
      const wMargin = half * (Math.abs(ux + vx) + Math.abs(uz + vz))
      const heightMargin = half * (Math.abs(ux * (a.y - c.y) + vx * (b.y - c.y)) + Math.abs(uz * (a.y - c.y) + vz * (b.y - c.y)))
      const x0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - minX) / cell))
      const x1 = Math.min(size - 1, Math.floor((Math.max(a.x, b.x, c.x) - minX) / cell))
      const z0 = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - minZ) / cell))
      const z1 = Math.min(size - 1, Math.floor((Math.max(a.z, b.z, c.z) - minZ) / cell))
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const wx = minX + (x + .5) * cell, wz = minZ + (z + .5) * cell
        const u = ux * (wx - c.x) + uz * (wz - c.z)
        const v = vx * (wx - c.x) + vz * (wz - c.z)
        const height = u * a.y + v * b.y + (1 - u - v) * c.y, i = z * size + x
        if (u >= 0 && v >= 0 && u + v <= 1) heights[i] = Math.max(heights[i], height)
        if (u >= -uMargin && v >= -vMargin && u + v <= 1 + wMargin) {
          shelterHeights[i] = Math.max(shelterHeights[i], Math.min(maxY, height + heightMargin))
        }
      }
    }
  }
  const pixels = new Uint8Array(size * size * 4)
  for (let i = 0; i < heights.length; i++) {
    // Round upward: 16-bit error remains below .00025 world units and can
    // never reopen the bottom of a roof that the conservative bake closed.
    const exact = Math.ceil(THREE.MathUtils.clamp((heights[i] - RAIN_HEIGHT_MIN) / RAIN_HEIGHT_RANGE, 0, 1) * 65535)
    const safe = Math.ceil(THREE.MathUtils.clamp((shelterHeights[i] - RAIN_HEIGHT_MIN) / RAIN_HEIGHT_RANGE, 0, 1) * 65535)
    pixels[i * 4] = exact >> 8; pixels[i * 4 + 1] = exact & 255
    pixels[i * 4 + 2] = safe >> 8; pixels[i * 4 + 3] = safe & 255
  }
  const data = { pixels, heights, shelterHeights, bounds: new THREE.Vector4(minX, minZ, span, span), size, cell }
  let resolutions = dataCache.get(model)
  if (!resolutions) { resolutions = new Map(); dataCache.set(model, resolutions) }
  resolutions.set(size, data)
  return data
}

/** Setup only. Caller owns this texture; cached CPU arrays are immutable. */
export function bakeRainSurface(model: THREE.Object3D, size = RAIN_SURFACE_SIZE): RainSurface {
  const { pixels, ...data } = bakeSurfaceData(model, size)
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat)
  texture.name = 'Rain surface and conservative roof shelter'
  texture.minFilter = texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return { ...data, texture }
}

/** Acquire in an effect, not render. Strict Mode cleanup/replay gets a live texture. */
export function acquireRainSurface(model: THREE.Object3D): RainSurface {
  let entry = textureCache.get(model)
  if (!entry) { entry = { surface: bakeRainSurface(model), references: 0 }; textureCache.set(model, entry) }
  entry.references++
  return entry.surface
}
export function releaseRainSurface(model: THREE.Object3D) {
  const entry = textureCache.get(model)
  if (!entry) return
  if (--entry.references === 0) { entry.surface.texture.dispose(); textureCache.delete(model) }
}

/** Allocation-free CPU counterpart, used for splashes and under-roof audio. */
export function sampleRainSurface(surface: RainSurface, x: number, z: number, conservative = true) {
  const tx = Math.floor((x - surface.bounds.x) / surface.cell)
  const tz = Math.floor((z - surface.bounds.y) / surface.cell)
  if (tx < 0 || tz < 0 || tx >= surface.size || tz >= surface.size) return WATER_LEVEL
  return (conservative ? surface.shelterHeights : surface.heights)[tz * surface.size + tx]
}

import * as THREE from 'three'
import { DAY_HORIZON, DUSK_HORIZON } from './day-cycle'
import type { IslandWeather } from './island-weather'

const OVERCAST_DAY = new THREE.Color('#899da5')
const OVERCAST_DUSK = new THREE.Color('#394b60')
const STORM_DAY = new THREE.Color('#718692')
const STORM_DUSK = new THREE.Color('#2b3b4e')
const FLASH = new THREE.Color('#bfcedb')

/** Write into the caller's colour, keeping the sky and fog exactly continuous. */
export function setWeatherHorizon(target: THREE.Color, dusk: number, weather?: IslandWeather) {
  target.lerpColors(DAY_HORIZON, DUSK_HORIZON, dusk)
  if (!weather) return target
  const cloud = weather.cloud
  // Lerp channels directly: no scratch colour is allocated in any frame loop.
  const r = THREE.MathUtils.lerp(OVERCAST_DAY.r, OVERCAST_DUSK.r, dusk)
  const g = THREE.MathUtils.lerp(OVERCAST_DAY.g, OVERCAST_DUSK.g, dusk)
  const b = THREE.MathUtils.lerp(OVERCAST_DAY.b, OVERCAST_DUSK.b, dusk)
  target.r += (r - target.r) * cloud
  target.g += (g - target.g) * cloud
  target.b += (b - target.b) * cloud
  const rain = weather.rain * .65
  target.r += (THREE.MathUtils.lerp(STORM_DAY.r, STORM_DUSK.r, dusk) - target.r) * rain
  target.g += (THREE.MathUtils.lerp(STORM_DAY.g, STORM_DUSK.g, dusk) - target.g) * rain
  target.b += (THREE.MathUtils.lerp(STORM_DAY.b, STORM_DUSK.b, dusk) - target.b) * rain
  return target.lerp(FLASH, weather.lightning * .15)
}

/** A small repeatable noise lookup replaces per-pixel fractal noise/raymarching. */
export function createSkyNoise() {
  const size = 256, pixels = new Uint8Array(size * size * 4)
  const grids: Float32Array[] = [], frequencies = [4, 8, 16, 32, 64]
  let seed = 8917
  for (const frequency of frequencies) {
    const grid = new Float32Array(frequency * frequency)
    for (let i = 0; i < grid.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      grid[i] = seed / 4294967296
    }
    grids.push(grid)
  }
  const noise = (x: number, y: number, level: number) => {
    const n = frequencies[level], grid = grids[level]
    const px = x / size * n, py = y / size * n
    const ix = Math.floor(px), iy = Math.floor(py)
    let fx = px - ix, fy = py - iy
    fx = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
    fy = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
    const a = grid[(iy % n) * n + ix % n], b = grid[(iy % n) * n + (ix + 1) % n]
    const c = grid[((iy + 1) % n) * n + ix % n], d = grid[((iy + 1) % n) * n + (ix + 1) % n]
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4
    pixels[i] = Math.round(255 * (.55 * noise(x, y, 0) + .26 * noise(x, y, 1) + .13 * noise(x, y, 2) + .06 * noise(x, y, 3)))
    pixels[i + 1] = Math.round(255 * (.58 * noise(x, y, 2) + .28 * noise(x, y, 3) + .14 * noise(x, y, 4)))
    pixels[i + 2] = Math.round(255 * noise(x, y, 1))
    pixels[i + 3] = 255
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat)
  texture.name = 'Cached atmospheric cloud density'
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

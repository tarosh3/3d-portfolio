import * as THREE from 'three'

export const NIGHT_STAR_COUNT = 1800
export const PHONE_STAR_COUNT = 900
export const MOON_DIRECTION = new THREE.Vector3(-.47, .03, -.882).normalize()

/** A small owned lunar albedo map: dark maria, overlapping craters and fine grain. */
export function createMoonAlbedo() {
  const size = 256, values = new Float32Array(size * size), pixels = new Uint8Array(size * size * 4)
  let seed = 7319
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const basins = [[.35, .63, .2, .16], [.47, .76, .17, .11], [.23, .48, .12, .18], [.64, .6, .11, .12], [.55, .43, .08, .14]]
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size
    let albedo = .79 + (random() - .5) * .075
    const warp = Math.sin(u * 41 + Math.sin(v * 27)) * .017
    for (const [cx, cy, rx, ry] of basins) {
      const d = ((u - cx + warp) / rx) ** 2 + ((v - cy + warp) / ry) ** 2
      albedo -= Math.exp(-d * 1.7) * .18
    }
    values[y * size + x] = albedo
  }
  for (let crater = 0; crater < 145; crater++) {
    const cx = random() * size, cy = random() * size, radius = 1.1 + Math.pow(random(), 2.7) * 12
    for (let y = Math.max(0, Math.floor(cy - radius * 1.3)); y < Math.min(size, cy + radius * 1.3); y++) {
      for (let x = Math.max(0, Math.floor(cx - radius * 1.3)); x < Math.min(size, cx + radius * 1.3); x++) {
        const dx = (x - cx) / radius, dy = (y - cy) / radius, d = Math.hypot(dx, dy)
        const rim = Math.exp(-(((d - .88) / .12) ** 2)) * .15
        const bowl = Math.exp(-d * d * 3.3) * .095
        values[y * size + x] += rim - bowl + Math.exp(-(((d - .65) / .25) ** 2)) * dx * .12
      }
    }
  }
  for (let i = 0; i < values.length; i++) {
    const value = Math.round(THREE.MathUtils.clamp(values[i], .28, .98) * 255)
    pixels.set([value, value, value, 255], i * 4)
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat)
  texture.name = 'Lunar maria and craters'
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true; texture.needsUpdate = true
  return texture
}

/** Fixed celestial directions; brightness is skewed toward faint, small stars. */
export function createNightStars() {
  const positions = new Float32Array(NIGHT_STAR_COUNT * 3)
  const data = new Float32Array(NIGHT_STAR_COUNT * 3)
  const colours = new Float32Array(NIGHT_STAR_COUNT * 3)
  const cool = new THREE.Color('#b9d6ff'), warm = new THREE.Color('#ffdfb2'), white = new THREE.Color('#e8efff')
  const colour = new THREE.Color()
  let seed = 421
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  for (let i = 0; i < NIGHT_STAR_COUNT; i++) {
    const y = .004 + Math.pow(random(), 1.7) * .985, azimuth = random() * Math.PI * 2
    const radius = Math.sqrt(1 - y * y), magnitude = Math.pow(random(), 3.6)
    positions.set([Math.cos(azimuth) * radius * 180, y * 180, Math.sin(azimuth) * radius * 180], i * 3)
    data.set([.16 + magnitude * .84, .7 + magnitude * 2.5, random() * Math.PI * 2], i * 3)
    const temperature = random()
    colour.copy(white).lerp(temperature < .6 ? cool : warm, Math.abs(temperature - .6) * .85)
    colour.toArray(colours, i * 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('starData', new THREE.BufferAttribute(data, 3))
  geometry.setAttribute('starColour', new THREE.BufferAttribute(colours, 3))
  return geometry
}

// Two folded curtains use the existing cloud-noise texture. No ray marching,
// render targets or per-frame geometry updates. Mobile retains the front veil.
export const NIGHT_ATMOSPHERE = /* glsl */`
  uniform float uNight, uTime, uMobile;
  vec3 nightAtmosphere(vec3 direction, float altitude, float density) {
    float visibility = uNight * smoothstep(.008, .045, altitude) * (1.0 - density);
    if (visibility < .001) return vec3(0.0);
    vec2 azimuth = normalize(direction.xz);
    float heading = atan(azimuth.y, azimuth.x);
    float t = uTime * .055;
    // A quiet diagonal band of distant galactic haze, below individual stars.
    float galactic = exp(-pow((direction.y - .17 - direction.x * .28) / .14, 2.0));
    float dust = texture2D(uNoise, direction.xz * .7 + vec2(altitude * .6, .17)).g;
    vec3 radiance = vec3(.010, .014, .025) * galactic * (.35 + dust * .65);
    float facing = smoothstep(-.2, .6, dot(azimuth, vec2(-.72, -.694)));
    float fold = sin(heading * 2.7 + t * .25) * .052 + sin(heading * 6.0 - t * .23) * .021;
    float base = .055 + fold;
    float height = altitude - base;
    float fine = texture2D(uNoise, vec2(heading * .42 - t * .027, height * .32 + t * .012)).g;
    float threads = texture2D(uNoise, vec2(heading * 1.8 + fine * .7 + height * 1.2, .43 + height * .14 - t * .015)).g;
    float rays = .3 + .7 * smoothstep(.22, .8, threads) * (.4 + fine * .8);
    float curtain = smoothstep(-.017, .011, height) * exp(-max(height, 0.0) * 15.0);
    float hem = exp(-pow(height / .012, 2.0));
    float reach = smoothstep(-.1, .2, sin(heading * 2.0 - .9) + .35);
    vec3 green = vec3(.028, .19, .125);
    vec3 violet = vec3(.081, .028, .15);
    vec3 aurora = mix(green, violet, smoothstep(.025, .18, height)) * curtain * rays;
    aurora += vec3(.018, .075, .055) * hem * (.45 + fine * .55);
    if (uMobile < .5) {
      float secondHeight = altitude - .115 - fold * 1.7 - sin(heading * 5.0 + t * .2) * .018;
      float second = smoothstep(-.025, .018, secondHeight) * exp(-max(secondHeight, 0.0) * 12.0);
      aurora += vec3(.028, .08, .135) * second * (.4 + fine * .6) * .55;
    }
    radiance += aurora * facing * (.45 + reach * .55);
    return radiance * visibility;
  }
`

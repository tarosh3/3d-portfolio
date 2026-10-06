import * as THREE from 'three'
import { acquireRainSurface, releaseRainSurface, RAIN_SURFACE_GLSL, sampleRainSurface } from './rain-surface'
import { WATER_LEVEL } from './water-depth'
import type { IslandWeather } from './island-weather'

export const RAIN_PARTICLES = { desktop: 12000, mobile: 4600, low: 2200 }
export const RAIN_SPLASHES = { desktop: 340, mobile: 100, low: 0 }
const ignoreRaycast = () => {}
const DAY_RAIN = new THREE.Color('#c2d6db'), DUSK_RAIN = new THREE.Color('#89a9c1')

const rainVertex = `
attribute vec4 aSeed;
attribute vec2 aStyle;
uniform float uTime;
uniform float uDrift;
uniform float uRain;
uniform float uSlant;
uniform float uPixelWorld;
uniform vec2 uWind;
uniform vec4 uField;
varying vec2 vUv;
varying vec3 vWorld;
varying float vVisibility;
void main() {
  float phase = fract(aSeed.z + uTime * aStyle.x / 15.0);
  float fall = phase * 15.0;
  vec2 horizontal = mod(aSeed.xy * uField.zw + uWind * (fall * uSlant + uDrift * .28), uField.zw);
  vec3 center = vec3(uField.x + horizontal.x, 17.08 - fall, uField.y + horizontal.y);
  vec3 direction = normalize(vec3(uWind.x * uSlant, -1.0, uWind.y * uSlant));
  vec3 viewDirection = normalize(cameraPosition - center);
  vec3 side = normalize(cross(direction, viewDirection) + vec3(.00001, 0.0, .00001));
  float depth = -(viewMatrix * vec4(center, 1.0)).z;
  float width = max(.004 + aStyle.y * .004, max(0.0, depth) * uPixelWorld * .65);
  float streak = (.13 + aStyle.y * .17) * (1.0 + uSlant * .6);
  vWorld = center + side * position.x * width + direction * position.y * streak;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  vUv = uv;
  float edge = min(min(horizontal.x, horizontal.y), min(uField.z - horizontal.x, uField.w - horizontal.y));
  float fieldFade = smoothstep(0.0, 4.0, edge);
  float depthFade = smoothstep(.8, 2.8, depth) * (1.0 - smoothstep(38.0, 72.0, depth));
  float topFade = smoothstep(0.0, 1.7, fall);
  float density = smoothstep(aSeed.w - .04, aSeed.w + .04, uRain);
  vVisibility = fieldFade * depthFade * topFade * density * smoothstep(0.0, .1, uRain);
}
`
const rainFragment = `
uniform sampler2D uSurface;
uniform vec4 uSurfaceBounds;
uniform vec3 uColor;
uniform float uFlash;
varying vec2 vUv;
varying vec3 vWorld;
varying float vVisibility;
${RAIN_SURFACE_GLSL}
void main() {
  // Fragment clipping also catches a slanted streak crossing a roof edge.
  // Depth testing handles the visible front of buildings and terrain.
  float surface = rainSurfaceHeight(uSurface, uSurfaceBounds, vWorld.xz);
  if (vWorld.y < surface + .014 || vVisibility < .002) discard;
  float crossSection = 1.0 - smoothstep(.08, .5, abs(vUv.x - .5));
  float lengthFade = smoothstep(0.0, .2, vUv.y) * (1.0 - smoothstep(.64, 1.0, vUv.y));
  float alpha = crossSection * lengthFade * vVisibility * .36;
  gl_FragColor = vec4(uColor * (1.0 + uFlash * .7), alpha);
  #include <colorspace_fragment>
}
`
const splashVertex = `
attribute vec4 aImpact;
attribute vec2 aStyle;
uniform float uTime;
uniform float uRain;
uniform vec2 uWind;
varying vec2 vUv;
varying float vAge;
varying float vVisibility;
void main() {
  float phase = fract(aImpact.w + uTime * (.72 + aStyle.x * .55));
  vAge = phase / .24;
  vec3 center = aImpact.xyz + vec3(uWind.x * .02, .075, uWind.y * .02);
  vec4 view = viewMatrix * vec4(center, 1.0);
  view.xy += position.xy * vec2(.17, .14);
  gl_Position = projectionMatrix * view;
  vUv = uv;
  float density = smoothstep(aStyle.y - .07, aStyle.y + .07, uRain);
  vVisibility = density * smoothstep(0.0, .1, uRain) * (1.0 - smoothstep(24.0, 43.0, -view.z));
}
`
const splashFragment = `
uniform vec3 uColor;
varying vec2 vUv;
varying float vAge;
varying float vVisibility;
void main() {
  if (vAge > 1.0 || vVisibility < .002) discard;
  float rise = sin(vAge * 3.14159265);
  vec2 a = vec2(.43 - vAge * .29, .13 + rise * .63);
  vec2 b = vec2(.57 + vAge * .29, .13 + rise * .48);
  float left = 1.0 - smoothstep(.024, .078, length((vUv - a) * vec2(1.0, .9)));
  float right = 1.0 - smoothstep(.022, .068, length((vUv - b) * vec2(1.0, .9)));
  float alpha = max(left, right) * rise * vVisibility * .43;
  if (alpha < .004) discard;
  gl_FragColor = vec4(uColor, alpha);
  #include <colorspace_fragment>
}
`

function quad() {
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0], 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  return geometry
}
function seededRandom(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
}

/** Two bounded instanced draws; particles stay on the GPU for their full life. */
export function createIslandRain(model: THREE.Object3D) {
  const surface = acquireRainSurface(model), random = seededRandom(871230)
  const group = new THREE.Group(); group.name = 'Island rain and exposed surface impacts'
  const rainGeometry = quad(), splashGeometry = quad()
  const seeds = new Float32Array(RAIN_PARTICLES.desktop * 4), styles = new Float32Array(RAIN_PARTICLES.desktop * 2)
  for (let i = 0; i < RAIN_PARTICLES.desktop; i++) {
    seeds[i * 4] = random(); seeds[i * 4 + 1] = random(); seeds[i * 4 + 2] = random(); seeds[i * 4 + 3] = random()
    styles[i * 2] = 7.7 + random() * 3.2; styles[i * 2 + 1] = random()
  }
  rainGeometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4))
  rainGeometry.setAttribute('aStyle', new THREE.InstancedBufferAttribute(styles, 2))
  rainGeometry.instanceCount = RAIN_PARTICLES.desktop
  const time = { value: 0 }, amount = { value: 0 }, wind = { value: new THREE.Vector2(.8, .6) }, color = { value: DAY_RAIN.clone() }
  const material = new THREE.ShaderMaterial({
    name: 'Sheltered silver rain', vertexShader: rainVertex, fragmentShader: rainFragment,
    uniforms: {
      uTime: time, uRain: amount, uWind: wind, uColor: color,
      uSurface: { value: surface.texture }, uSurfaceBounds: { value: surface.bounds },
      uField: { value: new THREE.Vector4(surface.bounds.x - 5, surface.bounds.y - 5, surface.bounds.z + 10, surface.bounds.w + 10) },
      uDrift: { value: 0 }, uSlant: { value: .1 }, uPixelWorld: { value: .001 }, uFlash: { value: 0 },
    },
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
  })
  const drops = new THREE.Mesh(rainGeometry, material)
  drops.name = 'Fine wind-driven rain'; drops.raycast = ignoreRaycast; drops.frustumCulled = false; drops.renderOrder = 4
  const impacts = new Float32Array(RAIN_SPLASHES.desktop * 4), impactStyles = new Float32Array(RAIN_SPLASHES.desktop * 2)
  let impactCount = 0
  // Texel centers agree with the independently baked exact surface. Reject
  // abrupt edges and underwater points: ocean rings belong to the water shader.
  for (let attempt = 0; attempt < 12000 && impactCount < RAIN_SPLASHES.desktop; attempt++) {
    const x = 1 + Math.floor(random() * (surface.size - 2)), z = 1 + Math.floor(random() * (surface.size - 2))
    const index = z * surface.size + x, y = surface.heights[index]
    if (y < WATER_LEVEL + .08 || surface.shelterHeights[index] - y > .09) continue
    const slope = Math.max(Math.abs(surface.heights[index - 1] - y), Math.abs(surface.heights[index + 1] - y), Math.abs(surface.heights[index - surface.size] - y), Math.abs(surface.heights[index + surface.size] - y))
    if (slope > .1) continue
    impacts[impactCount * 4] = surface.bounds.x + (x + .5) * surface.cell
    impacts[impactCount * 4 + 1] = y + .012
    impacts[impactCount * 4 + 2] = surface.bounds.y + (z + .5) * surface.cell
    impacts[impactCount * 4 + 3] = random()
    impactStyles[impactCount * 2] = random(); impactStyles[impactCount * 2 + 1] = random()
    impactCount++
  }
  splashGeometry.setAttribute('aImpact', new THREE.InstancedBufferAttribute(impacts, 4))
  splashGeometry.setAttribute('aStyle', new THREE.InstancedBufferAttribute(impactStyles, 2))
  splashGeometry.instanceCount = impactCount
  const splashMaterial = new THREE.ShaderMaterial({
    name: 'Tiny exposed-surface rain impacts', vertexShader: splashVertex, fragmentShader: splashFragment,
    uniforms: { uTime: time, uRain: amount, uWind: wind, uColor: color },
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
  })
  const splashes = new THREE.Mesh(splashGeometry, splashMaterial)
  splashes.name = 'Rain impacts on exposed roofs sand and timber'; splashes.raycast = ignoreRaycast; splashes.frustumCulled = false; splashes.renderOrder = 5
  group.add(drops, splashes)
  group.visible = false
  let disposed = false
  return {
    group, surface, material, splashMaterial, rainGeometry, splashGeometry,
    update(weather: IslandWeather, dusk: number, mobile: boolean, lowQuality: boolean, reduced: boolean, paused: boolean, pixelWorld: number, preparing = false) {
      if (disposed) return
      const tier = lowQuality ? 'low' : mobile ? 'mobile' : 'desktop'
      // SceneReadiness traverses visible objects before its first frame. Warm
      // both programs and upload the shelter texture beneath the loader, with
      // one fully discarded instance per draw, including the phone low tier.
      rainGeometry.instanceCount = preparing ? 1 : RAIN_PARTICLES[tier]
      splashGeometry.instanceCount = Math.min(impactCount, preparing ? 1 : RAIN_SPLASHES[tier])
      // Still weather is communicated by cloud, wetness and ocean palette;
      // suspended drops would otherwise look like scratches across the scene.
      group.visible = preparing || (!reduced && weather.rain > .005)
      splashes.visible = preparing || splashGeometry.instanceCount > 0
      if (preparing) { amount.value = 0; return }
      if (paused) return
      amount.value = weather.rain
      color.value.lerpColors(DAY_RAIN, DUSK_RAIN, dusk)
      time.value = weather.time
      wind.value.set(weather.windX, weather.windZ)
      material.uniforms.uDrift.value = weather.drift
      material.uniforms.uSlant.value = .045 + weather.wind * .21 + weather.gust * .055
      material.uniforms.uPixelWorld.value = pixelWorld
      material.uniforms.uFlash.value = weather.lightning
    },
    shelterAt(x: number, y: number, z: number) {
      return sampleRainSurface(surface, x, z) > y + .18 ? 1 : 0
    },
    dispose() {
      if (disposed) return
      disposed = true
      group.remove(drops, splashes)
      rainGeometry.dispose(); splashGeometry.dispose(); material.dispose(); splashMaterial.dispose()
      releaseRainSurface(model)
    },
  }
}
export type IslandRainResources = ReturnType<typeof createIslandRain>

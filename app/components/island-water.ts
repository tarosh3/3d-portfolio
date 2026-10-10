import * as THREE from 'three'
import { bakeWaterDepth, WATER_LEVEL, DEPTH_MIN, DEPTH_RANGE, SHORE_RANGE } from './water-depth'
import type { IslandWeather } from './island-weather'
import { attachMaterialEffect } from './island-material-effects'
import { MOON_DIRECTION } from './night-sky'

const WATER_COLOURS = [
  ['uShallow', '#62c9ba', '#386f76', '#568886', '#34535e'],
  ['uDeep', '#145d64', '#122f3d', '#294d58', '#1b303f'],
  ['uFoam', '#e2edda', '#8cb6ba', '#b2c6c6', '#8199a5'],
  ['uSky', '#afd4d0', '#526879', '#849ba7', '#4c5c70'],
].map(([name, day, dusk, storm, stormDusk]) => ({ name, day: new THREE.Color(day), dusk: new THREE.Color(dusk), storm: new THREE.Color(storm), stormDusk: new THREE.Color(stormDusk) }))

const CAUSTICS = /* glsl */`
float sandCaustic(vec2 p, float t) {
  p *= 3.8;
  p += vec2(sin(p.y * .73 + t * .42), cos(p.x * .61 - t * .36)) * .58;
  float lines = abs(sin(p.x + p.y) + sin(p.y * 1.61 - p.x * .73) + sin(p.x * .91 - p.y * 1.17));
  return 1.0 - smoothstep(.035, .21, lines);
}
`

const VERTEX = /* glsl */`
#include <common>
#include <fog_pars_vertex>
varying vec3 vWaterWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWaterWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`
const FRAGMENT = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uDepth;
uniform vec4 uDepthBounds;
uniform float uTime;
uniform float uDusk;
uniform float uDrift;
uniform float uWind;
uniform float uGust;
uniform float uRain;
uniform float uSun;
uniform float uLightning;
uniform float uNightLight;
uniform vec3 uMoonDirection;
uniform vec2 uWindDirection;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uSky;
varying vec3 vWaterWorld;

float oceanHash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float oceanBreakup(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(oceanHash(cell), oceanHash(cell + vec2(1.0, 0.0)), f.x),
             mix(oceanHash(cell + vec2(0.0, 1.0)), oceanHash(cell + vec2(1.0, 1.0)), f.x), f.y);
}

// One expanding impact per world-space cell. A changing hashed offset keeps
// successive drops distinct; the edge envelope hides their birth/reset.
float rainRing(vec2 p, float t) {
  vec2 cell = floor(p);
  float seed = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float age = fract(t * 1.16 + seed);
  float turn = floor(t * 1.16 + seed);
  vec2 centre = .33 + .34 * fract(vec2(seed * 17.31, seed * 41.73) + turn * vec2(.618, .381));
  float radius = length(fract(p) - centre);
  float lineWidth = max(.014, fwidth(radius) * .75);
  float ring = (1.0 - smoothstep(lineWidth, lineWidth + .025, abs(radius - age * .3))) * (.014 / lineWidth);
  return ring * sin(age * 3.14159) * (1.0 - age) * step(seed, uRain * .88);
}

void main() {
  vec2 p = vWaterWorld.xz;
  vec2 uv = (p - uDepthBounds.xy) / uDepthBounds.zw;
  float inside = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
  vec3 bathymetry = texture2D(uDepth, uv).rgb;
  float floorHeight = mix(${DEPTH_MIN.toFixed(1)}, bathymetry.r * ${DEPTH_RANGE.toFixed(1)} + ${DEPTH_MIN.toFixed(1)}, inside);
  float depth = max(0.0, ${WATER_LEVEL} - floorHeight);
  float shore = mix(${SHORE_RANGE.toFixed(1)}, (bathymetry.g - .5) * ${(SHORE_RANGE * 2).toFixed(1)}, inside);

  // Analytic gradients give moving normals without displacing geometry, extra
  // normal textures, reflections, or camera-dependent depth render targets.
  vec2 along = uWindDirection;
  vec2 across = vec2(-along.y, along.x);
  vec2 first = along * 1.85 + across * .2;
  vec2 second = along * .6 - across * 2.3;
  float warp = sin(dot(p, along * .29) - uDrift * .18) * .85;
  float a = dot(p, first) - uDrift * .72 + warp;
  float b = dot(p, second) - uDrift * .56 - warp * .65;
  float windEnergy = .72 + uWind * 1.7 + uGust * .45;
  vec2 slope = (cos(a) * first * .032 + cos(b) * second * .018) * windEnergy;
  #ifndef MOBILE_WATER
    vec2 third = along * 4.1 + across * 2.8;
    slope += cos(dot(p, third) - uDrift * .83) * third * .006 * windEnergy;
  #endif
  float footprint = max(length(dFdx(p)), length(dFdy(p)));
  float detail = 1.0 - smoothstep(.25, 1.2, footprint);
  vec3 normal = normalize(vec3(-slope.x * detail, 1.0, -slope.y * detail));
  vec3 viewDirection = normalize(cameraPosition - vWaterWorld);
  float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 4.0);
  float deepMix = 1.0 - exp(-depth * .34);
  vec3 colour = mix(uShallow, uDeep, deepMix);
  colour *= 1.0 + (sin(a) * .009 + sin(b) * .006) * detail;
  colour = mix(colour, uSky, fresnel * .28);
  vec3 halfLight = normalize(viewDirection + normalize(vec3(8.0, 22.0, 15.0)));
  float glint = pow(max(dot(normal, halfLight), 0.0), 100.0) * detail;
  colour += vec3(1.0, .94, .75) * glint * mix(.055, .018, uDusk) * uSun;
  // Moonlight breaks into the existing moving normals; no reflection pass.
  vec3 moonHalf = normalize(viewDirection + uMoonDirection);
  float moonGlint = pow(max(dot(normal, moonHalf), 0.0), 180.0);
  colour += vec3(.07, .10, .14) * moonGlint * uNightLight * smoothstep(.2, 1.4, depth);

  // A broken, soft wash tied to the signed distance from actual exposed land.
  float surge = (.065 + uWind * .11) * sin(uDrift * .68 + dot(p, along) * .8);
  float wash = exp(-pow((shore - .16 - surge) / (.27 + uWind * .12), 2.0));
  float lace = .64 + .18 * sin(p.x * 7.0 + sin(p.y * 4.0) + uTime * .45) + .12 * sin(p.y * 9.0 - uTime * .6);
  float foam = wash * lace * smoothstep(-.1, .08, shore) * detail;
  // Isolated pieces of a narrow crest, broken by nonperiodic world-space
  // noise. Intersecting the two wave trains produced a visible oval lattice.
  float breakup = oceanBreakup(vec2(dot(p, along) * .3 - uDrift * .06, dot(p, across) * .57));
  float crest = pow(max(0.0, sin(a + breakup * 2.6)), 48.0);
  float whitecaps = crest * smoothstep(.5, .79, breakup) * smoothstep(.56, .95, uWind + uGust * .18);
  float crestDetail = 1.0 - smoothstep(.05, .2, footprint);
  foam += whitecaps * smoothstep(.3, 1.2, depth) * .085 * crestDetail;
  colour = mix(colour, uFoam, foam * .56);
  float impacts = 0.0;
  // The branch is uniform across the ocean, so clear weather skips all drop
  // work. A phone uses one impact field alongside its two normal layers.
  if (uRain > .001) {
    impacts = rainRing(p * 2.2, uTime);
    #ifndef MOBILE_WATER
      impacts += rainRing(p * 2.7 + vec2(21.37, 43.91), uTime * .93) * .45;
    #endif
  }
  // Individual drops belong to close shoreline views. Resolve them out before
  // their subpixel rings merge into dots in the island overview.
  float impactDetail = 1.0 - smoothstep(.018, .055, footprint);
  impacts *= uRain * impactDetail * smoothstep(.025, .12, depth);
  colour = mix(colour, uFoam, impacts * .1);
  colour += vec3(.33, .39, .46) * uLightning * (.04 + fresnel * .11);
  float opacity = mix(.25, .995, 1.0 - exp(-depth * .72));
  // Account for the camera's oblique view of the bottom: fading only at the
  // surface's XZ position exposes the far edge of the finite seabed.
  vec2 bottomXZ = p - viewDirection.xz * depth / max(viewDirection.y, .2);
  vec2 bottomUV = (bottomXZ - uDepthBounds.xy) / uDepthBounds.zw;
  float seabedVisibility = min(bathymetry.b, texture2D(uDepth, bottomUV).b);
  opacity = mix(1.0, opacity, smoothstep(0.0, 1.0, seabedVisibility) * inside);
  opacity = max(opacity, foam * .7);
  gl_FragColor = vec4(colour, opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`

export function createIslandWater(model: THREE.Object3D) {
  const depth = bakeWaterDepth(model)
  const time = { value: 0 }
  const dusk = { value: 0 }
  const sun = { value: 1 }
  const stormColour = new THREE.Color()
  const material = new THREE.ShaderMaterial({
    name: 'Island water', vertexShader: VERTEX, fragmentShader: FRAGMENT,
    transparent: true, depthWrite: false, fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uDepth: { value: depth.texture }, uDepthBounds: { value: depth.bounds }, uTime: time, uDusk: dusk,
      uDrift: { value: 0 }, uWind: { value: .2 }, uGust: { value: 0 }, uRain: { value: 0 }, uSun: sun,
      uLightning: { value: 0 }, uWindDirection: { value: new THREE.Vector2(.8, .6) },
      uNightLight: { value: 0 }, uMoonDirection: { value: MOON_DIRECTION.clone() },
      uShallow: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() },
      uFoam: { value: new THREE.Color() }, uSky: { value: new THREE.Color() },
    },
  })
  const setPalette = (evening: boolean | number, weather?: IslandWeather) => {
    const blend = THREE.MathUtils.clamp(Number(evening), 0, 1)
    dusk.value = blend
    material.uniforms.uNightLight.value = THREE.MathUtils.smoothstep(blend, .25, 1) * (1 - THREE.MathUtils.smoothstep(weather?.cloud ?? 0, .3, .94))
    for (const colour of WATER_COLOURS) {
      stormColour.lerpColors(colour.storm, colour.stormDusk, blend)
      material.uniforms[colour.name].value.lerpColors(colour.day, colour.dusk, blend).lerp(stormColour, weather?.cloud ?? 0)
    }
  }
  setPalette(false)
  return {
    material, time, dusk, sun, setPalette,
    update(delta: number, reduced: boolean, paused: boolean, weather?: IslandWeather) {
      if (weather) {
        // The shared driver owns progression; every consumer sees exactly the
        // same gust and active clock after readers, Still, and tab suspension.
        time.value = weather.time
        material.uniforms.uDrift.value = weather.drift
        material.uniforms.uWind.value = weather.wind
        material.uniforms.uGust.value = weather.gust
        material.uniforms.uRain.value = weather.rain
        material.uniforms.uLightning.value = weather.lightning
        material.uniforms.uWindDirection.value.set(weather.windX, weather.windZ)
        sun.value = weather.sun
      } else if (!reduced && !paused && Number.isFinite(delta) && delta > 0) {
        time.value += Math.min(delta, .05)
        material.uniforms.uDrift.value = time.value
      }
    },
    dispose() { material.dispose(); depth.texture.dispose() },
  }
}

/** Patch only owned sand materials; keep their real texture, lighting and shadows. */
export function attachSandCaustics(model: THREE.Object3D, water: ReturnType<typeof createIslandWater>) {
  const materials = new Set<THREE.MeshStandardMaterial>()
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !/^Groundplane_/.test(object.name)) return
    const list = Array.isArray(object.material) ? object.material : [object.material]
    list.forEach(material => {
      if (material instanceof THREE.MeshStandardMaterial && /^M_Sand/.test(material.name)) materials.add(material)
    })
  })
  const restore: (() => void)[] = []
  materials.forEach(material => {
    restore.push(attachMaterialEffect(material, 'island-caustics-v2', shader => {
      shader.uniforms.uWaterTime = water.time
      shader.uniforms.uWaterDusk = water.dusk
      shader.uniforms.uWaterSun = water.sun
      shader.vertexShader = 'varying vec3 vSandWorld;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSandWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = `varying vec3 vSandWorld;\nuniform float uWaterTime;\nuniform float uWaterDusk;\nuniform float uWaterSun;\n${CAUSTICS}\n` + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float waterDepth = ${WATER_LEVEL} - vSandWorld.y;
        float shallows = smoothstep(.02, .18, waterDepth) * (1.0 - smoothstep(.8, 2.0, waterDepth));
        float pattern = sandCaustic(vSandWorld.xz, uWaterTime);
        pattern *= 1.0 - smoothstep(.12, .5, max(length(dFdx(vSandWorld.xz)), length(dFdy(vSandWorld.xz))));
        diffuseColor.rgb *= 1.0 + pattern * shallows * mix(.22, .045, uWaterDusk) * uWaterSun * uWaterSun;
      `)
    }))
  })
  return () => restore.forEach(reset => reset())
}

import * as THREE from 'three'
import { bakeWaterDepth, WATER_LEVEL, DEPTH_MIN, DEPTH_RANGE, SHORE_RANGE } from './water-depth'

const WATER_COLOURS = [
  ['uShallow', '#62c9ba', '#386f76'], ['uDeep', '#145d64', '#122f3d'],
  ['uFoam', '#e2edda', '#8cb6ba'], ['uSky', '#afd4d0', '#526879'],
].map(([name, day, dusk]) => ({ name, day: new THREE.Color(day), dusk: new THREE.Color(dusk) }))

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
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uSky;
varying vec3 vWaterWorld;
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
  float warp = sin(dot(p, vec2(.24, .17)) + uTime * .18) * .85;
  float a = dot(p, vec2(1.7, .8)) + uTime * .72 + warp;
  float b = dot(p, vec2(-1.1, 2.3)) - uTime * .56 - warp * .65;
  vec2 slope = cos(a) * vec2(1.7, .8) * .032 + cos(b) * vec2(-1.1, 2.3) * .018;
  #ifndef MOBILE_WATER
    slope += cos(dot(p, vec2(4.1, -2.8)) + uTime * .83) * vec2(4.1, -2.8) * .006;
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
  vec3 halfLight = normalize(viewDirection + normalize(vec3(.35, .85, .38)));
  float glint = pow(max(dot(normal, halfLight), 0.0), 100.0) * detail;
  colour += vec3(1.0, .94, .75) * glint * mix(.055, .018, uDusk);

  // A broken, soft wash tied to the signed distance from actual exposed land.
  float surge = .08 * sin(uTime * .68 + p.x * .7 + p.y * .4);
  float wash = exp(-pow((shore - .16 - surge) / .29, 2.0));
  float lace = .64 + .18 * sin(p.x * 7.0 + sin(p.y * 4.0) + uTime * .45) + .12 * sin(p.y * 9.0 - uTime * .6);
  float foam = wash * lace * smoothstep(-.1, .08, shore) * detail;
  colour = mix(colour, uFoam, foam * .56);
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
  const material = new THREE.ShaderMaterial({
    name: 'Island water', vertexShader: VERTEX, fragmentShader: FRAGMENT,
    transparent: true, depthWrite: false, fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uDepth: { value: depth.texture }, uDepthBounds: { value: depth.bounds }, uTime: time, uDusk: dusk,
      uShallow: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() },
      uFoam: { value: new THREE.Color() }, uSky: { value: new THREE.Color() },
    },
  })
  const setPalette = (evening: boolean | number) => {
    const blend = THREE.MathUtils.clamp(Number(evening), 0, 1)
    dusk.value = blend
    for (const colour of WATER_COLOURS) material.uniforms[colour.name].value.lerpColors(colour.day, colour.dusk, blend)
  }
  setPalette(false)
  return {
    material, time, dusk, setPalette,
    update(delta: number, reduced: boolean, paused: boolean) {
      if (!reduced && !paused && Number.isFinite(delta) && delta > 0) time.value += Math.min(delta, .05)
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
    const compile = material.onBeforeCompile, key = material.customProgramCacheKey
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer)
      shader.uniforms.uWaterTime = water.time
      shader.uniforms.uWaterDusk = water.dusk
      shader.vertexShader = 'varying vec3 vSandWorld;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSandWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = `varying vec3 vSandWorld;\nuniform float uWaterTime;\nuniform float uWaterDusk;\n${CAUSTICS}\n` + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float waterDepth = ${WATER_LEVEL} - vSandWorld.y;
        float shallows = smoothstep(.02, .18, waterDepth) * (1.0 - smoothstep(.8, 2.0, waterDepth));
        float pattern = sandCaustic(vSandWorld.xz, uWaterTime);
        pattern *= 1.0 - smoothstep(.12, .5, max(length(dFdx(vSandWorld.xz)), length(dFdy(vSandWorld.xz))));
        diffuseColor.rgb *= 1.0 + pattern * shallows * mix(.22, .045, uWaterDusk);
      `)
    }
    material.customProgramCacheKey = () => `${key.call(material)}-island-caustics-v1`
    material.needsUpdate = true
    restore.push(() => { material.onBeforeCompile = compile; material.customProgramCacheKey = key; material.needsUpdate = true })
  })
  return () => restore.forEach(reset => reset())
}

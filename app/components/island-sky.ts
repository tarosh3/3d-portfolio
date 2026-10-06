import * as THREE from 'three'
import { DAY_HORIZON, DUSK_HORIZON } from './day-cycle'
import { createCloudGeometry } from './cloud-geometry'
import { createSkyNoise, setWeatherHorizon } from './sky-atmosphere'
import type { IslandWeather } from './island-weather'

const SKY_COLOURS = [
  { name: 'uHorizon', day: DAY_HORIZON, dusk: DUSK_HORIZON },
  { name: 'uZenith', day: new THREE.Color('#78afc9'), dusk: new THREE.Color('#15243e') },
  { name: 'uCloud', day: new THREE.Color('#f1f4ef'), dusk: new THREE.Color('#77839b') },
]
const OVERCAST_ZENITH = [new THREE.Color('#738994'), new THREE.Color('#1c2d42')]
const OVERCAST_CLOUD = [new THREE.Color('#aebdc1'), new THREE.Color('#53647a')]
const CLOUD_BASE = [new THREE.Color('#9aafb9'), new THREE.Color('#3b4b66')]
const STORM_BASE = [new THREE.Color('#526875'), new THREE.Color('#223348')]
const SUN_GLOW = [new THREE.Color('#ffe2a9'), new THREE.Color('#b9877e')]

// One field used for the visible sky and celestial occlusion. Clouds live on
// two distant atmospheric layers; the horizon fade hides the projection limit.
const CLOUD_FIELD = /* glsl */`
  uniform sampler2D uNoise;
  uniform float uCover, uDrift, uHorizonDip;
  uniform vec2 uWind;
  vec3 cloudField(vec3 direction) {
    float altitude = max(direction.y + uHorizonDip, 0.0);
    vec2 flow = uWind * uDrift;
    vec2 uv = direction.xz / (altitude + .24) * .24 - flow;
    vec4 lower = texture2D(uNoise, uv);
    vec4 upper = texture2D(uNoise, uv * 1.67 + vec2(.31, .59) - flow * .32);
    float shape = lower.r * .84 + upper.g * .16;
    float threshold = mix(.54, .27, uCover);
    float bank = smoothstep(threshold - .07, threshold + .12, shape);
    float high = smoothstep(.55, .72, upper.r + lower.g * .13) * .3;
    float ceiling = smoothstep(.3, .94, uCover) * (.86 + upper.r * .14);
    float density = max(max(bank, high), ceiling);
    // The overview only sees a few degrees of sky. Preserve detail there,
    // leaving a narrow continuous fog band at the visible ocean horizon.
    float haze = smoothstep(.0, .018, altitude);
    return vec3(density * haze, shape, upper.r);
  }
`

/** Gradient and celestial lights share the same palette value as fog and water. */
export function createIslandSky() {
  const time = { value: 0 }, night = { value: 0 }
  const noise = createSkyNoise()
  const atmosphere = {
    uNoise: { value: noise }, uCover: { value: 0 }, uDrift: { value: 0 }, uHorizonDip: { value: 0 },
    uWind: { value: new THREE.Vector2(.8, .6) },
  }
  const paletteScratch = new THREE.Color()
  const material = new THREE.ShaderMaterial({
    name: 'Island gradient sky', side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: {
      uHorizon: { value: new THREE.Color() }, uZenith: { value: new THREE.Color() },
      uCloud: { value: new THREE.Color() }, uCloudBase: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() }, uDusk: { value: 0 }, uFlash: { value: 0 },
      ...atmosphere,
    },
    vertexShader: /* glsl */`
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uHorizon, uZenith, uCloud, uCloudBase, uGlow;
      uniform float uDusk, uFlash;
      varying vec3 vDirection;
      ${CLOUD_FIELD}
      void main() {
        vec3 direction = normalize(vDirection);
        float altitude = max(direction.y + uHorizonDip, 0.0);
        vec3 colour = mix(uHorizon, uZenith, smoothstep(0.0, .72, altitude));
        float sunFacing = max(dot(direction, normalize(vec3(11.0, 18.0, 17.0))), 0.0);
        float scatter = pow(sunFacing, 8.0) * (.12 + uDusk * .12) * (1.0 - uCover);
        colour = mix(colour, uGlow, scatter);
        vec3 field = cloudField(direction);
        float density = field.x;
        // Higher density gives darker bases, while broken edges catch sunlight.
        float relief = smoothstep(.28, .72, field.y * .7 + field.z * .3);
        float base = clamp(.38 + density * .25 - relief * .52 + uCover * .2, .03, .91);
        vec3 cloud = mix(uCloud, uCloudBase, base);
        float silver = pow(1.0 - density, 2.0) * pow(sunFacing, 4.0) * (1.0 - uCover) * .12;
        cloud += uGlow * silver;
        cloud += vec3(.53, .63, .76) * uFlash * (.22 + field.z * .25);
        cloud = mix(uHorizon, cloud, smoothstep(.002, .045, altitude));
        colour = mix(colour, cloud, density);
        gl_FragColor = vec4(colour, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
  // Deterministic sparse upper hemisphere. No stars under the ocean/horizon.
  const positions = new Float32Array(170 * 3), brightness = new Float32Array(170)
  let seed = 421
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  for (let i = 0; i < 170; i++) {
    const y = .055 + random() * .92, angle = random() * Math.PI * 2
    const radius = Math.sqrt(1 - y * y)
    positions.set([Math.cos(angle) * radius * 180, y * 180, Math.sin(angle) * radius * 180], i * 3)
    brightness[i] = .45 + random() * .55
  }
  const stars = new THREE.BufferGeometry()
  stars.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  stars.setAttribute('brightness', new THREE.BufferAttribute(brightness, 1))
  const starMaterial = new THREE.ShaderMaterial({
    name: 'Dusk stars', transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uNight: night, ...atmosphere },
    vertexShader: /* glsl */`
      attribute float brightness;
      varying float vBrightness;
      varying vec3 vDirection;
      void main() {
        vBrightness = brightness;
        vDirection = position;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = clamp(310.0 / max(1.0, -view.z), 1.0, 2.8);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uNight;
      varying float vBrightness;
      varying vec3 vDirection;
      ${CLOUD_FIELD}
      void main() {
        float alpha = 1.0 - smoothstep(.2, .5, length(gl_PointCoord - .5));
        float clear = 1.0 - cloudField(normalize(vDirection)).x;
        gl_FragColor = vec4(vec3(.9, .94, 1.0), alpha * vBrightness * uNight * clear);
        #include <colorspace_fragment>
      }
    `,
  })
  const moonMaterial = new THREE.ShaderMaterial({
    name: 'Dusk crescent moon', transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uNight: night, ...atmosphere },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uNight;
      varying vec2 vUv;
      ${CLOUD_FIELD}
      void main() {
        vec2 p = vUv - .5;
        float edge = max(fwidth(length(p)), .003);
        float disc = 1.0 - smoothstep(.4 - edge, .4 + edge, length(p));
        float cutout = smoothstep(.37 - edge, .37 + edge, length(p - vec2(.15, .07)));
        float clear = 1.0 - cloudField(normalize(vec3(-112.0, 12.0, -120.0))).x;
        gl_FragColor = vec4(vec3(1.0, .92, .72), disc * cutout * uNight * clear);
        #include <colorspace_fragment>
      }
    `,
  })
  const setPalette = (dusk: boolean | number, weather?: IslandWeather) => {
    const blend = THREE.MathUtils.clamp(Number(dusk), 0, 1)
    for (const colour of SKY_COLOURS) material.uniforms[colour.name].value.lerpColors(colour.day, colour.dusk, blend)
    const cover = weather?.cloud ?? 0
    setWeatherHorizon(material.uniforms.uHorizon.value, blend, weather)
    material.uniforms.uZenith.value.lerp(paletteScratch.lerpColors(OVERCAST_ZENITH[0], OVERCAST_ZENITH[1], blend), cover)
    material.uniforms.uCloud.value.lerp(paletteScratch.lerpColors(OVERCAST_CLOUD[0], OVERCAST_CLOUD[1], blend), cover)
    material.uniforms.uCloudBase.value.lerpColors(CLOUD_BASE[0], CLOUD_BASE[1], blend)
      .lerp(paletteScratch.lerpColors(STORM_BASE[0], STORM_BASE[1], blend), cover)
    material.uniforms.uGlow.value.lerpColors(SUN_GLOW[0], SUN_GLOW[1], blend)
    material.uniforms.uDusk.value = blend
    material.uniforms.uFlash.value = weather?.lightning ?? 0
    atmosphere.uCover.value = cover
    atmosphere.uWind.value.set(weather?.windX ?? .8, weather?.windZ ?? .6)
    atmosphere.uDrift.value = (weather?.drift ?? time.value) * .0026
    night.value = THREE.MathUtils.smoothstep(blend, .25, 1) * (1 - THREE.MathUtils.smoothstep(cover, .3, .94))
  }
  setPalette(false)
  return {
    material, time, night, stars, starMaterial, moonMaterial, setPalette,
    setViewHeight(height: number) {
      // From overview, the top view ray is below world-horizontal. Match the
      // finite ocean's distant fog edge instead of hiding the whole cloud field
      // above that ray. At beach height this approaches the natural horizon.
      atmosphere.uHorizonDip.value = THREE.MathUtils.clamp((height - 2.08) / 240, 0, .25)
    },
    update(delta: number, reduced: boolean, paused: boolean) {
      if (!reduced && !paused && Number.isFinite(delta) && delta > 0) time.value += Math.min(delta, .05)
    },
    dispose() { material.dispose(); noise.dispose(); stars.dispose(); starMaterial.dispose(); moonMaterial.dispose() },
  }
}

// Position, width/height/depth scale and heading. A shared shape is repeated
// only across opposite banks, with varied proportions and orientation.
const BANKS = [
  [-45, 13, -30, 9.4, 8.6, 8.8, .3], [-65, 15, 8, 8.2, 7.8, 9.2, 1.0],
  [-13, 14, -63, 10.2, 8.3, 8.1, -.25], [45, 16, -55, 8.7, 9.0, 9.5, -.6],
  [65, 14, 40, 10.0, 8.8, 8.4, .85], [-25, 14, 65, 9.0, 7.8, 9.3, -.45],
]

/** Six joined silhouettes in three small instanced draws. No transparent layers. */
export function createCloudBanks() {
  const geometries = [0, 1, 2].map(createCloudGeometry)
  const material = new THREE.MeshStandardMaterial({
    name: 'Soft cloud daylight', color: '#fff8e7', roughness: 1,
    emissive: '#fff8e7', emissiveIntensity: .12,
    flatShading: false, transparent: false, depthWrite: true,
  })
  const group = new THREE.Group()
  group.name = 'Slow drifting cloud banks'
  const meshes = geometries.map((geometry, index) => {
    const mesh = new THREE.InstancedMesh(geometry, material, 2)
    mesh.name = `Joined cloud silhouette ${index + 1}`
    mesh.frustumCulled = false
    mesh.raycast = () => {}
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    group.add(mesh)
    return mesh
  })
  const transform = new THREE.Object3D()
  let previousTime = NaN
  const update = (time: number, colour: THREE.Color) => {
    material.color.copy(colour)
    material.emissive.copy(colour)
    // Still and reader demand frames can change the palette without uploading
    // frozen instance transforms. Reuse the same six matrices during drift.
    if (time === previousTime || !Number.isFinite(time)) return
    previousTime = time
    for (let i = 0; i < BANKS.length; i++) {
      const base = BANKS[i]
      const x = base[0] + Math.sin(time * .018 + i * 1.7) * 8
      const z = base[2] + Math.sin(time * .014 + i * 2.1) * 5
      transform.position.set(x, base[1], z)
      transform.scale.set(base[3], base[4], base[5])
      transform.rotation.set(0, base[6], 0)
      transform.updateMatrix()
      meshes[i % 3].setMatrixAt(Math.floor(i / 3), transform.matrix)
    }
    for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true
  }
  update(0, SKY_COLOURS[2].day)
  return {
    group, meshes, update,
    dispose() { for (const mesh of meshes) mesh.dispose(); for (const geometry of geometries) geometry.dispose(); material.dispose() },
  }
}

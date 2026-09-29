import * as THREE from 'three'
import { DAY_HORIZON, DUSK_HORIZON } from './day-cycle'
import { createCloudGeometry } from './cloud-geometry'

const SKY_COLOURS = [
  { name: 'uHorizon', day: DAY_HORIZON, dusk: DUSK_HORIZON },
  { name: 'uZenith', day: new THREE.Color('#78adc2'), dusk: new THREE.Color('#15243e') },
  { name: 'uCloud', day: new THREE.Color('#fff8e7'), dusk: new THREE.Color('#7b829a') },
]

/** Gradient and celestial lights share the same palette value as fog and water. */
export function createIslandSky() {
  const time = { value: 0 }, night = { value: 0 }
  const material = new THREE.ShaderMaterial({
    name: 'Island gradient sky', side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: {
      uHorizon: { value: new THREE.Color() }, uZenith: { value: new THREE.Color() },
      uCloud: { value: new THREE.Color() },
    },
    vertexShader: /* glsl */`
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uHorizon, uZenith;
      varying vec3 vDirection;
      void main() {
        float altitude = max(normalize(vDirection).y, 0.0);
        vec3 colour = mix(uHorizon, uZenith, smoothstep(0.0, .65, altitude));
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
    uniforms: { uNight: night },
    vertexShader: /* glsl */`
      attribute float brightness;
      varying float vBrightness;
      void main() {
        vBrightness = brightness;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = clamp(310.0 / max(1.0, -view.z), 1.0, 2.8);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uNight;
      varying float vBrightness;
      void main() {
        float alpha = 1.0 - smoothstep(.2, .5, length(gl_PointCoord - .5));
        gl_FragColor = vec4(vec3(.9, .94, 1.0), alpha * vBrightness * uNight);
        #include <colorspace_fragment>
      }
    `,
  })
  const moonMaterial = new THREE.ShaderMaterial({
    name: 'Dusk crescent moon', transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uNight: night },
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
      void main() {
        vec2 p = vUv - .5;
        float edge = max(fwidth(length(p)), .003);
        float disc = 1.0 - smoothstep(.4 - edge, .4 + edge, length(p));
        float cutout = smoothstep(.37 - edge, .37 + edge, length(p - vec2(.15, .07)));
        gl_FragColor = vec4(vec3(1.0, .92, .72), disc * cutout * uNight);
        #include <colorspace_fragment>
      }
    `,
  })
  const setPalette = (dusk: boolean | number) => {
    const blend = THREE.MathUtils.clamp(Number(dusk), 0, 1)
    for (const colour of SKY_COLOURS) material.uniforms[colour.name].value.lerpColors(colour.day, colour.dusk, blend)
    night.value = THREE.MathUtils.smoothstep(blend, .25, 1)
  }
  setPalette(false)
  return {
    material, time, night, stars, starMaterial, moonMaterial, setPalette,
    update(delta: number, reduced: boolean, paused: boolean) {
      if (!reduced && !paused && Number.isFinite(delta) && delta > 0) time.value += Math.min(delta, .05)
    },
    dispose() { material.dispose(); stars.dispose(); starMaterial.dispose(); moonMaterial.dispose() },
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

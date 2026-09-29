'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { castsIslandShadow } from './island-rendering'
import type { DayCycle } from './day-cycle'

type Props = {
  reduced: boolean
  paused: boolean
  cycle: DayCycle
  mobile?: boolean
  onDiscover: (id: string) => void
  onReady?: (model: THREE.Group) => void
}

type Motion = { pivot: THREE.Group; origin: THREE.Vector3 }
type FishMotion = Motion & { forward: THREE.Vector3; side: THREE.Vector3; speed: number; radius: number }
type WindMotion = Motion & { phase: number; speed: number; strength: number }
type Discovery = { materials: THREE.MeshStandardMaterial[]; colors: THREE.Color[]; intensities: number[] }
type FireflyField = { geometry: THREE.BufferGeometry; base: Float32Array; phase: Float32Array; speed: Float32Array }

const UP = new THREE.Vector3(0, 1, 0)
const NESSIE = /^Nessie\d?$/

// Measured from the top vertices of all eight authored torch flames. Torch2
// contains six torches in one baked mesh; its bounding-box center is not a flame.
const TORCH_TIPS: [number, number, number][] = [
  [-2.441, 4.015, 1.941], [-.025, 4.055, -7.769],
  [1.606, 4.055, -5.373], [-3.022, 4.055, -9.013],
  [-.904, 4.02, 2.656], [1.606, 4.1, -2.58],
  [-5.852, 4.02, -.846], [-6.457, 4.07, -2.156],
]

/** Reparent an authored node beneath a world-space pivot without changing its pose. */
function createPivot(model: THREE.Group, object: THREE.Object3D, world: THREE.Vector3): Motion {
  const pivot = new THREE.Group()
  pivot.name = `${object.name}-ambient-pivot`
  model.add(pivot)
  pivot.position.copy(model.worldToLocal(world.clone()))
  pivot.updateMatrixWorld(true)
  // Move the semantic node, not its mesh: fish have nonuniform local scales,
  // while the ancestors being removed have uniform scale. attach preserves it.
  pivot.attach(object)
  return { pivot, origin: pivot.position.clone() }
}

function ropeAxis(model: THREE.Group) {
  const rope = model.getObjectByName('Hammock_M_Ropes_0')
  if (!(rope instanceof THREE.Mesh)) return null
  const positions = rope.geometry.getAttribute('position')
  rope.geometry.computeBoundingBox()
  const bounds = rope.geometry.boundingBox
  if (!bounds) return null
  const threshold = (bounds.max.x - bounds.min.x) * .01
  const ends = [new THREE.Vector3(), new THREE.Vector3()]
  const counts = [0, 0]
  const point = new THREE.Vector3()
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i)
    const end = point.x < bounds.min.x + threshold ? 0 : point.x > bounds.max.x - threshold ? 1 : -1
    if (end === -1) continue
    ends[end].add(point.applyMatrix4(rope.matrixWorld))
    counts[end]++
  }
  if (!counts[0] || !counts[1]) return null
  ends.forEach((point, i) => point.divideScalar(counts[i]))
  return { center: ends[0].clone().lerp(ends[1], .5), axis: ends[1].clone().sub(ends[0]).normalize() }
}

function prepareIsland(source: THREE.Group) {
  const model = source.clone(true)
  const ownedMaterials = new Set<THREE.Material>()
  const materialCopies = new Map<THREE.Material, THREE.Material>()
  const lights: THREE.MeshStandardMaterial[] = []
  const discoveries = new Map<string, Discovery>()
  const fishNodes: THREE.Object3D[] = []
  const birds: THREE.Object3D[] = []
  const leafNodes: THREE.Object3D[] = []

  model.updateMatrixWorld(true)
  model.traverse(object => {
    if (/^Fish\d*$/.test(object.name)) fishNodes.push(object)
    if (/^Seagull\d+$/.test(object.name)) birds.push(object)
    // Each palm crown is a separate authored leaf mesh. Animate those meshes
    // through owned pivots so trunks, shared atlases, and house details stay
    // untouched.
    if (object instanceof THREE.Mesh && /_M_PalmTreeLeaves_0$/.test(object.name)) leafNodes.push(object)
    if (!(object instanceof THREE.Mesh)) return
    // The shared shader ocean replaces the authored transmission water. Hide
    // only this cloned mesh; keep seabed, fish and the cached GLTF untouched.
    if (object.name === 'Water_M_Water_0') { object.visible = false; object.raycast = () => {} }
    object.receiveShadow = true
    object.castShadow = castsIslandShadow(object.name)

    // The original PNGs and optimized WebPs for M_Plants, M_PalmTreeLeaves,
    // and M_Torch are RGB, without alpha. alphaTest would have no effect.
    // Preserve these atlases rather than guessing a color-key or deleting cards.
    const original: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material]
    const discoveryId = object.name.match(/^(Nessie\d?)_/)?.[1]
    const copies = original.map(material => {
      let copy = discoveryId ? undefined : materialCopies.get(material)
      if (!copy) {
        copy = material.clone()
        ownedMaterials.add(copy)
        if (!discoveryId) materialCopies.set(material, copy)
        if (/^M_Light_/.test(copy.name) && copy instanceof THREE.MeshStandardMaterial) lights.push(copy)
      }
      return copy
    })
    object.material = Array.isArray(object.material) ? copies : copies[0]
    object.userData.islandBloom = copies.some(material => /^M_Light_/.test(material.name))
    if (discoveryId && NESSIE.test(discoveryId)) {
      object.userData.discoveryId = discoveryId
      const materials = copies.filter((material): material is THREE.MeshStandardMaterial => material instanceof THREE.MeshStandardMaterial)
      discoveries.set(discoveryId, {
        materials,
        colors: materials.map(material => material.emissive.clone()),
        intensities: materials.map(material => material.emissiveIntensity),
      })
    }

    // The modest, previously measured clearing retains both ferns and the
    // original chalkboard. Convert the world offset through the .01 hierarchy.
    const offset = object.name === 'Bush15_M_Plants_0' ? [-.35, 0, -.1] : object.name === 'Bush33_M_Plants_0' ? [.45, 0, -.1] : null
    if (offset && object.parent) {
      const world = object.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(...offset))
      object.position.copy(object.parent.worldToLocal(world))
    }
  })
  model.updateMatrixWorld(true)

  const fish: FishMotion[] = fishNodes.map((object, i) => {
    const center = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3())
    const forward = new THREE.Vector3(1, 0, 0).transformDirection(object.matrixWorld)
    forward.y = 0
    forward.normalize()
    return {
      ...createPivot(model, object, center),
      forward,
      side: new THREE.Vector3().crossVectors(UP, forward),
      speed: .16 + (i % 4) * .012,
      radius: .24 + (i % 3) * .035,
    }
  })

  const gulls = birds.map(object => {
    const bounds = new THREE.Box3().setFromObject(object)
    const foot = bounds.getCenter(new THREE.Vector3())
    foot.y = bounds.min.y
    return createPivot(model, object, foot)
  })

  const wind: WindMotion[] = leafNodes.map((object, i) => ({
    ...createPivot(model, object, object.getWorldPosition(new THREE.Vector3())),
    phase: i * 1.73,
    speed: .42 + (i % 5) * .035,
    strength: .018 + (i % 4) * .004,
  }))

  const hammockObject = model.getObjectByName('Hammock')
  const attachment = ropeAxis(model)
  const hammock = hammockObject && attachment ? {
    ...createPivot(model, hammockObject, attachment.center),
    axis: attachment.axis,
  } : null

  const campfire = model.getObjectByName('BurnedCampfire1_M_Fillers_0')
  const embers: THREE.Vector3[] = []
  if (campfire instanceof THREE.Mesh) {
    const bounds = new THREE.Box3().setFromObject(campfire)
    const center = bounds.getCenter(new THREE.Vector3())
    const ray = new THREE.Raycaster()
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.39996
      const radius = .04 + (i % 3) * .055
      ray.set(new THREE.Vector3(center.x + Math.cos(angle) * radius, bounds.max.y + .1, center.z + Math.sin(angle) * radius), new THREE.Vector3(0, -1, 0))
      const hit = ray.intersectObject(campfire, false)[0]
      if (hit) embers.push(hit.point.add(new THREE.Vector3(0, .009, 0)))
    }
  }
  model.updateMatrixWorld(true)
  // Authored transforms are static. Only our ambient pivots need to compose
  // local matrices every frame; children still inherit their world transforms.
  model.traverse(object => {
    object.updateMatrix()
    object.matrixAutoUpdate = object.name.endsWith('-ambient-pivot')
  })
  return { model, ownedMaterials, lights, discoveries, fish, gulls, wind, hammock, embers }
}

export default function LivingIsland({ reduced, paused, cycle, mobile = false, onDiscover, onReady }: Props) {
  const { scene } = useGLTF('/island-optimized.glb')
  const island = useMemo(() => prepareIsland(scene), [scene])
  const { gl, invalidate } = useThree()
  const time = useRef(0)
  const hovered = useRef<string | null>(null)
  const fireLight = useRef<THREE.PointLight>(null)
  const fireflyMaterial = useRef<THREE.PointsMaterial>(null)
  const moteMaterial = useRef<THREE.PointsMaterial>(null)
  const emberGroup = useRef<THREE.Group>(null)
  const emberMaterials = useRef<THREE.MeshBasicMaterial[]>([])
  const fireflies = useMemo<FireflyField>(() => {
    const count = mobile ? 18 : 34
    const base = new Float32Array(count * 3)
    const phase = new Float32Array(count)
    const speed = new Float32Array(count)
    let seed = 17
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    for (let i = 0; i < count; i++) {
      const lagoon = i < count * .58
      base[i * 3] = lagoon ? 5.2 + random() * 6.2 : -1.8 + random() * 6.8
      base[i * 3 + 1] = 3.05 + random() * 2.25
      base[i * 3 + 2] = lagoon ? -1.2 + random() * 5.4 : 3.1 + random() * 5.4
      phase[i] = random() * Math.PI * 2
      speed[i] = .45 + random() * .35
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3))
    return { geometry, base, phase, speed }
  }, [mobile])
  const fireflyTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 32; canvas.height = 32
    const context = canvas.getContext('2d')!
    const glow = context.createRadialGradient(16, 16, 1, 16, 16, 16)
    glow.addColorStop(0, 'rgba(255, 249, 191, 1)')
    glow.addColorStop(.28, 'rgba(255, 220, 125, .9)')
    glow.addColorStop(1, 'rgba(255, 192, 78, 0)')
    context.fillStyle = glow; context.fillRect(0, 0, 32, 32)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }, [])
  const daylightMotes = useMemo<FireflyField>(() => {
    const count = mobile ? 10 : 24
    const base = new Float32Array(count * 3)
    const phase = new Float32Array(count)
    const speed = new Float32Array(count)
    let seed = 91
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    for (let i = 0; i < count; i++) {
      base[i * 3] = -4.2 + random() * 12.5
      base[i * 3 + 1] = 3.35 + random() * 4.2
      base[i * 3 + 2] = -2.8 + random() * 11.5
      phase[i] = random() * Math.PI * 2
      speed[i] = .18 + random() * .16
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3))
    return { geometry, base, phase, speed }
  }, [mobile])

  useEffect(() => {
    onReady?.(island.model)
  }, [island, onReady])

  useEffect(() => {
    const materials: THREE.MeshBasicMaterial[] = []
    emberGroup.current?.traverse(object => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshBasicMaterial) materials.push(object.material)
    })
    emberMaterials.current = materials
  }, [island])

  useEffect(() => () => {
    // Geometry and textures belong to the useGLTF cache; only our material
    // instances are owned here. R3F must not dispose the cached source resources.
    island.ownedMaterials.forEach(material => material.dispose())
    if (gl.domElement.style.cursor === 'pointer') gl.domElement.style.cursor = ''
  }, [gl, island])

  useEffect(() => () => fireflies.geometry.dispose(), [fireflies])
  useEffect(() => () => fireflyTexture.dispose(), [fireflyTexture])
  useEffect(() => () => daylightMotes.geometry.dispose(), [daylightMotes])

  const highlight = (id: string | null) => {
    if (hovered.current === id) return
    const previous = hovered.current && island.discoveries.get(hovered.current)
    if (previous) previous.materials.forEach((material, i) => {
      material.emissive.copy(previous.colors[i])
      material.emissiveIntensity = previous.intensities[i]
    })
    const next = id && island.discoveries.get(id)
    if (next) next.materials.forEach(material => {
      material.emissive.set('#90b78c')
      material.emissiveIntensity = .28
    })
    hovered.current = id
    gl.domElement.style.cursor = id ? 'pointer' : ''
    invalidate()
  }

  const handleHover = (event: ThreeEvent<PointerEvent>) => {
    // Stop at the first actual island surface: a figure behind a house wall
    // must not become selectable through that wall.
    event.stopPropagation()
    highlight(typeof event.object.userData.discoveryId === 'string' ? event.object.userData.discoveryId : null)
  }

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    const id = event.object.userData.discoveryId
    if (!paused && event.delta <= 5 && typeof id === 'string') onDiscover(id)
  }

  useFrame((_, delta) => {
    const dusk = cycle.value
    for (const material of island.lights) material.emissiveIntensity = THREE.MathUtils.lerp(.16, 1.6, dusk)
    if (fireflyMaterial.current) fireflyMaterial.current.opacity = .82 * dusk
    if (moteMaterial.current) moteMaterial.current.opacity = .18 * (1 - dusk)
    for (const material of emberMaterials.current) material.opacity = .9 * dusk
    if (emberGroup.current) emberGroup.current.visible = dusk > 0
    const flicker = reduced ? 1 : 1 + Math.sin(time.current * 3.1) * .06 + Math.sin(time.current * 7.3) * .025
    if (fireLight.current) fireLight.current.intensity = .62 * dusk * flicker
    if (paused || reduced) return
    // Accumulated active time prevents a jump when returning from a hidden tab.
    time.current += Math.min(delta, .05)
    const t = time.current
    for (const fish of island.fish) {
      const phase = t * fish.speed
      const sideRadius = fish.radius * .48
      fish.pivot.position.copy(fish.origin)
        .addScaledVector(fish.forward, Math.sin(phase) * fish.radius)
        .addScaledVector(fish.side, (1 - Math.cos(phase)) * sideRadius)
      fish.pivot.quaternion.setFromAxisAngle(UP, Math.atan2(Math.sin(phase) * sideRadius, Math.cos(phase) * fish.radius))
    }
    island.gulls.forEach((gull, i) => {
      const phase = (t + i * 7) % (19 + i * 4)
      const look = phase < 2.8 ? Math.sin(phase / 2.8 * Math.PI) : 0
      gull.pivot.rotation.y = look * .12 * (i ? -1 : 1)
    })
    island.wind.forEach(leaf => {
      const gust = Math.sin(t * leaf.speed + leaf.phase)
      const cross = Math.cos(t * leaf.speed * .73 + leaf.phase * .61)
      leaf.pivot.rotation.x = gust * leaf.strength
      leaf.pivot.rotation.z = cross * leaf.strength * .72
    })
    if (dusk) {
      const positions = fireflies.geometry.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < fireflies.phase.length; i++) {
        const phase = t * fireflies.speed[i] + fireflies.phase[i]
        positions.array[i * 3] = fireflies.base[i * 3] + Math.sin(phase) * .14
        positions.array[i * 3 + 1] = fireflies.base[i * 3 + 1] + Math.sin(phase * .67) * .2
        positions.array[i * 3 + 2] = fireflies.base[i * 3 + 2] + Math.cos(phase * .81) * .12
      }
      positions.needsUpdate = true
    }
    const updateField = (field: FireflyField, drift: number, vertical: number) => {
      const positions = field.geometry.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < field.phase.length; i++) {
        const phase = t * field.speed[i] + field.phase[i]
        positions.array[i * 3] = field.base[i * 3] + Math.sin(phase) * drift
        positions.array[i * 3 + 1] = field.base[i * 3 + 1] + Math.sin(phase * .63) * vertical
        positions.array[i * 3 + 2] = field.base[i * 3 + 2] + Math.cos(phase * .81) * drift * .72
      }
      positions.needsUpdate = true
    }
    if (dusk < 1) updateField(daylightMotes, .12, .16)
    if (island.hammock) island.hammock.pivot.quaternion.setFromAxisAngle(island.hammock.axis, Math.sin(t * .65) * .035)
  })

  return <>
    <primitive object={island.model} dispose={null} onPointerMove={handleHover} onPointerOut={() => highlight(null)} onClick={handleClick} />
    <points geometry={fireflies.geometry} frustumCulled={false} renderOrder={4}>
      <pointsMaterial ref={fireflyMaterial} size={.16} map={fireflyTexture} color="#ffd98c" transparent opacity={0} depthWrite={false} sizeAttenuation toneMapped={false} blending={THREE.AdditiveBlending} />
    </points>
    <points geometry={daylightMotes.geometry} frustumCulled={false} renderOrder={3}>
      <pointsMaterial ref={moteMaterial} size={.12} map={fireflyTexture} color="#fff0c6" transparent opacity={.18} depthWrite={false} sizeAttenuation toneMapped={false} blending={THREE.AdditiveBlending} />
    </points>
    <group ref={emberGroup} name="island-evening-embers">
      {island.embers.map((position, i) => <mesh key={i} position={position} scale={[1, .32, .8]} userData={{ islandBloom: true }}>
        <icosahedronGeometry args={[.018 + (i % 3) * .004, 0]} />
        <meshBasicMaterial color={i % 2 ? '#ed7632' : '#ffb662'} toneMapped={false} transparent opacity={0} depthWrite={false} />
      </mesh>)}
      {TORCH_TIPS.map((position, i) => <mesh key={`torch-${i}`} position={position} scale={[.6, 1, .6]} userData={{ islandBloom: true }}>
        <icosahedronGeometry args={[.035, 1]} />
        <meshBasicMaterial color="#ffd08a" toneMapped={false} transparent opacity={.9} />
      </mesh>)}
      <pointLight ref={fireLight} position={[-.96, 2.78, 5.01]} color="#ff9b51" intensity={.62} distance={3} decay={2} />
    </group>
  </>
}

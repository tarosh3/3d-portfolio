'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { createPhoneShadowBudget, fitIslandShadow } from './island-rendering'
import type { DayCycle } from './day-cycle'

const LIGHT_COLOURS = {
  ambient: [new THREE.Color('#fffdf4'), new THREE.Color('#b9c9e2')],
  sky: [new THREE.Color('#c5edf2'), new THREE.Color('#647da3')],
  ground: [new THREE.Color('#b28a67'), new THREE.Color('#574b60')],
  sun: [new THREE.Color('#fff0d2'), new THREE.Color('#e8bfa5')],
}

export function PhoneShadowBudget({ active, onSlow }: { active: boolean; onSlow: () => void }) {
  const budget = useRef(createPhoneShadowBudget())
  const tripped = useRef(false)
  useEffect(() => { budget.current.reset() }, [active])
  useFrame((_, delta) => {
    if (!active || tripped.current) return
    if (budget.current.sample(delta)) { tripped.current = true; onSlow() }
  })
  return null
}

export default function IslandLighting({ model, mobile, cycle, shadows }: {
  model: THREE.Group | null; mobile: boolean; cycle: DayCycle; shadows: boolean
}) {
  const sun = useRef<THREE.DirectionalLight>(null)
  const ambient = useRef<THREE.AmbientLight>(null)
  const hemisphere = useRef<THREE.HemisphereLight>(null)
  const invalidate = useThree(state => state.invalidate)
  useLayoutEffect(() => {
    if (sun.current && model) { fitIslandShadow(sun.current, model); invalidate() }
  }, [model, invalidate])
  useLayoutEffect(() => {
    const light = sun.current
    if (!light) return
    // Resizing mapSize alone does not resize an already allocated Three shadow target.
    light.shadow.map?.dispose()
    light.shadow.map = null
    light.shadow.needsUpdate = true
    invalidate()
  }, [mobile, shadows, invalidate])
  useEffect(() => {
    const light = sun.current
    return () => light?.shadow.dispose()
  }, [])
  useFrame(() => {
    const t = cycle.value
    if (ambient.current) {
      ambient.current.color.lerpColors(LIGHT_COLOURS.ambient[0], LIGHT_COLOURS.ambient[1], t)
      ambient.current.intensity = THREE.MathUtils.lerp(1.18, .7, t)
    }
    if (hemisphere.current) {
      hemisphere.current.color.lerpColors(LIGHT_COLOURS.sky[0], LIGHT_COLOURS.sky[1], t)
      hemisphere.current.groundColor.lerpColors(LIGHT_COLOURS.ground[0], LIGHT_COLOURS.ground[1], t)
      hemisphere.current.intensity = THREE.MathUtils.lerp(.52, .16, t)
    }
    if (sun.current) {
      sun.current.color.lerpColors(LIGHT_COLOURS.sun[0], LIGHT_COLOURS.sun[1], t)
      sun.current.intensity = THREE.MathUtils.lerp(1.82, .65, t)
    }
  })
  return <>
    <ambientLight ref={ambient} intensity={1.18} color="#fffdf4" />
    <hemisphereLight ref={hemisphere} intensity={.52} color="#c5edf2" groundColor="#b28a67" />
    <directionalLight ref={sun} intensity={1.82} color="#fff0d2" position={[8, 22, 15]}
      castShadow={shadows} shadow-mapSize-width={mobile ? 1024 : 2048} shadow-mapSize-height={mobile ? 1024 : 2048}
      shadow-bias={-.00015} shadow-normalBias={.025} shadow-radius={2} />
  </>
}

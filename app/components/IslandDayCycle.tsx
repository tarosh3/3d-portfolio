'use client'

import { useLayoutEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { DayCycle } from './day-cycle'

export default function IslandDayCycle({ cycle, dusk, reduced, paused }: {
  cycle: DayCycle; dusk: boolean; reduced: boolean; paused: boolean
}) {
  const invalidate = useThree(state => state.invalidate)
  const fog = useMemo(() => new THREE.Fog(cycle.horizon, 65, 160), [cycle])
  useLayoutEffect(() => {
    cycle.setTarget(dusk, reduced)
    fog.color.copy(cycle.horizon)
    invalidate()
  }, [cycle, fog, dusk, reduced, invalidate])
  // Advance before any sky, lighting, water or model frame subscriber.
  useFrame((_, delta) => {
    cycle.update(delta, reduced, paused)
    fog.color.copy(cycle.horizon)
  }, -100)
  return <>
    <primitive attach="background" object={cycle.horizon} />
    <primitive attach="fog" object={fog} />
  </>
}

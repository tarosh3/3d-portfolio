'use client'

import { useLayoutEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { DayCycle } from './day-cycle'
import type { IslandWeather } from './island-weather'
import { setWeatherHorizon } from './sky-atmosphere'

export default function IslandDayCycle({ cycle, dusk, reduced, paused, weather }: {
  cycle: DayCycle; dusk: boolean; reduced: boolean; paused: boolean; weather?: IslandWeather
}) {
  const invalidate = useThree(state => state.invalidate)
  const fog = useMemo(() => new THREE.Fog(cycle.horizon, 65, 160), [cycle])
  useLayoutEffect(() => {
    cycle.setTarget(dusk, reduced)
    setWeatherHorizon(cycle.horizon, cycle.value, weather)
    fog.color.copy(cycle.horizon)
    invalidate()
  }, [cycle, fog, dusk, reduced, weather, invalidate])
  // Advance before any sky, lighting, water or model frame subscriber.
  useFrame((_, delta) => {
    cycle.update(delta, reduced, paused)
    setWeatherHorizon(cycle.horizon, cycle.value, weather)
    fog.color.copy(cycle.horizon)
    fog.near = 65 - (weather?.fog ?? 0) * 42
    fog.far = 160 - (weather?.fog ?? 0) * 80
  }, -100)
  return <>
    <primitive attach="background" object={cycle.horizon} />
    <primitive attach="fog" object={fog} />
  </>
}

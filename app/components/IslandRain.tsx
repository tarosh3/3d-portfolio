'use client'

import { useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { createIslandRain, type IslandRainResources } from './island-rain'
import type { IslandWeather } from './island-weather'
import type { DayCycle } from './day-cycle'

export default function IslandRain({ model, weather, cycle, mobile, reduced, paused, lowQuality = false, preparing = false }: {
  model: THREE.Group
  weather: IslandWeather
  cycle: DayCycle
  mobile: boolean
  reduced: boolean
  paused: boolean
  lowQuality?: boolean
  preparing?: boolean
}) {
  const host = useRef<THREE.Group>(null)
  const rain = useRef<IslandRainResources | null>(null)
  const invalidate = useThree(state => state.invalidate)
  const get = useThree(state => state.get)
  // Allocate owned GPU resources in the effect. React's Strict Mode rehearsal
  // fully releases and recreates them, while the CPU surface bake stays cached.
  useLayoutEffect(() => {
    const resources = createIslandRain(model), parent = host.current
    rain.current = resources
    parent?.add(resources.group)
    invalidate()
    return () => {
      parent?.remove(resources.group)
      if (rain.current === resources) rain.current = null
      resources.dispose()
    }
  }, [model, invalidate])
  useLayoutEffect(() => {
    const state = get()
    const pixelWorld = 2 / Math.max(1, state.size.height * state.viewport.dpr * state.camera.projectionMatrix.elements[5])
    // Layout runs before SceneReadiness's passive texture collection/compile,
    // including when the Canvas starts at frameloop="never".
    rain.current?.update(weather, cycle.value, mobile, lowQuality, reduced, paused, pixelWorld, preparing)
    invalidate()
  }, [model, weather, cycle, mobile, lowQuality, reduced, paused, preparing, get, invalidate])
  useFrame((state, delta) => {
    const resources = rain.current
    if (!resources) return
    const pixelWorld = 2 / Math.max(1, state.size.height * state.viewport.dpr * state.camera.projectionMatrix.elements[5])
    resources.update(weather, cycle.value, mobile, lowQuality, reduced, paused, pixelWorld, preparing)
    if (paused) return
    const position = state.camera.position
    const shelter = resources.shelterAt(position.x, position.y, position.z)
    weather.shelter += (shelter - weather.shelter) * (reduced ? 1 : 1 - Math.exp(-Math.min(delta, .05) * 10))
  })
  return <group ref={host} dispose={null} />
}

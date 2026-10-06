'use client'

import { useEffect, useLayoutEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { attachSandCaustics, createIslandWater } from './island-water'
import { WATER_LEVEL } from './water-depth'
import type { DayCycle } from './day-cycle'
import type { IslandWeather } from './island-weather'

const ignoreRaycast = () => {}

export default function IslandWater({ model, cycle, weather, reduced, paused, mobile }: {
  model: THREE.Group; cycle: DayCycle; weather?: IslandWeather; reduced: boolean; paused: boolean; mobile: boolean
}) {
  const water = useMemo(() => createIslandWater(model), [model])
  const invalidate = useThree(state => state.invalidate)
  useLayoutEffect(() => attachSandCaustics(model, water), [model, water])
  useLayoutEffect(() => {
    water.material.defines = mobile ? { MOBILE_WATER: 1 } : {}
    water.material.needsUpdate = true
    invalidate()
  }, [water, mobile, invalidate])
  useEffect(() => () => water.dispose(), [water])
  useFrame((_, delta) => {
    water.setPalette(cycle.value, weather)
    water.update(delta, reduced, paused, weather)
  })
  return <mesh name="Island ocean" material={water.material} rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_LEVEL, 0]} raycast={ignoreRaycast} renderOrder={-10}>
    {/* All movement is in the normals: two triangles on desktop and phone. */}
    {/* Draw before airborne transparency: the giant plane's center otherwise
        sorts ahead of distant clouds and paints over them despite their height. */}
    <planeGeometry args={[420, 420, 1, 1]} />
  </mesh>
}

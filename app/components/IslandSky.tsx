'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createIslandSky } from './island-sky'
import type { DayCycle } from './day-cycle'
import type { IslandWeather } from './island-weather'

const ignoreRaycast = () => {}

export default function IslandSky({ cycle, reduced, paused, weather, mobile = false }: {
  cycle: DayCycle; reduced: boolean; paused: boolean; weather?: IslandWeather; mobile?: boolean
}) {
  const sky = useMemo(createIslandSky, [])
  const dome = useRef<THREE.Group>(null)
  const moon = useRef<THREE.Mesh>(null)
  const stars = useRef<THREE.Points>(null)
  useEffect(() => () => sky.dispose(), [sky])
  useFrame(({ camera, viewport }, delta) => {
    dome.current?.position.copy(camera.position)
    moon.current?.quaternion.copy(camera.quaternion)
    sky.update(delta, reduced, paused, weather)
    sky.setQuality(mobile, viewport.dpr)
    sky.setViewHeight(camera.position.y)
    moon.current?.position.copy(sky.moonPosition)
    sky.setPalette(cycle.value, weather)
    if (moon.current) moon.current.visible = sky.night.value > 0
    if (stars.current) stars.current.visible = sky.night.value > 0
  })
  return <>
    <group ref={dome}>
      <mesh name="Gradient sky dome" material={sky.material} raycast={ignoreRaycast} renderOrder={100} frustumCulled={false}>
        <sphereGeometry args={[200, 24, 12]} />
      </mesh>
      <points ref={stars} name="Dusk stars" geometry={sky.stars} material={sky.starMaterial} raycast={ignoreRaycast} renderOrder={-9} frustumCulled={false} />
      <mesh ref={moon} name="Moonlight and earthshine" position={sky.moonPosition} material={sky.moonMaterial} raycast={ignoreRaycast} renderOrder={-8} frustumCulled={false}>
        <planeGeometry args={[22, 22]} />
      </mesh>
    </group>
  </>
}

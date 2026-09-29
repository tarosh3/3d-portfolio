'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createIslandSky, createCloudBanks } from './island-sky'
import type { DayCycle } from './day-cycle'

const ignoreRaycast = () => {}

export default function IslandSky({ cycle, reduced, paused }: {
  cycle: DayCycle; reduced: boolean; paused: boolean
}) {
  const sky = useMemo(createIslandSky, [])
  const clouds = useMemo(createCloudBanks, [])
  const dome = useRef<THREE.Group>(null)
  const moon = useRef<THREE.Mesh>(null)
  const stars = useRef<THREE.Points>(null)
  useEffect(() => () => { sky.dispose(); clouds.dispose() }, [sky, clouds])
  useFrame(({ camera }, delta) => {
    dome.current?.position.copy(camera.position)
    moon.current?.quaternion.copy(camera.quaternion)
    sky.setPalette(cycle.value)
    sky.update(delta, reduced, paused)
    clouds.update(sky.time.value, sky.material.uniforms.uCloud.value)
    if (moon.current) moon.current.visible = sky.night.value > 0
    if (stars.current) stars.current.visible = sky.night.value > 0
  })
  return <>
    <group ref={dome}>
      <mesh name="Gradient sky dome" material={sky.material} raycast={ignoreRaycast} renderOrder={100} frustumCulled={false}>
        <sphereGeometry args={[200, 24, 12]} />
      </mesh>
      <points ref={stars} name="Dusk stars" geometry={sky.stars} material={sky.starMaterial} raycast={ignoreRaycast} renderOrder={-8} />
      <mesh ref={moon} name="Small dusk moon" position={[-112, 12, -120]} material={sky.moonMaterial} raycast={ignoreRaycast} renderOrder={-8}>
        <planeGeometry args={[5, 5]} />
      </mesh>
    </group>
    <primitive object={clouds.group} />
  </>
}

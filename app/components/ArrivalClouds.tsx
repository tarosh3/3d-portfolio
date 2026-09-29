'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createCloudTexture } from './cloud-texture'

// A temporary, shallow layer of soft sprites. No additional assets, lights,
// postprocessing or per-frame raycasts; it unmounts when the arrival ends.
const CLOUDS = [
  [7, 45, 5, 30, 16], [25, 42, 12, 32, 18], [-10, 39, 18, 35, 17],
  [13, 38, 26, 29, 15], [34, 40, 28, 31, 16], [2, 44, -14, 34, 18],
  [31, 46, -9, 36, 18], [-20, 43, -4, 33, 16], [46, 39, 8, 28, 15],
]

export default function ArrivalClouds() {
  const group = useRef<THREE.Group>(null)
  const texture = useMemo(createCloudTexture, [])
  useEffect(() => () => texture.dispose(), [texture])
  useFrame(({ camera }) => {
    const opacity = THREE.MathUtils.smoothstep(camera.position.y, 23, 37) * .86
    group.current?.children.forEach(child => {
      ((child as THREE.Sprite).material as THREE.SpriteMaterial).opacity = opacity
    })
  })
  return <group ref={group}>
    {CLOUDS.map(([x, y, z, width, height], index) => <sprite key={index} position={[x, y, z]} scale={[width, height, 1]}>
      <spriteMaterial map={texture} transparent opacity={.86} depthWrite={false} toneMapped={false} />
    </sprite>)}
  </group>
}

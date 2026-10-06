'use client'

import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createCameraGuard } from './camera-path'
import { createArtifactBeacon } from './artifact-beacon'

/** Follow the real magazine as the camera moves, without React frame updates. */
export default function TutorialTarget({ active, model, mobile, reduced, target, onVisible }: {
  active: boolean; model: THREE.Group | null; mobile: boolean; reduced: boolean
  target: RefObject<HTMLDivElement>; onVisible: (visible: boolean) => void
}) {
  const point = useMemo(() => new THREE.Vector3(-1.025, 3.145, .083), [])
  const projected = useMemo(() => new THREE.Vector3(), [])
  const guard = useMemo(() => model ? createCameraGuard(model) : null, [model])
  const beacon = useMemo(createArtifactBeacon, [])
  const lastVisible = useRef(false)
  useEffect(() => {
    if (!active) { beacon.reset(); lastVisible.current = false }
  }, [active, beacon])
  useFrame(({ camera, size }, delta) => {
    if (!active || !target.current) return
    const state = beacon.update(camera, point, size.width, size.height, true, reduced, delta, guard, mobile)
    if (lastVisible.current !== state.visible) { lastVisible.current = state.visible; onVisible(state.visible) }
    const marker = target.current
    marker.dataset.ready = String(state.visible)
    if (!state.visible) return
    projected.copy(point).project(camera)
    marker.style.setProperty('--target-x', `${(projected.x + 1) * size.width / 2}px`)
    marker.style.setProperty('--target-y', `${(1 - projected.y) * size.height / 2}px`)
    marker.style.setProperty('--target-width', '64px')
    marker.style.setProperty('--target-height', '64px')
  })
  return null
}

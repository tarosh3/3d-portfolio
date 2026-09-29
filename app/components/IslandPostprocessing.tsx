'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO, TiltShiftEffect } from '@react-three/postprocessing'
import { EffectComposer as Composer, EffectPass, SelectiveBloomEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing'
import * as THREE from 'three'
import type { DayCycle } from './day-cycle'

/** Desktop only. Keep the targets alive across readers, but run no passes while paused. */
export default function IslandPostprocessing({ enabled, preparing, overview, cycle, reduced, onReady }: { enabled: boolean; preparing: boolean; overview: boolean; cycle: DayCycle; reduced: boolean; onReady?: (target: THREE.WebGLRenderTarget) => void }) {
  const { gl, scene, camera, invalidate } = useThree()
  const composer = useRef<Composer>(null)
  const blurAmount = useRef(0)
  const warmFrames = useRef(0)
  const pipeline = useMemo(() => {
    const bloom = new SelectiveBloomEffect(scene, camera, {
      intensity: .32, luminanceThreshold: .35, luminanceSmoothing: .25, mipmapBlur: true,
    })
    bloom.ignoreBackground = true
    bloom.selection.layer = 11
    const bloomPass = new EffectPass(camera, bloom)
    // Keep the overview miniature effect gentle enough to retain sky details.
    const tiltX = new TiltShiftEffect({ blur: .035, taper: .38, start: [0, .5], end: [1, .5], direction: [1, 0], samples: 9 })
    const tiltY = new TiltShiftEffect({ blur: .035, taper: .38, start: [0, .5], end: [1, .5], direction: [0, 1], samples: 9 })
    const tiltPassX = new EffectPass(camera, tiltX)
    const tiltPassY = new EffectPass(camera, tiltY)
    tiltPassX.enabled = tiltPassY.enabled = false
    const finish = new EffectPass(camera,
      new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
      new VignetteEffect({ eskil: false, offset: .35, darkness: .16 }),
    )
    return { bloom, bloomPass, tiltX, tiltY, tiltPassX, tiltPassY, finish, retirement: 0 }
  }, [scene, camera])

  // Select the actual light meshes, never brightness-select sand, pages, the
  // sun sprite or hover outlines. SelectiveBloom's depth mask keeps occlusion.
  useEffect(() => {
    const lights: THREE.Object3D[] = []
    scene.traverse(object => { if (object.userData.islandBloom) lights.push(object) })
    pipeline.bloom.selection.set(lights)
    pipeline.bloomPass.enabled = false
    invalidate()
    return () => { pipeline.bloom.selection.clear() }
  }, [scene, pipeline, invalidate])

  useEffect(() => {
    // RPP 2 disables renderer tone mapping even when enabled=false. Restore the
    // direct-render path while suspended; the final effect handles the HDR path.
    gl.toneMapping = enabled ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping
    invalidate()
  }, [enabled, gl, invalidate])

  useEffect(() => {
    // The child's layout effect has attached every pass by this point. Scene
    // readiness now compiles and renders this same pipeline beneath the loader.
    if (composer.current) onReady?.(composer.current.inputBuffer)
    invalidate()
  }, [onReady, invalidate])

  const children = useMemo(() => [
    <N8AO key="ao" aoRadius={.5} intensity={.65} distanceFalloff={1} quality="low" halfRes depthAwareUpsampling />,
    <primitive key="bloom" object={pipeline.bloomPass} />,
    <primitive key="tilt-x" object={pipeline.tiltPassX} />,
    <primitive key="tilt-y" object={pipeline.tiltPassY} />,
    <primitive key="finish" object={pipeline.finish} />,
  ], [pipeline])

  useEffect(() => {
    window.clearTimeout(pipeline.retirement)
    const instance = composer.current
    // RPP 2 removes its passes on unmount without disposing the composer.
    // Capture them before removal, including N8AO's privately owned quad materials.
    const passes = instance?.passes.slice() || []
    return () => {
      // Cancelled by Strict Mode's immediate effect re-setup; actual unmounts
      // release the GPU targets without destroying a still-mounted composer.
      pipeline.retirement = window.setTimeout(() => {
        pipeline.bloom.selection.clear()
        passes.forEach(pass => {
          Object.values(pass).forEach(value => {
            if (value?.material instanceof THREE.ShaderMaterial) value.material.dispose()
          })
          pass.dispose()
        })
        instance?.dispose()
      }, 0)
    }
  }, [pipeline])

  useFrame((_, delta) => {
    if (!enabled) return
    pipeline.bloom.intensity = .32 * cycle.value
    pipeline.bloomPass.enabled = cycle.value > .001 && pipeline.bloom.selection.size > 0
    // Overview blur normally starts after the arrival flight. Compile its two
    // fullscreen shaders while covered instead of hitching on the final pose.
    if (preparing && warmFrames.current < 2) {
      warmFrames.current++
      pipeline.tiltX.blendMode.opacity.value = pipeline.tiltY.blendMode.opacity.value = 0
      pipeline.tiltPassX.enabled = pipeline.tiltPassY.enabled = true
      invalidate()
      return
    }
    const target = overview ? 1 : 0
    blurAmount.current = reduced ? target : THREE.MathUtils.damp(blurAmount.current, target, 7, Math.min(delta, .05))
    if (Math.abs(blurAmount.current - target) < .001) blurAmount.current = target
    pipeline.tiltX.blendMode.opacity.value = blurAmount.current
    pipeline.tiltY.blendMode.opacity.value = blurAmount.current
    pipeline.tiltPassX.enabled = pipeline.tiltPassY.enabled = blurAmount.current > 0
    // Demand rendering (Still) must finish the short optical fade too.
    if (blurAmount.current !== target) invalidate()
  })

  return <EffectComposer ref={composer} enabled={enabled} multisampling={2} enableNormalPass={false} depthBuffer>{children}</EffectComposer>
}

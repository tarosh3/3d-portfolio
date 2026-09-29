'use client'

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { createSceneReadiness } from './scene-readiness'

/** Warm the exact visible render path underneath the loader. */
export default function SceneReadiness({ available, renderTarget = null, onCompiled, onReady, onError }: {
  available: boolean; renderTarget?: THREE.WebGLRenderTarget | null; onCompiled?: () => void; onReady: () => void; onError?: (message: string) => void
}) {
  const { gl, scene, camera, invalidate } = useThree()
  const gate = useRef(createSceneReadiness())
  const run = useRef<{ token: number; compiled: boolean; frame: number } | null>(null)
  const callbacks = useRef({ onCompiled, onReady, onError })
  callbacks.current = { onCompiled, onReady, onError }
  const finished = useRef(false)

  useEffect(() => {
    if (!available || finished.current) return
    const readiness = gate.current
    const token = readiness.begin()
    const pending = { token, compiled: false, frame: 0 }
    run.current = pending
    scene.updateMatrixWorld(true)
    const textures = new Set<THREE.Texture>()
    const collect = (value: unknown) => { if (value instanceof THREE.Texture) textures.add(value) }
    scene.traverseVisible(object => {
      const mesh = object as THREE.Mesh
      if (!mesh.material) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials) {
        Object.values(material).forEach(collect)
        if (material instanceof THREE.ShaderMaterial) Object.values(material.uniforms).forEach(uniform => collect(uniform.value))
      }
    })
    const queue = Array.from(textures)
    let index = 0
    const failed = () => {
      if (readiness.current(token)) callbacks.current.onError?.('The island renderer couldn’t finish preparing. You can retry or read the portfolio.')
    }
    const compile = async () => {
      try {
        // Match the desktop composer's linear target, not the sRGB canvas. The
        // output colour space is part of Three's shader-program cache key.
        const previousTarget = gl.getRenderTarget()
        let compilation: Promise<unknown> | undefined
        try {
          gl.setRenderTarget(renderTarget)
          if (typeof gl.compileAsync === 'function') compilation = gl.compileAsync(scene, camera)
          else gl.compile(scene, camera)
        } finally { gl.setRenderTarget(previousTarget) }
        await compilation
        if (!readiness.compiled(token)) return
        pending.compiled = true
        callbacks.current.onCompiled?.()
        invalidate()
      } catch { failed() }
    }
    const upload = () => {
      if (!readiness.current(token)) return
      pending.frame = 0
      try {
        // Texture upload/decode is not covered by compileAsync. Spread uploads
        // across paint opportunities instead of doing all of them on first draw.
        const started = performance.now()
        do { gl.initTexture(queue[index++]) } while (index < queue.length && performance.now() - started < 4)
        if (index < queue.length) pending.frame = requestAnimationFrame(upload)
        else void compile()
      } catch { failed() }
    }
    if (queue.length) pending.frame = requestAnimationFrame(upload)
    else void compile()
    return () => {
      readiness.cancel(token)
      cancelAnimationFrame(pending.frame)
      if (run.current === pending) run.current = null
    }
  }, [available, renderTarget, gl, scene, camera, invalidate])

  useFrame(() => {
    const pending = run.current
    if (!pending?.compiled || finished.current || pending.frame) return
    if (!gate.current.frame(pending.token)) { invalidate(); return }
    pending.frame = requestAnimationFrame(() => {
      if (!gate.current.current(pending.token) || finished.current) return
      finished.current = true
      callbacks.current.onReady()
    })
  })
  return null
}

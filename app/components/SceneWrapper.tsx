'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import LoadingScreen from './LoadingScreen'
import { EMPTY_LOAD_PROGRESS, type IslandLoadProgress } from './loading-progress'

// Keep the Three.js scene out of the first mobile client chunk. The loading
// screen can paint immediately while the island renderer and GLTF begin loading
// in their own chunk.
const IslandScene = dynamic(() => import('./IslandScene'), { ssr: false })

export default function SceneWrapper() {
  const [visible, setVisible] = useState(false)
  const [mountScene, setMountScene] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [progress, setProgress] = useState<IslandLoadProgress>(EMPTY_LOAD_PROGRESS)
  const [ready, setReady] = useState(false)
  const [fontsReady, setFontsReady] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const container = useRef<HTMLDivElement>(null)
  // Paint the prepared canvas beneath one departing overlay. Input and the
  // arrival flight start only after that overlay has completely disappeared.
  const startReveal = useCallback(() => setRevealed(true), [])
  const reveal = useCallback(() => { setRevealed(true); setVisible(true) }, [])
  const prepared = useCallback(() => setReady(true), [])
  useEffect(() => {
    // Submit the loader's composited layers before parsing/mounting Three.
    // These two paint opportunities don't impose a fixed artificial delay.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setMountScene(true))
    })
    return () => cancelAnimationFrame(frame)
  }, [])
  useEffect(() => {
    let mounted = true
    // Keep the title's final font metrics in place before revealing the hero.
    const preparedFonts = () => { if (mounted) setFontsReady(true) }
    if (document.fonts) void document.fonts.ready.then(preparedFonts, preparedFonts)
    else preparedFonts()
    return () => { mounted = false }
  }, [])
  useEffect(() => {
    const previous = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    window.scrollTo({ top: 0, behavior: 'instant' })
    return () => { document.documentElement.style.overflow = previous }
  }, [])
  useEffect(() => {
    if (visible) container.current?.removeAttribute('inert')
    else container.current?.setAttribute('inert', '')
  }, [visible])
  return <>
    {!visible && <LoadingScreen progress={progress} ready={ready && fontsReady} failed={failed} onReveal={startReveal} onComplete={reveal} />}
    <div ref={container} className="island-viewport" aria-hidden={!visible || undefined}>{mountScene && <IslandScene visible={visible} sceneRevealed={revealed} onReady={prepared} onLoadProgress={setProgress} onLoadError={setFailed} />}</div>
  </>
}

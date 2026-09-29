'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import LoadingArtwork from './LoadingArtwork'
import { loadingTarget, LOADER_EXIT_MS, LOADER_SETTLE_MS, type IslandLoadProgress } from './loading-progress'

interface LoadingScreenProps {
  progress: IslandLoadProgress
  ready: boolean
  failed?: string | null
  onReveal: () => void
  onComplete: () => void
}

export default function LoadingScreen({ progress, ready, failed, onReveal, onComplete }: LoadingScreenProps) {
  const root = useRef<HTMLElement>(null)
  const current = useRef({ onReveal, onComplete })
  current.current = { onReveal, onComplete }
  const completed = useRef(false)
  const revealed = useRef(false)
  const [leaving, setLeaving] = useState(false)
  const [slow, setSlow] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [amount, setAmount] = useState(0)
  const error = Boolean(failed || progress.errors.length)
  const prepared = ready && !error

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      let still = false
      try { still = sessionStorage.getItem('island-still') === '1' } catch { /* optional preference */ }
      setReduced(query.matches || still)
    }
    update(); query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    setAmount(previous => loadingTarget(previous, progress.progress, prepared))
  }, [progress.progress, prepared])
  const complete = useCallback(() => {
    if (completed.current) return
    completed.current = true
    current.current.onComplete()
  }, [])
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 12000)
    return () => clearTimeout(timer)
  }, [])
  useEffect(() => {
    if (!prepared || revealed.current) return
    // Give the compositor a quiet settling interval after the final GPU work.
    // Animation is entirely CSS: no rAF meter, inherited variables or SVG paint.
    const timer = setTimeout(() => {
      revealed.current = true
      current.current.onReveal()
      setLeaving(true)
    }, reduced ? 0 : LOADER_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [prepared, reduced])
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(complete, reduced ? 0 : LOADER_EXIT_MS + 100)
    return () => clearTimeout(timer)
  }, [leaving, reduced, complete])

  const phase = error ? 'error' : prepared ? 'ready' : progress.progress >= 90 ? 'finishing' : 'loading'
  const status = error ? 'The island couldn’t be reached.' : prepared ? 'Welcome ashore.' : progress.progress >= 90 ? 'Finding the perfect light.' : 'Preparing your little escape.'
  return <section ref={root} className={`island-loader ${leaving ? 'is-leaving' : ''} ${reduced ? 'is-still' : ''}`} data-load-phase={leaving ? 'revealing' : 'loading'} data-preparation={phase} aria-label="Loading Tarosh’s island portfolio" onTransitionEnd={event => {
    if (leaving && event.target === event.currentTarget && event.propertyName === 'opacity') complete()
  }}>
    <header className="arrival-masthead">
      <div className="arrival-signature"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 2v28M2 16h28M6 6l20 20M6 26 26 6" stroke="currentColor" strokeWidth="1.3" /></svg><span>Tarosh Mathuria<span>A PERSONAL ISLAND</span></span></div>
      <span className="arrival-edition">WORK · STORIES · CURIOSITY</span>
    </header>
    <div className="arrival-layout">
      <div className="arrival-copy">
        <p className="arrival-kicker"><span /> A LITTLE FURTHER FROM THE ORDINARY</p>
        <h1><span className="arrival-line"><span>A little island.</span></span><span className="arrival-line"><em>A world within.</em></span></h1>
        <p className="arrival-description">Good things take a little exploring.<br />Let’s find your way ashore.</p>
        <div className="arrival-progress">
          <div className="arrival-progress-meta"><p role="status">{status}</p><span className="arrival-status-mark" aria-hidden="true">{prepared ? '↗' : '≈'}</span></div>
          <div className="arrival-progress-track" role="progressbar" aria-label="Island preparation" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(amount * 100)} aria-valuetext={status}><span className="arrival-progress-fill" style={{ transform: `scaleX(${amount})` }} /><span className="arrival-progress-tide" aria-hidden="true" /></div>
          <p className={`arrival-help ${slow || error ? 'is-visible' : ''}`} aria-hidden={!slow && !error}>{error ? 'You can still explore the complete text edition.' : 'Taking a little longer? The text edition is ready below.'}</p>
        </div>
      </div>
      <LoadingArtwork />
    </div>
    <footer className="arrival-footer"><span>TAKE THE SCENIC ROUTE.</span><a href="/read">Explore the text edition <span aria-hidden="true">↗</span></a></footer>
  </section>
}

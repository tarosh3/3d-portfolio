'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import LoadingArtwork from './LoadingArtwork'
import BrandLogo from './BrandLogo'
import { loadingPhase, loadingTarget, LOADER_EXIT_MS, LOADER_SETTLE_MS, type IslandLoadProgress } from './loading-progress'

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

  const phase = loadingPhase(progress, prepared, error)
  const step = phase === 'ready' ? 2 : phase === 'finishing' ? 1 : 0
  const status = error ? 'The island couldn’t be reached.' : prepared ? 'Your island is ready. Welcome ashore.' : phase === 'finishing' ? 'Preparing the scene for your screen.' : progress.total > 0 ? 'Loading the island and its details.' : 'Opening the way to your island.'
  return <section ref={root} className={`island-loader ${leaving ? 'is-leaving' : ''} ${reduced ? 'is-still' : ''}`} data-load-phase={leaving ? 'revealing' : 'loading'} data-preparation={phase} aria-label="Loading Tarosh’s island portfolio" onTransitionEnd={event => {
    if (leaving && event.target === event.currentTarget && event.propertyName === 'opacity') complete()
  }}>
    <header className="arrival-masthead">
      <div className="arrival-signature"><BrandLogo priority /></div>
      <span className="arrival-edition">WORK · STORIES · CURIOSITY</span>
    </header>
    <div className="arrival-layout">
      <div className="arrival-copy">
        <p className="arrival-kicker"><span className="arrival-live-dot" /> {error ? 'ARRIVAL ON HOLD' : prepared ? 'READY TO EXPLORE' : 'LOADING YOUR ISLAND'}</p>
        <h1><span className="arrival-line"><span>A little island.</span></span><span className="arrival-line"><em>Coming to life.</em></span></h1>
        <p className="arrival-description">A world of work, stories and little discoveries.<br />We’re getting it ready for you.</p>
        <div className="arrival-progress">
          <div className="arrival-progress-meta"><span className="arrival-activity" aria-hidden="true"><i /><svg viewBox="0 0 24 24" fill="none"><path d={error ? 'M12 5v9m0 3v2' : prepared ? 'm5 12 5 5L20 7' : 'M12 3v18M3 12h18M6 6l12 12M6 18 18 6'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span><p role="status" aria-live="polite" aria-atomic="true">{status}</p></div>
          <div className="arrival-progress-track" role="progressbar" aria-label="Island preparation" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(amount * 100)} aria-valuetext={status}><span className="arrival-progress-fill" style={{ transform: `scaleX(${amount})` }} /><span className="arrival-progress-tide" aria-hidden="true" /></div>
          <ol className="arrival-steps" aria-label="Loading stages">{['Gather details', 'Set the scene', 'Arrive'].map((label, index) => <li key={label} aria-current={!error && step === index ? 'step' : undefined} data-state={error ? 'waiting' : index < step ? 'complete' : index === step ? 'current' : 'waiting'}><span aria-hidden="true">{index < step && !error ? '✓' : `0${index + 1}`}</span>{label}</li>)}</ol>
          <p className="arrival-help">{error ? 'You can still explore the complete text edition below.' : prepared ? 'Your journey starts automatically.' : slow ? 'Still preparing. You can open the text edition anytime.' : 'The first visit takes a little longer. We’ll take you in automatically.'}</p>
        </div>
      </div>
      <LoadingArtwork />
    </div>
    <footer className="arrival-footer"><span>AN INTERACTIVE PORTFOLIO BY TAROSH MATHURIA</span><a href="/read">Prefer to read? Text edition <span aria-hidden="true">↗</span></a></footer>
  </section>
}

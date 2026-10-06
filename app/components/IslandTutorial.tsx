'use client'

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { TutorialStep } from './island-tutorial'

export const TUTORIAL_SESSION_KEY = 'island-tutorial-hands-on-v2'

const STEPS: TutorialStep[] = ['travel', 'open', 'return', 'look', 'zoom']
const SELECTORS: Partial<Record<TutorialStep, string>> = {
  travel: '[data-tutorial-target="next"]',
  return: '.ar-close',
  look: '.island-scene canvas',
  zoom: '[data-tutorial-target="zoom"]',
}

export default function IslandTutorial({ step, mobile, reduced, busy, needsMagazine, needsVeranda, returnToLesson, targetRef, onClose, onLocateMagazine }: {
  step: TutorialStep
  mobile: boolean
  reduced: boolean
  busy: boolean
  needsMagazine: boolean
  needsVeranda: boolean
  returnToLesson: boolean
  targetRef: RefObject<HTMLDivElement>
  onClose: () => void
  onLocateMagazine: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const index = STEPS.indexOf(step)
  const complete = step === 'done'
  const cue = returnToLesson ? 'return' : step
  const recoverTravel = step === 'travel' && needsVeranda && !returnToLesson
  const targetSelector = recoverTravel ? '[data-tutorial-target="resume"]' : SELECTORS[cue]
  const action = mobile ? 'Tap' : 'Click'
  const instruction = {
    travel: `${action} → to visit the veranda.`,
    open: `${action} the glowing magazine.`,
    return: `${action} “Back to area”.`,
    look: 'Drag the island to look around.',
    zoom: `${action} + to move closer.`,
    done: 'You’re ready to explore.',
  }[cue]
  const copy = returnToLesson ? 'Close this page to continue.' : recoverTravel ? 'Continue at the veranda.' : instruction
  const busyText = step === 'open' ? 'Arriving at the magazine…' : step === 'return' ? 'Returning to your island view…' : step === 'look' ? 'Returning to the island…' : 'Moving into place…'

  useEffect(() => {
    const skip = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', skip, true)
    return () => window.removeEventListener('keydown', skip, true)
  }, [onClose])

  useLayoutEffect(() => {
    const pointer = targetRef.current
    if (!pointer || cue === 'open') return
    pointer.dataset.ready = 'false'
    if (busy || complete) return
    const target = document.querySelector<HTMLElement>(targetSelector || '')
    if (!target) return
    const measure = () => {
      const root = rootRef.current
      if (!root || !target.isConnected || !target.getClientRects().length) { pointer.dataset.ready = 'false'; return }
      const bounds = target.getBoundingClientRect()
      const host = root.getBoundingClientRect()
      // A transformed reader creates a fixed-position containing block. Use its local
      // coordinates while the paper animates; the scene otherwise uses viewport pixels.
      const scaleX = host.width / (root.offsetWidth || host.width || 1)
      const scaleY = host.height / (root.offsetHeight || host.height || 1)
      const x = bounds.left + bounds.width * (cue === 'look' ? .6 : .5)
      const y = bounds.top + bounds.height * (cue === 'look' ? .55 : .5)
      pointer.style.setProperty('--target-x', `${(x - host.left) / scaleX}px`)
      pointer.style.setProperty('--target-y', `${(y - host.top) / scaleY}px`)
      pointer.style.setProperty('--target-width', `${cue === 'look' ? 136 : bounds.width / scaleX}px`)
      pointer.style.setProperty('--target-height', `${cue === 'look' ? 54 : bounds.height / scaleY}px`)
      pointer.dataset.ready = bounds.width && bounds.height ? 'true' : 'false'
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(target)
    if (rootRef.current) observer.observe(rootRef.current)
    window.addEventListener('resize', measure)
    // The reader has a short reveal transform; do not retain an animation loop afterwards.
    let frame = 0
    if (cue === 'return') {
      const start = performance.now()
      const settle = () => { measure(); if (performance.now() - start < 350) frame = requestAnimationFrame(settle) }
      frame = requestAnimationFrame(settle)
    }
    return () => {
      pointer.dataset.ready = 'false'
      observer.disconnect()
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
    }
  }, [cue, targetSelector, busy, complete, mobile, targetRef])

  useEffect(() => {
    if (busy || complete) return
    const selector = cue === 'open' ? (mobile ? '.island-scene canvas' : '.area-read') : targetSelector
    const target = selector ? document.querySelector<HTMLElement>(selector) : null
    if (!target) return
    const oldDescription = target.getAttribute('aria-describedby')
    target.setAttribute('aria-describedby', `${oldDescription ? `${oldDescription} ` : ''}tutorial-instruction`)
    target.focus({ preventScroll: true })
    return () => {
      if (oldDescription === null) target.removeAttribute('aria-describedby')
      else target.setAttribute('aria-describedby', oldDescription)
    }
  }, [cue, targetSelector, busy, complete, mobile])

  return <div ref={rootRef} className="island-tutorial" data-step={cue} data-mobile={mobile || undefined} data-reduced={reduced || undefined} data-busy={busy || undefined}>
    <div ref={targetRef} className="tutorial-pointer-anchor" aria-hidden="true">
      <span className="tutorial-target-halo" />
      <span className="tutorial-gesture-track" />
      <span className="tutorial-click-ripple" />
      <span className="tutorial-demo-pointer">
        {mobile
          ? <svg viewBox="0 0 40 48" fill="none"><path d="M16 24V8a4 4 0 0 1 8 0v13l2-1c2-1 5 0 5 3 3-1 6 1 6 4v8c0 7-5 11-12 11-5 0-8-3-11-7L5 28c-2-3 2-7 5-4l6 6" fill="#fff5da" stroke="#24483f" strokeWidth="2" strokeLinejoin="round" /><path d="M20 8v8" stroke="#bd8b41" strokeWidth="2" strokeLinecap="round" /></svg>
          : <svg viewBox="0 0 34 42" fill="none"><path d="M3 2v29l8-7 7 15 6-3-7-14 11-1L3 2Z" fill="#fff5da" stroke="#24483f" strokeWidth="2.3" strokeLinejoin="round" /></svg>}
      </span>
    </div>
    <section className="tutorial-coach" aria-label="Hands-on island tutorial">
      <span className="tutorial-step-count" aria-label={complete ? 'Tutorial complete' : `Step ${index + 1} of ${STEPS.length}`}>{complete ? '✓' : `${index + 1}/${STEPS.length}`}</span>
      <div className="tutorial-coach-copy" aria-live="polite" aria-atomic="true">
        <p id="tutorial-instruction">{busy ? busyText : copy}</p>
        {!returnToLesson && !busy && (recoverTravel || step === 'open' && needsMagazine) && <button type="button" data-tutorial-target="resume" className="tutorial-coach-action" onClick={onLocateMagazine}>Find the magazine <span aria-hidden="true">↗</span></button>}
        {complete && <button type="button" className="tutorial-coach-action" onClick={onClose}>Explore freely <span aria-hidden="true">↗</span></button>}
      </div>
      <button type="button" className="tutorial-skip" onClick={onClose}>{complete ? 'Close' : 'Skip'}</button>
    </section>
  </div>
}

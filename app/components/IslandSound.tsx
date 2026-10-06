'use client'

import { useEffect, useRef, useState } from 'react'
import { sessionFlag, setSessionFlag } from './island-arrival'
import { createWeatherAudio } from './weather-audio'
import type { IslandWeather } from './island-weather'

const SOUND_OFF_SESSION_KEY = 'island-sound-off'
const START_INPUTS = ['pointerup', 'touchend', 'keyup', 'click', 'keydown'] as const

export default function IslandSound({ weather, paused, reduced }: { weather: IslandWeather; paused: boolean; reduced: boolean }) {
  const sound = useRef<HTMLAudioElement | null>(null)
  const layers = useRef<ReturnType<typeof createWeatherAudio> | null>(null)
  const [enabled, setEnabled] = useState(() => !sessionFlag(SOUND_OFF_SESSION_KEY))
  const wanted = useRef(enabled); wanted.current = enabled
  const pausedRef = useRef(paused); pausedRef.current = paused
  const mounted = useRef(false)
  const generation = useRef(0)
  const pending = useRef<Promise<void> | null>(null)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState(false)
  const stop = () => {
    generation.current++
    pending.current = null
    sound.current?.pause(); layers.current?.pause()
  }
  const start = () => {
    if (!mounted.current || !wanted.current || pausedRef.current || document.hidden) return
    // Pointerup/touchend/click can all belong to the same interaction. Keep one
    // media play request until it settles, and invalidate it on every stop.
    if (pending.current) return
    if (!sound.current) {
      sound.current = new Audio('/sounds/beach-ambience.mp3')
      sound.current.loop = true; sound.current.volume = .22
    }
    if (!layers.current) {
      try { layers.current = createWeatherAudio() } catch { /* Beach audio remains available without Web Audio. */ }
    }
    const audio = sound.current, ambience = layers.current
    ambience?.resume()
    if (!audio.paused) return
    const token = ++generation.current
    pending.current = audio.play().then(() => {
      if (!mounted.current || token !== generation.current) return
      if (wanted.current && !pausedRef.current && !document.hidden) { setPlaying(true); setError(false) }
      else { audio.pause(); ambience?.pause() }
    }, () => {
      if (!mounted.current || token !== generation.current) return
      audio.pause(); ambience?.pause(); setPlaying(false); setError(true)
    }).finally(() => { if (token === generation.current) pending.current = null })
  }
  useEffect(() => {
    mounted.current = true
    // Silence on the visibility event itself; the parent's paused render may
    // arrive later. Its normal pause/resume effect handles the return.
    const visibility = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      mounted.current = false
      document.removeEventListener('visibilitychange', visibility)
      stop()
      layers.current?.dispose(); layers.current = null
      const audio = sound.current; sound.current = null
      if (audio) { audio.removeAttribute('src'); audio.load() }
    }
  }, [])
  useEffect(() => { setSessionFlag(SOUND_OFF_SESSION_KEY, !enabled) }, [enabled])
  useEffect(() => {
    if (!enabled || playing || paused) return
    const gesture = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('[data-sound-toggle]')) return
      start()
    }
    START_INPUTS.forEach(type => window.addEventListener(type, gesture, { capture: true, passive: true }))
    return () => START_INPUTS.forEach(type => window.removeEventListener(type, gesture, true))
  }, [enabled, playing, paused])
  useEffect(() => {
    if (!enabled || paused) { stop(); return }
    if (!playing) return
    start()
    const update = () => {
      if (!mounted.current || !wanted.current || pausedRef.current || document.hidden) return
      layers.current?.update(weather, reduced)
      if (sound.current) sound.current.volume = .22 * (1 - weather.rain * .55) * (1 - weather.shelter * .25)
    }
    update()
    const timer = setInterval(update, 200)
    return () => clearInterval(timer)
  }, [playing, enabled, paused, weather, reduced])
  const toggle = () => {
    if (wanted.current) {
      wanted.current = false
      stop(); setPlaying(false); setEnabled(false); setError(false)
      return
    }
    wanted.current = true; setEnabled(true); setError(false)
    start()
  }
  return <button className="explore-tool" data-sound-toggle onClick={toggle} aria-label={enabled ? 'Turn island sounds off' : 'Turn island sounds on'} aria-pressed={enabled}>
    <span className={`sound-bars ${playing && !paused ? 'is-playing' : ''}`} aria-hidden="true"><i /><i /><i /><i /></span>
    <span>{error ? 'Unavailable' : enabled ? 'Sound on' : 'Sound off'}</span>
  </button>
}

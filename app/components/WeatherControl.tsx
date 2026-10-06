'use client'

import { useEffect, useRef, useState } from 'react'
import { WEATHER_OPTIONS, type WeatherKind } from './island-weather'

export function WeatherIcon({ kind }: { kind: WeatherKind }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'clear' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" /></> : <><path d="M6 16a4 4 0 1 1 .6-7.95A5.5 5.5 0 0 1 17 9a3.5 3.5 0 1 1 .5 7H6Z" />{kind === 'rain' && <path d="m7 19-1 2m6-2-1 2m6-2-1 2" />}{kind === 'storm' && <path d="m12 13-3 6h4l-2 4" />}</>}
  </svg>
}

export default function WeatherControl({ value, onChange, disabled, onOpen }: {
  value: WeatherKind; onChange: (kind: WeatherKind) => void; disabled: boolean; onOpen?: () => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const current = WEATHER_OPTIONS.find(item => item.id === value)!
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); toggle.current?.focus() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div ref={root} className="island-weather-control" data-open={open || undefined}>
    <button ref={toggle} type="button" className="weather-toggle" aria-label={`Weather: ${current.label}`} aria-expanded={open} aria-controls="island-weather-options" disabled={disabled} onClick={() => { if (!open) onOpen?.(); setOpen(!open) }}>
      <WeatherIcon kind={value} /><span>{current.label}</span><span className="weather-chevron" aria-hidden="true">⌄</span>
    </button>
    {open && <div id="island-weather-options" className="weather-options" role="group" aria-label="Choose island weather">
      <p>THE MOOD OF THE ISLAND</p>
      {WEATHER_OPTIONS.map(item => <button type="button" key={item.id} aria-pressed={value === item.id} onClick={() => { onChange(item.id); setOpen(false); toggle.current?.focus() }}>
        <WeatherIcon kind={item.id} /><span><strong>{item.label}</strong><small>{item.description}</small></span><i aria-hidden="true">{value === item.id ? '✓' : ''}</i>
      </button>)}
      <span className="weather-footnote">Daylight or dusk. A different feeling.</span>
    </div>}
  </div>
}

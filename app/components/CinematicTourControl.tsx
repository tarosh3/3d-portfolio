export default function CinematicTourControl({ active, disabled, onToggle }: {
  active: boolean; disabled: boolean; onToggle: () => void
}) {
  return <>
    <button className="cinema-toggle" aria-pressed={active} aria-label={active ? 'Stop cinematic tour' : 'Start 360 degree cinematic tour'} disabled={disabled && !active} title={disabled ? 'Available with Motion enabled' : undefined} onClick={onToggle}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">{active ? <rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" /> : <><path d="M5 8C1 9 1 15 6 17c4 2 10 2 14-1M19 6l2 3-4 1M20 9c-3-3-11-3-15-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /><path d="m10 9 5 3-5 3Z" fill="currentColor" /></>}</svg>
      <span>{active ? 'Stop tour' : '360° tour'}</span>
    </button>
    {active && <aside className="cinema-caption" aria-label="Cinematic tour">
      <p><span className="cinema-live" aria-hidden="true" /> THE ISLAND, IN MOTION</p>
      <h2>A different drift, every time.</h2>
      <span>Under the palms. Along the shore.</span>
      <small>Drag, scroll or press Esc to explore</small>
    </aside>}
  </>
}

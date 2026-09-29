'use client'

import { AREAS, type AreaId } from './island-data'

export default function IslandAtlas({ active, open, onToggle, onNavigate }: { active: AreaId; open: boolean; onToggle: () => void; onNavigate: (area: AreaId) => void }) {
  return <aside className={`island-atlas ${open ? 'is-open' : ''}`} aria-label="Island map">
    <button className="atlas-toggle" aria-expanded={open} aria-controls="island-atlas-body" onClick={onToggle}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m2 5 5-2 6 2 5-2v13l-5 2-6-2-5 2Zm5-2v13m6-11v13" stroke="currentColor" strokeWidth="1.3" /></svg>
      <span>Island map</span><span aria-hidden="true">{open ? '−' : '+'}</span>
    </button>
    <div id="island-atlas-body" hidden={!open}>
      <p className="atlas-caption">Pick a place. Take your time.</p>
      <div className="atlas-drawing">
        <svg viewBox="0 0 220 210" fill="none" aria-hidden="true">
          <ellipse cx="114" cy="106" rx="100" ry="95" stroke="#9cbaa8" strokeDasharray="2 5" opacity=".35" />
          <path d="M87 15c28-7 44 14 42 36s13 32 6 55-1 64-21 84c-27 18-55-4-64-26S23 123 31 91 39 28 87 15Z" fill="#d3cca5" stroke="#e8dfbb" strokeWidth="2" />
          <path d="m48 59 39-20 29 43-38 20Z" fill="#6f8b71" stroke="#f1e8c5" /><path d="m54 62 26 10 27 10M80 72l-2 30" stroke="#acb69a" />
          <path d="m128 99 43 2v10l-43-3Z" fill="#b6a17a" stroke="#e4d6b3" />
          <path d="m57 131 18-8 14 20-20 10Z" fill="#b6a17a" stroke="#e4d6b3" />
          <path d="M99 154q-12 22-2 34 18-13 2-34Z" fill="#b47f5d" />
          <circle cx="100" cy="130" r="7" fill="#b9a78d" /><path d="m94 124 12 12m0-12-12 12" stroke="#e7ddbc" />
          <path d="M47 31v17m-8-10 16 4m-14 3 12-13M116 151v17m-8-10 16 4m-14 3 12-13M34 111v17m-8-10 16 4m-14 3 12-13" stroke="#547961" strokeWidth="3" strokeLinecap="round" />
          <path d="m163 139 7-3-1 6Zm16 17 7-3-1 6Zm-26 6 7-3-1 6Z" fill="#a5c6b2" />
        </svg>
        {AREAS.filter(area => area.id !== 'overview').map((area, index) => <button key={area.id} className={`atlas-location ${active === area.id ? 'is-current' : ''}`} style={{ left: `${area.map[0]}%`, top: `${area.map[1]}%` }} aria-label={`Visit ${area.label}`} aria-current={active === area.id ? 'location' : undefined} onClick={() => onNavigate(area.id)}>
          <span aria-hidden="true">{index < 5 ? String(index + 1).padStart(2, '0') : '·'}</span><span className="atlas-place-name">{area.label}</span>
        </button>)}
      </div>
      <nav className="atlas-mobile-places" aria-label="Island places">
        {AREAS.filter(area => area.id !== 'overview').map((area, index) => <button key={area.id} aria-current={active === area.id ? 'location' : undefined} onClick={() => onNavigate(area.id)}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{area.label}</button>)}
      </nav>
      <button className="atlas-overview" onClick={() => onNavigate('overview')}><span aria-hidden="true">↗</span> Whole island</button>
    </div>
  </aside>
}

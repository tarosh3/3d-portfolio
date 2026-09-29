'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { ReadRequest } from './island-data'
import { contacts, experience, fieldNotes, profile, projects, skillGroups } from '../portfolio-data'
import { LagoonFieldLog, WestShoreFieldBoard } from './FieldLogContent'

type ReaderProps = {
  request: ReadRequest
  onClose: () => void
  animated?: boolean
  closing?: boolean
  onExited?: () => void
  restoreFocus?: boolean
}

const EDITIONS = {
  1: { label: 'The veranda magazine', kind: 'magazine' },
  2: { label: 'Notes from the rear deck', kind: 'notebook' },
  3: { label: 'The project posters', kind: 'poster' },
  4: { label: 'Along the hammock line', kind: 'timeline' },
  5: { label: 'A letter from the pier', kind: 'letter' },
  6: { label: fieldNotes.lagoon.edition, kind: 'field-log' },
  7: { label: fieldNotes.west.edition, kind: 'field-board' },
} as const

function initialItem(item: number | undefined, length: number) {
  return Number.isFinite(item) ? Math.max(0, Math.min(length - 1, Math.floor(item!))) : 0
}

function ReaderTabs({ id, labels, active, onChange, label }: {
  id: string
  labels: readonly string[]
  active: number
  onChange: (index: number) => void
  label: string
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number
    switch (event.key) {
      case 'ArrowRight': next = (index + 1) % labels.length; break
      case 'ArrowLeft': next = (index - 1 + labels.length) % labels.length; break
      case 'Home': next = 0; break
      case 'End': next = labels.length - 1; break
      default: return
    }
    event.preventDefault()
    event.stopPropagation()
    onChange(next)
    buttons.current[next]?.focus()
  }
  return (
    <div className="ar-tabs" role="tablist" aria-label={label}>
      {labels.map((name, index) => (
        <button
          key={name}
          ref={(element) => { buttons.current[index] = element }}
          className="ar-tab"
          type="button"
          role="tab"
          id={`${id}-tab-${index}`}
          aria-controls={`${id}-panel-${index}`}
          aria-selected={active === index}
          tabIndex={active === index ? 0 : -1}
          onClick={() => onChange(index)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          <span className="ar-tab-number" aria-hidden="true">0{index + 1}</span>{name}
        </button>
      ))}
    </div>
  )
}

function AboutMagazine({ id }: { id: string }) {
  return (
    <article className="ar-magazine-spread">
      <header className="ar-magazine-cover">
        <p className="ar-overline">An introduction</p>
        <svg className="ar-island-mark" viewBox="0 0 220 130" fill="none" aria-hidden="true">
          <path d="M18 105c21-12 42-20 64-22 33-3 64 2 119 25M19 116c29-8 62-8 91-3 30 5 61 4 91-1" stroke="currentColor" strokeWidth="1.4" />
          <path d="M110 89c-3-18-5-41 0-62m-1 8c-18-19-37-17-54-9m55 9c-6-22-20-28-36-28m38 27c15-19 33-20 51-13m-51 13c21-1 36 7 43 22m-45-23c-17 4-28 15-30 31" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="170" cy="38" r="17" stroke="currentColor" strokeWidth="1" />
        </svg>
        <h1 id={`${id}-title`}>{profile.name}</h1>
        <p className="ar-cover-role">{profile.role}</p>
        <p className="ar-cover-location">{profile.location}</p>
      </header>
      <div className="ar-magazine-story">
        <p className="ar-handwritten ar-greeting">Hello, stranger.</p>
        <p className="ar-lead">{profile.summary}</p>
        <p className="ar-body">{profile.bio}</p>
        <p className="ar-margin-note">{profile.specialties}</p>
        <p className="ar-handwritten ar-signature">See you around the island,<br />Tarosh</p>
      </div>
    </article>
  )
}

function EngineeringNotebook({ id, item }: { id: string; item?: number }) {
  const [selected, setSelected] = useState(() => initialItem(item, skillGroups.length))
  return (
    <article className="ar-notebook-page">
      <header className="ar-heading">
        <p className="ar-overline">Engineering notebook</p>
        <h1 id={`${id}-title`}>Tools of the trade.</h1>
        <p className="ar-deck">From the first service to the system around it.</p>
      </header>
      <ReaderTabs id={id} labels={skillGroups.map((group) => group.name)} active={selected} onChange={setSelected} label="Engineering notebook sections" />
      {skillGroups.map((group, index) => (
        <section className="ar-tab-panel ar-notebook-section" key={group.name} id={`${id}-panel-${index}`} role="tabpanel" aria-labelledby={`${id}-tab-${index}`} hidden={selected !== index} tabIndex={0}>
          <div className="ar-notebook-heading"><h2 className="ar-handwritten">{group.name}</h2><span className="ar-page-number" aria-hidden="true">0{index + 1}</span></div>
          <p className="ar-lead">{group.note}</p>
          <ul className="ar-tool-list">{group.skills.map((skill) => <li key={skill}><span className="ar-tool-tick" aria-hidden="true">✓</span>{skill}</li>)}</ul>
        </section>
      ))}
      <footer className="ar-page-footer"><span>{profile.name}</span><span>Notes from building things.</span></footer>
    </article>
  )
}

function ProjectDiagram({ projectIndex }: { projectIndex: number }) {
  if (projectIndex === 0) {
    return (
      <div className="ar-project-diagram" aria-label="FitNyx: Next.js PWA, Go Echo backend, and AI coaching with persistent thread state">
        <span className="ar-diagram-caption">The working parts</span>
        <div className="ar-system-flow"><span>Next.js<small>PWA</small></span><i aria-hidden="true">→</i><span>Go<small>Echo</small></span><i aria-hidden="true">→</i><span>AI coach<small>Persistent context</small></span></div>
      </div>
    )
  }
  return (
    <dl className="ar-research-facts">
      <div><dt>71.27<span>%</span></dt><dd>accuracy</dd></div>
      <div><dt>14</dt><dd>semantic classes</dd></div>
      <div><dt>U-Net</dt><dd>segmentation model</dd></div>
    </dl>
  )
}

function ProjectPosters({ id, item }: { id: string; item?: number }) {
  const [selected, setSelected] = useState(() => initialItem(item, projects.length))
  return (
    <article className="ar-poster-page">
      <header className="ar-heading"><p className="ar-overline">Selected projects</p><h1 id={`${id}-title`}>Made. Shipped. Explored.</h1></header>
      <ReaderTabs id={id} labels={projects.map((project) => project.tabLabel)} active={selected} onChange={setSelected} label="Selected projects" />
      {projects.map((project, index) => (
        <section className="ar-tab-panel ar-project-panel" key={project.id} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} hidden={selected !== index} tabIndex={0}>
          <div className="ar-project-heading"><p className="ar-overline">{project.category}</p><h2>{project.name}</h2><p className="ar-project-period">{project.subtitle}</p></div>
          <p className="ar-lead">{project.description}</p>
          <ProjectDiagram projectIndex={index} />
          <ul className="ar-project-tags" aria-label="Technologies">{project.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
        </section>
      ))}
    </article>
  )
}

function CareerCards({ id, item }: { id: string; item?: number }) {
  const records = [experience[2], experience[1], experience[0]]
  const [selected, setSelected] = useState(() => initialItem(item, records.length))
  return (
    <article className="ar-career-page">
      <header className="ar-heading"><p className="ar-overline">A few stops along the way</p><h1 id={`${id}-title`}>The journey so far.</h1></header>
      <ReaderTabs id={id} labels={records.map((role) => role.tabLabel)} active={selected} onChange={setSelected} label="Career timeline" />
      {records.map((role, index) => (
        <section className="ar-tab-panel ar-career-record" key={role.id} id={`${id}-panel-${index}`} role="tabpanel" aria-labelledby={`${id}-tab-${index}`} hidden={selected !== index} tabIndex={0}>
          <p className="ar-career-period">{role.period}</p>
          <h2>{role.title}</h2>
          <p className="ar-career-company">{role.company}</p>
          <ul className="ar-career-bullets">{role.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
        </section>
      ))}
      <footer className="ar-page-footer"><span>{profile.name}</span><span>{String(selected + 1).padStart(2, '0')} / 03</span></footer>
    </article>
  )
}

function ContactLetter({ id }: { id: string }) {
  return (
    <article className="ar-contact-letter">
      <header className="ar-letter-heading"><p className="ar-overline">A letter from the pier</p><div className="ar-postmark" aria-hidden="true"><span>NEW DELHI</span><span>INDIA</span></div></header>
      <h1 className="ar-handwritten" id={`${id}-title`}>Let’s build something.</h1>
      <p className="ar-lead">{profile.contactIntro}</p>
      <address className="ar-addresses">
        {contacts.map((contact) => (
          <a key={contact.label} href={contact.href} target={contact.external ? '_blank' : undefined} rel={contact.external ? 'noopener noreferrer' : undefined}>
            <span className="ar-address-label">{contact.label}</span><span className="ar-address-value">{contact.value}</span><span className="ar-address-arrow" aria-hidden="true">↗</span>
          </a>
        ))}
      </address>
      <p className="ar-handwritten ar-signature">Talk soon,<br />Tarosh</p>
      <p className="ar-contact-note">{profile.contactNote}</p>
    </article>
  )
}

export default function ArtifactReader({ request, onClose, animated = false, closing = false, onExited, restoreFocus = true }: ReaderProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const exitCompleted = useRef(false)
  const exitCallback = useRef(onExited)
  const restoreFocusRef = useRef(restoreFocus)
  exitCallback.current = onExited
  restoreFocusRef.current = restoreFocus
  const uniqueId = useId()
  const id = `island-reader-${uniqueId}`
  const edition = EDITIONS[request.stage]

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    const previousRootOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    dialog.showModal()
    closeRef.current?.focus({ preventScroll: true })
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      document.documentElement.style.overflow = previousRootOverflow
      if (restoreFocusRef.current && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    if (!closing) {
      exitCompleted.current = false
      return
    }
    const finish = () => {
      if (exitCompleted.current) return
      exitCompleted.current = true
      exitCallback.current?.()
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!animated || reducedMotion.matches) {
      finish()
      return
    }
    const dialog = dialogRef.current
    const onAnimationEnd = (event: AnimationEvent) => {
      if (event.target === dialog && !event.pseudoElement && event.animationName === 'ar-paper-dismiss') finish()
    }
    const onMotionChange = (event: MediaQueryListEvent) => { if (event.matches) finish() }
    dialog?.addEventListener('animationend', onAnimationEnd)
    reducedMotion.addEventListener('change', onMotionChange)
    // Keep the exit reliable when an animation is interrupted or the tab is hidden.
    const timeout = window.setTimeout(finish, 260)
    return () => {
      window.clearTimeout(timeout)
      dialog?.removeEventListener('animationend', onAnimationEnd)
      reducedMotion.removeEventListener('change', onMotionChange)
    }
  }, [animated, closing])

  useEffect(() => { scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' }) }, [request.stage, request.item])

  return (
    <dialog
      className={`artifact-reader ar-edition--${edition.kind}${animated ? ' ar-animated' : ''}${closing ? ' ar-closing' : ''}`}
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      onCancel={(event) => { event.preventDefault(); if (!closing) onClose() }}
      onWheel={(event) => event.stopPropagation()}
      onTouchMove={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="ar-window">
        <div className="ar-toolbar">
          <button className="ar-close" ref={closeRef} type="button" disabled={closing} onClick={onClose} aria-label="Back to area, close reading view"><span aria-hidden="true">←</span>Back to area</button>
          <p className="ar-context">{request.source === 'door' ? 'A note on the bungalow door' : edition.label}</p>
          <span className="ar-escape-hint" aria-hidden="true">ESC</span>
        </div>
        <div className="ar-scroll" tabIndex={0} role="region" aria-label="Portfolio reading pages" ref={scrollRef} key={`${request.stage}-${request.item ?? 0}`}>
          {request.stage === 1 && <AboutMagazine id={id} />}
          {request.stage === 2 && <EngineeringNotebook id={id} item={request.item} />}
          {request.stage === 3 && <ProjectPosters id={id} item={request.item} />}
          {request.stage === 4 && <CareerCards id={id} item={request.item} />}
          {request.stage === 5 && <ContactLetter id={id} />}
          {request.stage === 6 && <LagoonFieldLog id={id} />}
          {request.stage === 7 && <WestShoreFieldBoard id={id} />}
        </div>
      </div>
    </dialog>
  )
}

'use client'

import { useEffect, useId, useRef } from 'react'
import { chapters, profile } from '../portfolio-data'
import PortfolioContent from './PortfolioContent'

export default function FieldGuide({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    window.scrollTo({ top: window.scrollY, behavior: 'instant' })
    const previousOverflow = document.body.style.overflow
    const previousPadding = document.body.style.paddingRight
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`

    // Native modal dialogs make the scene inert and keep keyboard focus inside.
    dialog.showModal()
    closeRef.current?.focus({ preventScroll: true })

    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      document.body.style.paddingRight = previousPadding
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="guide-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      data-lenis-prevent
      onWheel={(event) => event.stopPropagation()}
      onTouchMove={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => { event.preventDefault(); onClose() }}
    >
      <div className="guide-shell">
        <header className="guide-header">
          <div>
            <p className="guide-eyebrow">The field guide</p>
            <h1 id={`${id}-title`}>{profile.name}</h1>
            <p id={`${id}-description`}>Backend engineer · {profile.location}</p>
          </div>
          <button ref={closeRef} className="guide-close" type="button" onClick={onClose} aria-label="Close field guide">
            <span>Back to island</span><span aria-hidden="true">×</span>
          </button>
        </header>
        <nav className="guide-nav" aria-label="Field guide chapters">
          {chapters.map((chapter) => (
            <a key={chapter.stage} href={`#${id}-chapter-${chapter.stage}`} onClick={event => { event.preventDefault(); const chapterElement = document.getElementById(`${id}-chapter-${chapter.stage}`); chapterElement?.scrollIntoView({ block: 'start', behavior: 'instant' }); chapterElement?.focus({ preventScroll: true }); }}>{chapter.label}</a>
          ))}
        </nav>
        <div className="guide-content">
          {chapters.map((chapter) => (
            <div className="guide-chapter" key={chapter.stage} id={`${id}-chapter-${chapter.stage}`} tabIndex={-1}>
              <PortfolioContent stage={chapter.stage} />
            </div>
          ))}
        </div>
        <footer className="guide-footer"><span>Made with curiosity. Built to explore.</span><a href="/read">Open reading edition ↗</a><span>Island model by Jef Belmans.</span></footer>
      </div>
    </dialog>
  )
}

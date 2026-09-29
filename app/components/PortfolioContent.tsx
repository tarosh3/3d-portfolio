'use client'

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { chapters, contacts, experience, letterPages, profile, projects, resumePages, skillGroups } from '../portfolio-data'

export type ContentVariant = 'letter' | 'cards' | 'chalk' | 'door' | 'postcard'
type ContentProps = { stage: number; compact?: boolean; variant?: ContentVariant }

function Tabs({
  labels, active, onChange, id, label, classPrefix = 'board',
}: {
  labels: readonly string[]
  active: number
  onChange: (index: number) => void
  id: string
  label: string
  classPrefix?: 'board' | 'artifact'
}) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
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
    tabs.current[next]?.focus({ preventScroll: true })
  }

  return (
    <div className={`${classPrefix}-tabs`} role="tablist" aria-label={label}>
      {labels.map((name, index) => (
        <button
          key={name}
          ref={(element) => { tabs.current[index] = element }}
          id={`${id}-tab-${index}`}
          type="button"
          role="tab"
          className={`${classPrefix}-tab`}
          aria-selected={active === index}
          aria-controls={`${id}-panel-${index}`}
          tabIndex={active === index ? 0 : -1}
          onClick={() => onChange(index)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {name}
        </button>
      ))}
    </div>
  )
}

function About({ compact }: { compact: boolean }) {
  return (
    <>
      <p className="board-kicker">Backend engineer. Curious by nature.</p>
      <p className="board-body">{compact ? profile.summary : profile.bio}</p>
      <dl className="board-facts">
        <div><dt>4+ years</dt><dd>building at scale</dd></div>
        <div><dt>60,000+</dt><dd>merchants served</dd></div>
        <div><dt>Go</dt><dd>language of choice</dd></div>
      </dl>
      <p className="board-note">Based in {profile.location}.</p>
    </>
  )
}

function Skills() {
  return (
    <>
      <p className="board-intro">From the first service to the system around it.</p>
      <dl className="board-skills">
        {skillGroups.map((group) => (
          <div className="board-skill-row" key={group.name}>
            <dt>{group.name}</dt>
            <dd>{group.skills.join(' / ')}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}

function ProjectDetails({ project, compact }: { project: typeof projects[number]; compact: boolean }) {
  return (
    <article className="board-project">
      <p className="board-meta">{project.subtitle}</p>
      <h3 className="board-subtitle">{project.name}</h3>
      <p className="board-body">{compact ? project.summary : project.description}</p>
      {compact && project.id === 'segmentation' && <p className="board-detail">{project.detail}</p>}
      <ul className="board-tags" aria-label={`${project.name} technologies`}>
        {project.tags.map((tag) => <li key={tag}>{tag}</li>)}
      </ul>
    </article>
  )
}

function Projects({ compact }: { compact: boolean }) {
  const [selected, setSelected] = useState(0)
  const id = useId()

  return (
    <>
      <p className="board-intro">Personal experiments. Real things, shipped.</p>
      {compact ? (
        <>
          <Tabs labels={projects.map((project) => project.tabLabel)} active={selected} onChange={setSelected} id={id} label="Select a project" />
          {projects.map((project, index) => (
            <div
              key={project.id}
              className="board-tabpanel"
              role="tabpanel"
              id={`${id}-panel-${index}`}
              aria-labelledby={`${id}-tab-${index}`}
              tabIndex={0}
              hidden={selected !== index}
            >
              <ProjectDetails project={project} compact />
            </div>
          ))}
        </>
      ) : (
        <div className="board-projects">
          {projects.map((project) => <ProjectDetails key={project.id} project={project} compact={false} />)}
        </div>
      )}
    </>
  )
}

function RoleDetails({ role, compact }: { role: typeof experience[number]; compact: boolean }) {
  return (
    <article className="board-role">
      <p className="board-meta">{role.company}</p>
      <h3 className="board-subtitle">{role.title}</h3>
      <p className="board-period">{role.period}</p>
      <ul className="board-bullets">
        {(compact ? role.highlights : role.bullets).map((bullet) => <li key={bullet}>{bullet}</li>)}
      </ul>
    </article>
  )
}

function Experience({ compact }: { compact: boolean }) {
  const [selected, setSelected] = useState(0)
  const id = useId()

  return (
    <>
      {compact ? (
        <>
          <Tabs labels={experience.map((role) => role.tabLabel)} active={selected} onChange={setSelected} id={id} label="Select experience" />
          {experience.map((role, index) => (
            <div
              key={role.id}
              className="board-tabpanel"
              role="tabpanel"
              id={`${id}-panel-${index}`}
              aria-labelledby={`${id}-tab-${index}`}
              tabIndex={0}
              hidden={selected !== index}
            >
              <RoleDetails role={role} compact />
            </div>
          ))}
        </>
      ) : (
        <div className="board-roles">
          {experience.map((role) => <RoleDetails key={role.id} role={role} compact={false} />)}
        </div>
      )}
    </>
  )
}

function Contact({ compact }: { compact: boolean }) {
  return (
    <>
      <p className="board-intro">A good conversation starts here.</p>
      <p className="board-body">{compact ? 'Open to senior backend, distributed systems, and infrastructure roles. Especially a hard problem worth solving.' : profile.contactIntro}</p>
      <address className="board-contacts">
        {contacts.map((contact) => (
          <a
            className="board-contact"
            key={contact.label}
            href={contact.href}
            target={contact.external ? '_blank' : undefined}
            rel={contact.external ? 'noopener noreferrer' : undefined}
          >
            <span className="board-contact-label">{contact.label}</span>
            <span className="board-contact-value">{contact.value}</span>
            <span className="board-contact-arrow" aria-hidden="true">↗</span>
          </a>
        ))}
      </address>
      <p className="board-note">{compact ? 'New Delhi, India · Remote-friendly' : profile.contactNote}</p>
    </>
  )
}

function PageControls({
  page, count, onChange, panelId, label,
}: {
  page: number
  count: number
  onChange: (page: number) => void
  panelId: string
  label: string
}) {
  return (
    <nav className="artifact-pager" aria-label={`${label} pages`}>
      <button type="button" onClick={() => onChange(page - 1)} disabled={page === 0} aria-controls={panelId} aria-label={`Previous ${label.toLowerCase()} page`}>
        <span aria-hidden="true">←</span><span>Previous</span>
      </button>
      <p className="artifact-page-status" role="status">{page + 1} / {count}</p>
      <button type="button" onClick={() => onChange(page + 1)} disabled={page === count - 1} aria-controls={panelId} aria-label={`Next ${label.toLowerCase()} page`}>
        <span>Next</span><span aria-hidden="true">→</span>
      </button>
    </nav>
  )
}

function Letter({ id }: { id: string }) {
  const [page, setPage] = useState(0)
  const note = letterPages[page]
  return (
    <>
      <p className="artifact-eyebrow">A note from the island</p>
      <div className="artifact-letter-page" id={`${id}-page`}>
        <h2 className="artifact-title artifact-handwriting" id={`${id}-title`}>{note.title}</h2>
        <div className="artifact-letter-copy">
          {note.paragraphs.map((paragraph) => <p className="artifact-body" key={paragraph}>{paragraph}</p>)}
        </div>
        <p className="artifact-signature"><span>See you around,</span><span className="artifact-handwriting">Tarosh</span></p>
        <aside className="artifact-folded-note"><span className="artifact-handwriting">P.S.</span> {note.postscript}</aside>
      </div>
      <PageControls page={page} count={letterPages.length} onChange={setPage} panelId={`${id}-page`} label="Letter" />
    </>
  )
}

function FieldCards({ id }: { id: string }) {
  const [selected, setSelected] = useState(0)
  return (
    <>
      <header className="artifact-card-header">
        <p className="artifact-eyebrow">Field notes / toolkit</p>
        <h2 className="artifact-title artifact-handwriting" id={`${id}-title`}>Tools I reach for.</h2>
      </header>
      <Tabs classPrefix="artifact" labels={skillGroups.map((group) => group.name)} active={selected} onChange={setSelected} id={id} label="Tool categories" />
      {skillGroups.map((group, index) => (
        <div className="artifact-card-panel" key={group.name} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} tabIndex={0} hidden={selected !== index}>
          <div className="artifact-card-heading"><h3 className="artifact-handwriting">{group.name}</h3><span className="artifact-card-number" aria-hidden="true">0{index + 1}</span></div>
          <p className="artifact-note">{group.note}</p>
          <ul className="artifact-tool-list">
            {group.skills.map((skill) => <li key={skill}>{skill}</li>)}
          </ul>
        </div>
      ))}
      <p className="artifact-card-footer">Collected through building, shipping, and learning.</p>
    </>
  )
}

function ChalkNotes({ id }: { id: string }) {
  const [selected, setSelected] = useState(0)
  return (
    <>
      <p className="artifact-eyebrow">From my workbench</p>
      <h2 className="artifact-title artifact-handwriting" id={`${id}-title`}>Things I’ve made.</h2>
      <Tabs classPrefix="artifact" labels={['FitNyx', 'Driving research']} active={selected} onChange={setSelected} id={id} label="Projects on the chalkboard" />
      {projects.map((project, index) => (
        <article className="artifact-chalk-project" key={project.id} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} tabIndex={0} hidden={selected !== index}>
          <p className="artifact-project-category">{project.category}</p>
          <h3 className="artifact-project-name artifact-handwriting">{project.name}</h3>
          <p className="artifact-body">{project.summary}</p>
          <p className="artifact-project-detail">{project.detail}</p>
          <ul className="artifact-project-tools" aria-label={`${project.name} technologies`}>
            {project.tags.map((tag) => <li key={tag}>{tag}</li>)}
          </ul>
          <p className="artifact-project-date">{project.subtitle}</p>
        </article>
      ))}
    </>
  )
}

function DoorResume({ id }: { id: string }) {
  const [page, setPage] = useState(0)
  const entry = resumePages[page]
  return (
    <>
      <header className="artifact-resume-header">
        <p className="artifact-eyebrow">A brief history</p>
        <h2 className="artifact-title" id={`${id}-title`}>{profile.name}</h2>
        <p className="artifact-resume-specialty">Backend · Systems · Go</p>
      </header>
      <article className="artifact-resume-page" id={`${id}-page`}>
        <p className="artifact-resume-chapter">{entry.label}</p>
        <h3 className="artifact-resume-role">{entry.role.title}</h3>
        <p className="artifact-resume-company">{entry.role.company}</p>
        <p className="artifact-resume-period">{entry.role.period}</p>
        <ul className="artifact-resume-bullets">
          {entry.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
        </ul>
      </article>
      <PageControls page={page} count={resumePages.length} onChange={setPage} panelId={`${id}-page`} label="Experience" />
    </>
  )
}

function PierPostcard({ id }: { id: string }) {
  return (
    <>
      <header className="artifact-postcard-header">
        <p className="artifact-eyebrow">A postcard from New Delhi</p>
        <div className="artifact-postmark" aria-hidden="true"><span>NEW DELHI</span><span>INDIA</span></div>
      </header>
      <h2 className="artifact-title artifact-handwriting" id={`${id}-title`}>Let’s make something.</h2>
      <p className="artifact-body">Have a hard problem worth solving? I’m open to senior backend, distributed systems, and infrastructure roles.</p>
      <address className="artifact-postcard-address">
        {contacts.map((contact) => (
          <a key={contact.label} href={contact.href} target={contact.external ? '_blank' : undefined} rel={contact.external ? 'noopener noreferrer' : undefined}>
            <span className="artifact-address-label">{contact.label}</span>
            <span className="artifact-address-value">{contact.value}</span>
            <span className="artifact-address-arrow" aria-hidden="true">↗</span>
          </a>
        ))}
      </address>
      <footer className="artifact-postcard-footer"><span className="artifact-handwriting">Talk soon, Tarosh</span><span>New Delhi · Remote-friendly</span></footer>
    </>
  )
}

function ArtifactEdition({ variant, stage }: { variant: ContentVariant; stage: number }) {
  const uniqueId = useId()
  const id = `artifact-${variant}-${uniqueId}`
  return (
    <section className={`artifact-content artifact-content--${variant}`} data-stage={stage} data-lenis-prevent tabIndex={0} aria-labelledby={`${id}-title`}>
      {variant === 'letter' && <Letter id={id} />}
      {variant === 'cards' && <FieldCards id={id} />}
      {variant === 'chalk' && <ChalkNotes id={id} />}
      {variant === 'door' && <DoorResume id={id} />}
      {variant === 'postcard' && <PierPostcard id={id} />}
    </section>
  )
}

export default function PortfolioContent({ stage, compact = false, variant }: ContentProps) {
  const id = useId()
  const chapter = chapters.find((item) => item.stage === stage)
  if (!chapter) return null
  if (variant) return <ArtifactEdition key={variant} stage={stage} variant={variant} />

  let content: ReactNode
  switch (stage) {
    case 1: content = <About compact={compact} />; break
    case 2: content = <Skills />; break
    case 3: content = <Projects compact={compact} />; break
    case 4: content = <Experience compact={compact} />; break
    case 5: content = <Contact compact={compact} />; break
  }

  return (
    <section
      className={`board-content${compact ? ' board-content--compact' : ''}`}
      data-stage={stage}
      data-lenis-prevent={compact || undefined}
      tabIndex={compact ? 0 : undefined}
      aria-labelledby={`${id}-title`}
    >
      <header className="board-header">
        <p className="board-eyebrow"><span aria-hidden="true">0{stage} / </span>{chapter.label}</p>
        <h2 className="board-title" id={`${id}-title`}>{chapter.title}</h2>
      </header>
      {content}
    </section>
  )
}

import { fieldNotes, profile } from '../portfolio-data'

function FieldNoteFooter({ label }: { label: string }) {
  return <footer className="ar-page-footer"><span>{profile.name}</span><span>{label}</span></footer>
}

export function LagoonFieldLog({ id }: { id: string }) {
  const note = fieldNotes.lagoon
  return (
    <article className="ar-field-page ar-field-page--lagoon">
      <header className="ar-heading">
        <p className="ar-overline">The lagoon / Notes on scale</p>
        <h1 id={`${id}-title`}>{note.title}</h1>
        <p className="ar-deck">{note.introduction}</p>
      </header>
      <dl className="ar-field-metrics">
        {note.metrics.map((metric) => (
          <div key={metric.label}>
            <dt>{metric.value}</dt>
            <dd>{metric.label}</dd>
          </div>
        ))}
      </dl>
      <div className="ar-field-entries">
        {note.entries.map((entry, index) => (
          <section className="ar-field-entry" key={entry.label} aria-labelledby={`${id}-entry-${index}`}>
            <p className="ar-overline">{entry.label}</p>
            <h2 id={`${id}-entry-${index}`}>{entry.title}</h2>
            <p className="ar-body">{entry.body}</p>
            <p className="ar-field-detail">{entry.detail}</p>
          </section>
        ))}
      </div>
      <FieldNoteFooter label="Magicpin / Commerce & transit" />
    </article>
  )
}

export function WestShoreFieldBoard({ id }: { id: string }) {
  const note = fieldNotes.west
  return (
    <article className="ar-field-page ar-field-page--west">
      <header className="ar-heading">
        <p className="ar-overline">The west shore / Infrastructure notes</p>
        <h1 id={`${id}-title`}>{note.title}</h1>
        <p className="ar-deck">{note.introduction}</p>
      </header>
      <section className="ar-field-result" aria-labelledby={`${id}-result`}>
        <div>
          <h2 className="ar-overline" id={`${id}-result`}>The architecture change</h2>
          <p className="ar-lead">{note.change}</p>
        </div>
        <dl>
          <dt>{note.metric.value}</dt>
          <dd>{note.metric.label}</dd>
        </dl>
      </section>
      <ol className="ar-field-flow" aria-label="Catalog processing flow">
        {note.flow.map((step, index) => (
          <li key={step}>
            <span className="ar-field-step" aria-hidden="true">0{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <section className="ar-field-toolkit" aria-labelledby={`${id}-toolkit`}>
        <div>
          <h2 id={`${id}-toolkit`}>{note.toolkitTitle}</h2>
          <p className="ar-body">{note.toolkitBody}</p>
        </div>
        <dl>
          {note.tools.map((tool) => <div key={tool.name}><dt>{tool.name}</dt><dd>{tool.items}</dd></div>)}
        </dl>
      </section>
      <FieldNoteFooter label="Magicpin / Catalog pipeline" />
    </article>
  )
}

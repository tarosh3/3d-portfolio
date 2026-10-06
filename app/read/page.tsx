import type { Metadata } from 'next'
import Link from 'next/link'
import PortfolioContent from '../components/PortfolioContent'
import BrandLogo from '../components/BrandLogo'
import { chapters } from '../portfolio-data'

export const metadata: Metadata = {
  title: 'Tarosh Mathuria — Reading edition',
  description: 'Experience, projects, skills, and contact details for Tarosh Mathuria, senior backend and distributed systems engineer in New Delhi.',
}

export default function ReadingEdition() {
  return <main className="reading-edition">
    <header className="reading-header"><span className="guide-eyebrow">The field guide</span><Link href="/">Explore the island ↗</Link><h1 className="reading-brand"><BrandLogo priority /></h1><p>Senior software engineer · New Delhi, India</p></header>
    <nav className="guide-nav" aria-label="Portfolio chapters">{chapters.map(chapter => <a key={chapter.stage} href={`#chapter-${chapter.stage}`}>{chapter.label}</a>)}</nav>
    {chapters.map(chapter => <div key={chapter.stage} id={`chapter-${chapter.stage}`} className="guide-chapter"><PortfolioContent stage={chapter.stage} /></div>)}
    <footer className="guide-footer"><span>Made with curiosity. Built to explore.</span><Link href="/">Back to the island ↗</Link><span>Island model by Jef Belmans.</span></footer>
  </main>
}

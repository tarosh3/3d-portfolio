import Image from 'next/image'

const COMPACT_LAYOUT = '(max-width: 760px), (max-width: 1024px) and (max-height: 500px)'

/** Both supplied wordmarks share a 3:1 canvas, keeping the header stable while
 * the browser selects the compact initials on phone layouts. */
export default function BrandLogo({ responsive = false, decorative = false, priority = false }: {
  responsive?: boolean
  decorative?: boolean
  priority?: boolean
}) {
  return <picture className="island-brand-logo">
    {responsive && <source media={COMPACT_LAYOUT} srcSet="/brand/tm-island.webp" />}
    <Image src="/brand/tarosh-mathuria.webp" alt={decorative ? '' : 'Tarosh Mathuria — A personal island'} width={960} height={320} priority={priority} unoptimized />
  </picture>
}

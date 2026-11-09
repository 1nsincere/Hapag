import { useId } from 'react'

/**
 * The Hapag logo ("Pinggan"): a plate seen from above with two slots cut out,
 * so it reads as an H. Takes the text colour (currentColor).
 * `rim={false}` drops the thin outer ring for very small sizes.
 */
export default function HapagMark({ size = 32, rim = true, className, title = 'Hapag' }: {
  size?: number | string
  rim?: boolean
  className?: string
  title?: string
}) {
  const id = useId().replace(/:/g, '')
  const plateR = rim ? 35 : 44
  const slotW = rim ? 15 : 18
  const gap = rim ? 8 : 9
  const x = 50 - slotW / 2
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} role="img" aria-label={title}>
      <mask id={`hm-${id}`}>
        <rect width="100" height="100" fill="#fff" />
        <rect x={x} y={-10} width={slotW} height={60 - gap} rx={slotW / 2} fill="#000" />
        <rect x={x} y={50 + gap} width={slotW} height={60 - gap} rx={slotW / 2} fill="#000" />
      </mask>
      {rim && <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="3" />}
      <circle cx="50" cy="50" r={plateR} fill="currentColor" mask={`url(#hm-${id})`} />
    </svg>
  )
}

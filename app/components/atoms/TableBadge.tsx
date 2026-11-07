/**
 * Atom: TableBadge — the one way a table is shown on staff screens.
 * Solid identity colour + white text (WCAG AA, see lib/tableColors.ts).
 */
import { tableColor } from '@/lib/tableColors'

const SIZES = {
  sm: 'h-6 px-2 text-xs gap-1 rounded-md',
  md: 'h-7 px-2.5 text-sm gap-1.5 rounded-lg',
  lg: 'h-9 px-3 text-base gap-1.5 rounded-xl',
} as const

export function TableBadge({ tableNumber, size = 'md', short = false, className = '' }: {
  tableNumber: number
  size?: keyof typeof SIZES
  /** "T8" instead of "Table 8" — for tight spaces */
  short?: boolean
  className?: string
}) {
  const color = tableColor(tableNumber)
  const takeout = !tableNumber || tableNumber <= 0
  const label = takeout ? 'Takeout' : short ? `T${tableNumber}` : `Table ${tableNumber}`
  return (
    <span
      className={`inline-flex shrink-0 items-center font-bold leading-none tracking-wide whitespace-nowrap shadow-sm ${SIZES[size]} ${className}`}
      style={{ backgroundColor: color.bg, color: '#FFFFFF' }}
      title={takeout ? 'Takeout order' : `Table ${tableNumber}`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '1.1em' }} aria-hidden="true">
        {takeout ? 'takeout_dining' : 'table_restaurant'}
      </span>
      {label}
    </span>
  )
}

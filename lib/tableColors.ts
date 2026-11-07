/**
 * ─── Design token: table identity colours ────────────────────────────────────
 *
 * Every table number gets its own colour so staff can tell orders apart at a
 * glance — the same colour on the cashier, alerts and kitchen screens.
 *
 * Rules:
 *  • White text on every colour passes WCAG AA (≥ 4.5:1) — verified in
 *    scripts/check-contrast.mjs. Don't add a colour without running it.
 *  • Neighbouring table numbers get clearly different hues (the order below
 *    alternates warm/cool) so tables 2 and 3 never look alike.
 *  • Colour is never the only cue — the table number is always printed too.
 */

export interface TableColor {
  name: string
  bg: string     // badge background (white text on top)
  soft: string   // light tint for card accents / borders
}

export const TABLE_COLORS: TableColor[] = [
  { name: 'Red',     bg: '#B91C1C', soft: '#FEE2E2' },
  { name: 'Blue',    bg: '#1D4ED8', soft: '#DBEAFE' },
  { name: 'Green',   bg: '#15803D', soft: '#DCFCE7' },
  { name: 'Violet',  bg: '#6D28D9', soft: '#EDE9FE' },
  { name: 'Orange',  bg: '#C2410C', soft: '#FFEDD5' },
  { name: 'Teal',    bg: '#0F766E', soft: '#CCFBF1' },
  { name: 'Fuchsia', bg: '#A21CAF', soft: '#FAE8FF' },
  { name: 'Sky',     bg: '#0369A1', soft: '#E0F2FE' },
  { name: 'Amber',   bg: '#A16207', soft: '#FEF3C7' },
  { name: 'Indigo',  bg: '#4338CA', soft: '#E0E7FF' },
  { name: 'Rose',    bg: '#BE123C', soft: '#FFE4E6' },
  { name: 'Lime',    bg: '#4D7C0F', soft: '#ECFCCB' },
]

/** Takeout / counter orders (table 0) */
export const TAKEOUT_COLOR: TableColor = { name: 'Charcoal', bg: '#27272A', soft: '#F4F4F5' }

export function tableColor(tableNumber: number): TableColor {
  if (!tableNumber || tableNumber <= 0) return TAKEOUT_COLOR
  return TABLE_COLORS[(tableNumber - 1) % TABLE_COLORS.length]
}

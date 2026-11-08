/**
 * ─── Hapag brand theming ─────────────────────────────────────────────────────
 *
 * Each restaurant picks ONE brand colour (+ light or dark). Everything else is
 * derived here so any colour still looks polished and stays readable:
 *   • button fill + the text colour on it (white or dark, whichever passes WCAG)
 *   • an "accent text" shade dark/light enough to use for prices and links
 *   • soft tints for highlights, borders and glows
 * The values are applied as CSS variables (see app/hapag.css).
 */

export type ThemeMode = 'light' | 'dark'

export interface ThemePreset {
  id: string
  name: string
  hint: string
  color: string
  mode: ThemeMode
}

export const DEFAULT_BRAND_COLOR = '#C8510F'
export const DEFAULT_THEME_MODE: ThemeMode = 'light'

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'saffron',    name: 'Saffron',     hint: 'Default — warm, appetising, eye-catching', color: '#C8510F', mode: 'light' },
  { id: 'terracotta', name: 'Terracotta',  hint: 'Grills, Mediterranean, rustic',             color: '#B4532A', mode: 'light' },
  { id: 'emerald',    name: 'Emerald',     hint: 'Cafés, healthy, garden',                    color: '#0E7A57', mode: 'light' },
  { id: 'ocean',      name: 'Ocean',       hint: 'Seafood, coastal, fresh',                   color: '#1F56C4', mode: 'light' },
  { id: 'burgundy',   name: 'Burgundy',    hint: 'Wine bars, fine dining',                    color: '#8E1E3E', mode: 'light' },
  { id: 'charcoal',   name: 'Charcoal',    hint: 'Minimal, modern, Japanese',                 color: '#2A2724', mode: 'light' },
  { id: 'noir',       name: 'Noir & Gold', hint: 'Dark, moody, luxury nights',                color: '#C9A66B', mode: 'dark' },
]

const BASE = {
  light: { bg: '#FBF7F1', text: '#1F1A14' },
  dark:  { bg: '#0B0A08', text: '#F2EADB' },
} as const

// ── colour maths ────────────────────────────────────────────────────────────
type RGB = [number, number, number]

export function normalizeHex(input: string | undefined | null): string | null {
  if (!input) return null
  let h = input.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map(c => c + c).join('')
  return /^[0-9a-fA-F]{6}$/.test(h) ? `#${h.toUpperCase()}` : null
}

const toRgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}
const toHex = ([r, g, b]: RGB) =>
  '#' + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase()

const mix = (a: string, b: string, t: number) => {
  const [x, y] = [toRgb(a), toRgb(b)]
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t])
}

const luminance = (hex: string) => {
  const lin = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const [r, g, b] = toRgb(hex)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const rgba = (hex: string, alpha: number) => {
  const [r, g, b] = toRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Nudge `color` toward `toward` until it reaches `min` contrast against `against`. */
function ensureContrast(color: string, against: string, toward: string, min = 4.5) {
  let c = color
  for (let t = 0; t <= 1 && contrast(c, against) < min; t += 0.04) c = mix(color, toward, t)
  return c
}

// ── public API ──────────────────────────────────────────────────────────────
export interface BrandTheme {
  mode: ThemeMode
  vars: Record<string, string>
  /** For the admin preview: are the key text/background pairs readable? */
  report: { buttonText: number; accentText: number }
}

export function buildBrandTheme(brandColor?: string | null, modeInput?: string | null): BrandTheme {
  const mode: ThemeMode = modeInput === 'dark' ? 'dark' : 'light'
  const accent = normalizeHex(brandColor) ?? DEFAULT_BRAND_COLOR
  const { bg, text } = BASE[mode]

  // Button: keep the brand colour, choose the readable text on it; if neither
  // white nor dark text reaches 4.5:1, deepen the fill until white text does.
  let fill = accent
  const white = contrast(accent, '#FFFFFF')
  const dark = contrast(accent, BASE.light.text)
  let onAccent = white >= dark ? '#FFFFFF' : BASE.light.text
  if (Math.max(white, dark) < 4.5) {
    fill = ensureContrast(accent, '#FFFFFF', '#000000')
    onAccent = '#FFFFFF'
  }

  // Accent used as text (prices, links, eyebrows) must read on the page background
  const accentText = ensureContrast(accent, bg, text)
  const strong = mix(fill, mode === 'light' ? '#000000' : '#FFFFFF', 0.12)

  return {
    mode,
    vars: {
      '--hp-accent': fill,
      '--hp-on-accent': onAccent,
      '--hp-accent-strong': strong,
      '--hp-accent-text': accentText,
      '--hp-accent-soft': rgba(accent, mode === 'light' ? 0.1 : 0.15),
      '--hp-accent-line': rgba(accent, mode === 'light' ? 0.42 : 0.4),
      '--hp-accent-glow': rgba(accent, mode === 'light' ? 0.16 : 0.18),
    },
    report: { buttonText: contrast(fill, onAccent), accentText: contrast(accentText, bg) },
  }
}

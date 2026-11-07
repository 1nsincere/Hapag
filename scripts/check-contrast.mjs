#!/usr/bin/env node
/**
 * Verifies the table identity colours (lib/tableColors.ts) meet WCAG AA:
 * white text on each badge colour must be ≥ 4.5:1. Also reports how distinct
 * neighbouring table colours are.   Run: node scripts/check-contrast.mjs
 */
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/tableColors.ts', import.meta.url), 'utf8')
const colors = [...src.matchAll(/name: '([^']+)',\s*bg: '(#[0-9A-Fa-f]{6})'/g)].map(m => ({ name: m[1], bg: m[2] }))

const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lum = hex => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255) }
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const hue = hex => {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (!d) return 0
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

let fail = 0
console.log('Colour      Badge      White-text contrast')
for (const c of colors) {
  const ratio = contrast(c.bg, '#FFFFFF')
  const ok = ratio >= 4.5
  if (!ok) fail++
  console.log(`${c.name.padEnd(11)} ${c.bg}    ${ratio.toFixed(2)}:1  ${ok ? 'AA ✓' : 'FAIL ✗'}`)
}
const gaps = colors.map((c, i) => {
  const next = colors[(i + 1) % colors.length]
  const d = Math.abs(hue(c.bg) - hue(next.bg))
  return Math.min(d, 360 - d)
})
console.log(`\nSmallest hue gap between neighbouring tables: ${Math.round(Math.min(...gaps))}°`)
if (fail) { console.error(`\n${fail} colour(s) fail WCAG AA`); process.exit(1) }
console.log('All table colours pass WCAG AA.')

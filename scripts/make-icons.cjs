/**
 * Builds the Hapag logo files and app icons from one drawing ("Pinggan":
 * a plate seen from above, with two slots cut out so it reads as an H).
 *
 *   npm run make-icons
 *
 * Writes: public/brand/*.svg, public/icons/*.png, app/icon.svg,
 * app/apple-icon.png and app/favicon.ico. Needs Microsoft Edge (or set
 * PW_CHANNEL=chrome) for the PNG renders.
 */
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright-core')

const LEAF = '#0F2B1F'
const MANGO = '#F2B33D'
const PAPER = '#F2F1EA'
const root = path.join(__dirname, '..')
const out = (p) => path.join(root, p)

// The mark, in a 100×100 box. `rim: false` drops the thin outer ring (for tiny sizes).
function mark({ color, rim = true, id = 'h' }) {
  const plateR = rim ? 35 : 44
  const slotW = rim ? 15 : 18
  const gap = rim ? 8 : 9            // half the crossbar height
  const x = 50 - slotW / 2
  return `
  <mask id="${id}"><rect width="100" height="100" fill="#fff"/>
    <rect x="${x}" y="-10" width="${slotW}" height="${60 - gap}" rx="${slotW / 2}" fill="#000"/>
    <rect x="${x}" y="${50 + gap}" width="${slotW}" height="${60 - gap}" rx="${slotW / 2}" fill="#000"/></mask>
  ${rim ? `<circle cx="50" cy="50" r="44" fill="none" stroke="${color}" stroke-width="3"/>` : ''}
  <circle cx="50" cy="50" r="${plateR}" fill="${color}" mask="url(#${id})"/>`
}

const svg = (body, size = 100) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${body}</svg>\n`

// Mark inside a square tile. scale = share of the tile the mark takes; radius = corner rounding (0 = full bleed).
function tile({ scale, radius = 0, rim = true, bg = LEAF, fg = MANGO }) {
  const s = 100 * scale, o = (100 - s) / 2
  return svg(`<rect width="100" height="100" rx="${radius}" fill="${bg}"/>
  <g transform="translate(${o} ${o}) scale(${scale})">${mark({ color: fg, rim })}</g>`)
}

const files = {
  'public/brand/hapag-mark.svg': svg(mark({ color: LEAF })),
  'public/brand/hapag-mark-mango.svg': svg(mark({ color: MANGO })),
  'public/brand/hapag-mark-paper.svg': svg(mark({ color: PAPER })),
  'public/brand/hapag-icon.svg': tile({ scale: 0.7, radius: 22 }),
  'app/icon.svg': tile({ scale: 0.86, radius: 22, rim: false }),
}

const pngs = [
  // [file, px, svg]
  ['public/icons/icon-192.png', 192, tile({ scale: 0.68 })],
  ['public/icons/icon-512.png', 512, tile({ scale: 0.68 })],
  ['public/icons/maskable-512.png', 512, tile({ scale: 0.5 })],     // stays inside Android's safe circle
  ['app/apple-icon.png', 180, tile({ scale: 0.66 })],                 // iOS rounds the corners itself
  ['public/icons/favicon-32.png', 32, tile({ scale: 0.9, radius: 22, rim: false })],
]

;(async () => {
  for (const [f, s] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(out(f)), { recursive: true })
    fs.writeFileSync(out(f), s)
    console.log('wrote', f)
  }

  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' })
  const page = await browser.newPage()
  for (const [f, px, s] of pngs) {
    await page.setViewportSize({ width: Math.max(px, 200), height: Math.max(px, 200) })   // browsers refuse tiny windows
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${px}px;height:${px}px}</style>${s}`)
    fs.mkdirSync(path.dirname(out(f)), { recursive: true })
    await page.screenshot({ path: out(f), omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } })
    console.log('wrote', f)
  }
  await browser.close()

  // favicon.ico: an ICO file holding the 32px PNG
  const png = fs.readFileSync(out('public/icons/favicon-32.png'))
  const head = Buffer.alloc(22)
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4)      // ICO, 1 image
  head.writeUInt8(32, 6); head.writeUInt8(32, 7); head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12)
  head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18)
  fs.writeFileSync(out('app/favicon.ico'), Buffer.concat([head, png]))
  fs.unlinkSync(out('public/icons/favicon-32.png'))
  console.log('wrote app/favicon.ico')
})().catch((e) => { console.error(e); process.exit(1) })

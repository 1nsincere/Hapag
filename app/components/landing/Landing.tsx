'use client'

/**
 * Hapag showcase landing page (demo site only — see app/page.tsx).
 * Direction: banana leaf, achuete and mango; signage-style condensed headlines;
 * kitchen-ticket mono labels. Styling in ./landing.css (scoped under .lp).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import Image from 'next/image'
import { QRCodeSVG } from 'qrcode.react'
import { THEME_PRESETS, buildBrandTheme, normalizeHex, type ThemeMode } from '@/lib/theme'
import type { DemoRole } from '@/lib/demo'
import { SITE } from '@/lib/site'
import { enterDemo } from './enterDemo'
import { lpMono, lpSans } from './fonts'
import { bell, getSound, getSoundServer, printer, setSound, subscribeSound, tick } from './sound'
import './landing.css'

// ─── Content ────────────────────────────────────────────────────────────────

/** One order, followed through the restaurant (times are the order's own log). */
const TIMELINE = [
  { time: '7:02 PM', title: 'The guest orders', body: 'Scans the code on Table 4, picks Kare-Kare and three garlic rice, and sends it. The server checks every price.', shot: 'guest-cart', device: 'phone' },
  { time: '7:03 PM', title: 'The cashier accepts', body: 'The order waits in the corner of the cashier screen, with a chime, until someone taps Accept.', shot: 'cashier-orders', device: 'desktop' },
  { time: '7:04 PM', title: 'Paid', body: 'QR Ph, card, or cash at the counter. It only counts as paid once the payment is confirmed.', shot: 'guest-status', device: 'phone' },
  { time: '7:05 PM', title: 'The kitchen starts', body: 'The ticket shows up on the kitchen screen with a timer. One tap to start cooking, one tap when it’s ready.', shot: 'kitchen', device: 'desktop' },
  { time: '7:21 PM', title: 'Ready to serve', body: 'The floor plan shows which table is waiting, eating, or ready to clear, on every floor.', shot: 'cashier-floor', device: 'desktop' },
  { time: 'Anytime', title: 'The owner checks in', body: 'Menu, tables, floor plan, staff and the restaurant’s colours, all managed in one place.', shot: 'admin-floor', device: 'desktop' },
] as const

/** Tickets the hero printer cycles through */
const PRINT_QUEUE = [
  { head: 'TABLE 04', meta: '#A031 · 7:02 PM', time: '7:02 PM', feed: 'Table 4 ordered Kare-Kare for 3–4', lines: [['1× Kare-Kare', 'good for 3–4'], ['3× Garlic rice']], total: '₱1,430.00', stamp: 'NEW' },
  { head: 'TABLE 02', meta: '#A032 · 7:04 PM', time: '7:04 PM', feed: 'Table 2 paid ₱500.00 by QR Ph', lines: [['1× Sizzling Sisig'], ['2× Calamansi juice']], total: '₱500.00', stamp: 'PAID · QR PH' },
  { head: 'TAKEOUT', meta: '#A033 · 7:06 PM', time: '7:06 PM', feed: 'Takeout #A033 paid in cash at the counter', lines: [['3× Pork BBQ'], ['3× Garlic rice']], total: '₱630.00', stamp: 'CASH' },
  { head: 'TABLE 07', meta: '#A034 · 7:09 PM', time: '7:09 PM', feed: 'Table 7 ordered two Halo-Halo and a Leche flan', lines: [['2× Halo-Halo'], ['1× Leche flan']], total: '₱510.00', stamp: 'NEW' },
]

/** The kitchen rail: minutes already waiting when the page opens */
const RAIL = [
  { table: 'Table 3', items: ['1× Crispy Pata', '2× Bagoong rice'], waited: 14 * 60 + 20, state: 'Cooking' },
  { table: 'Table 5', items: ['2× Chicken Inasal', '2× Garlic rice'], waited: 9 * 60 + 5, state: 'Cooking' },
  { table: 'Takeout', items: ['3× Pork BBQ', '1× Pancit Canton'], waited: 6 * 60 + 41, state: 'In queue' },
  { table: 'Table 8', items: ['1× Beef Mami', '1× Leche flan'], waited: 3 * 60 + 12, state: 'In queue' },
  { table: 'Table 1', items: ['1× Sinigang na Baboy', '4× Sago’t Gulaman'], waited: 48, state: 'New' },
]

/** Real excerpts from the codebase, shown in "Under the hood" */
const CODE_TABS = [
  {
    id: 'pricing', label: 'Server pricing', file: 'lib/server/orders.ts',
    note: 'The phone only says what it wants. Names, prices, tax and totals come from the menu and Settings.',
    code: `// The phone sends dish ids and quantities. Never prices.
const menu = await readMenu(db, tx, bases)
const items = priceLines(lines, menu)        // names + prices from the menu
for (const [base, qty] of qtyByBase(items)) {
  const m = menu.get(base)!
  if (m.available === false) throw new OrderError(soldOutMessage(m), 409)
  if (typeof m.stock === 'number' && m.stock < qty)
    throw new OrderError(soldOutMessage(m, m.stock), 409)
}
tx.set(ref, { items, total: subtotalOf(items), priceSource: 'server', ... })`,
  },
  {
    id: 'payments', label: 'Payment webhook', file: 'lib/server/payments/practice.ts',
    note: 'An order is marked paid only by a signed message from the payment provider, for the exact amount.',
    code: `// HMAC-SHA256 over "timestamp.body", the scheme real providers use
const [t, v1] = parseSignature(headers.get('x-hapag-signature'))
if (Math.abs(Date.now() / 1000 - t) > MAX_AGE_SECONDS) throw new Error('stale')
const expected = Buffer.from(sign(t, rawBody), 'hex')
const given = Buffer.from(v1, 'hex')
if (given.length !== expected.length || !timingSafeEqual(given, expected))
  throw new Error('bad signature')            // fake "paid" messages stop here`,
  },
  {
    id: 'rules', label: 'Security rules', file: 'firestore.rules',
    note: 'The database itself refuses what a screen shouldn’t do, even if someone edits the page.',
    code: `match /orders/{order} {
  // Guests see only orders placed from their own phone
  allow read: if isAdminOrCashier() || isKitchen() ||
    (isAuthenticated() && resource.data.customerUid == request.auth.uid);
  // Guests order and pay through the server, never directly
  allow create: if isAdminOrCashier();
  allow update: if isAdminOrCashier() || isKitchen();
  allow delete: if isOwner();
}`,
  },
] as const

const STACK = ['Next.js 16', 'React 19', 'TypeScript', 'Firebase · Firestore & Auth', 'Tailwind CSS 4', 'Playwright']

/** Dishes for the closing band (same photos as the demo menu) */
const DISH_PHOTOS = [
  { name: 'Kare-Kare', price: '₱485', src: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600&q=70&auto=format&fit=crop' },
  { name: 'Sizzling Sisig', price: '₱320', src: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=70&auto=format&fit=crop' },
  { name: 'Halo-Halo', price: '₱195', src: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=600&q=70&auto=format&fit=crop' },
]

const FEATURES = [
  { group: 'For guests', img: '/landing/guest-menu.jpg', items: ['Order without downloading anything', 'Photo menu with sizes and sold-out labels', 'Pay by QR Ph, card, or cash at the counter', 'Follow the order live, from kitchen to table'] },
  { group: 'For the floor', img: '/landing/cashier-floor.jpg', items: ['Alerts stay on screen until someone handles them', 'A live floor plan, across every floor', 'A “Call staff” button at every table', 'Keeps working when the Wi-Fi drops'] },
  { group: 'For the owner', img: '/landing/admin-menu.jpg', items: ['Menu, tables and staff logins in one place', 'The restaurant’s own colours on every guest screen', 'Prices are checked by the server, not the phone', 'Each table’s QR code carries its own secret'] },
]

const ROLES: { id: DemoRole | 'guest'; title: string; body: string; cta: string }[] = [
  { id: 'guest', title: 'Guest', body: 'Order from Table 1 like a diner: menu, cart, payment, live status.', cta: 'Open the menu' },
  { id: 'cashier', title: 'Cashier', body: 'Accept orders, answer staff calls, take payments, watch the floor plan.', cta: 'Enter as cashier' },
  { id: 'kitchen', title: 'Kitchen', body: 'Paid tickets arrive instantly. Start cooking, mark ready, see history.', cta: 'Enter as kitchen' },
  { id: 'admin', title: 'Owner', body: 'Menu, tables, the floor plan editor, staff, insights and brand colours.', cta: 'Enter as owner' },
]

const noopSubscribe = () => () => {}

/** Adds .is-in to [data-reveal] elements once they scroll into view (they start visible). */
function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const els = root.current?.querySelectorAll<HTMLElement>('[data-reveal]')
    if (!els?.length) return
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target) } })
    }, { rootMargin: '0px 0px -10% 0px' })
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [root])
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function Landing({ guestPath }: { guestPath: string }) {
  const root = useRef<HTMLDivElement>(null)
  useReveal(root)
  const [scrolled, setScrolled] = useState(false)
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => '')
  // Intro: 'on' while it plays, 'off' once gone. `skipped` stays true so the hero doesn't wait.
  const [intro, setIntro] = useState<'on' | 'off'>('on')
  const [skipped, setSkipped] = useState(false)

  // Always start at the very top on load / refresh (also ignores #anchors in the address)
  useEffect(() => {
    const prev = history.scrollRestoration
    history.scrollRestoration = 'manual'
    if (location.hash) history.replaceState(null, '', location.pathname + location.search)
    window.scrollTo(0, 0)
    return () => { history.scrollRestoration = prev }
  }, [])

  // Intro timeline (the animation itself is CSS); page scroll is locked while it plays
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const html = document.documentElement
    if (!reduce) html.classList.add('lp-lock')
    const sfx = setTimeout(() => printer(), 250)
    const done = setTimeout(() => setIntro('off'), reduce ? 0 : 3050)
    return () => { clearTimeout(sfx); clearTimeout(done); html.classList.remove('lp-lock') }
  }, [])
  useEffect(() => {
    if (intro === 'off') document.documentElement.classList.remove('lp-lock')
  }, [intro])

  const skipIntro = useCallback(() => {
    if (skipped) return
    setSkipped(true)
    setTimeout(() => setIntro('off'), 520)
  }, [skipped])
  useEffect(() => {
    if (intro === 'off') return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); skipIntro() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [intro, skipIntro])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    const first = requestAnimationFrame(onScroll)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(first) }
  }, [])

  return (
    <div ref={root} className={`lp ${lpSans.variable} ${lpMono.variable}${skipped ? ' intro-skipped' : ''}`}>
      {intro === 'on' && <Intro skipping={skipped} onSkip={skipIntro} />}
      <Nav scrolled={scrolled} />
      <Hero guestPath={guestPath} />
      <Weave />
      <Timeline />
      <Rush />
      <Features />
      <BrandStudio />
      <UnderTheHood />
      <Demo guestPath={guestPath} origin={origin} />
      <KainNa />
      <Footer />
    </div>
  )
}

// ─── Sections ───────────────────────────────────────────────────────────────

const NAV = [
  { id: 'how', label: 'How it works' },
  { id: 'features', label: 'Features' },
  { id: 'brand', label: 'Your colours' },
  { id: 'tech', label: 'Under the hood' },
]

function Nav({ scrolled }: { scrolled: boolean }) {
  const [current, setCurrent] = useState('')
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const els = [...NAV.map(n => n.id), 'demo'].map(id => document.getElementById(id)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setCurrent(e.target.id) })
    }, { rootMargin: '-40% 0px -55% 0px' })
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])
  useEffect(() => {
    if (!open) return
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])

  return (
    <header className={`lp-nav${scrolled || open ? ' is-scrolled' : ''}`}>
      <a href="#top" className="lp-logo" aria-label="Hapag, back to top">hapag</a>
      <nav aria-label="Sections" className="lp-nav-links">
        {NAV.map(n => <a key={n.id} href={`#${n.id}`} className={current === n.id ? 'is-current' : ''} aria-current={current === n.id ? 'true' : undefined}>{n.label}</a>)}
      </nav>
      <div className="lp-nav-actions">
        <SoundToggle />
        <a href="#demo" className="lp-btn lp-btn-sm lp-nav-cta">Try the demo</a>
        <button type="button" className="lp-menu-btn" aria-expanded={open} aria-controls="lp-menu" onClick={() => setOpen(v => !v)}>
          {open ? 'Close' : 'Menu'}
        </button>
      </div>
      {open && (
        <nav id="lp-menu" className="lp-menu" aria-label="Sections">
          {NAV.map(n => <a key={n.id} href={`#${n.id}`} onClick={() => setOpen(false)}>{n.label}</a>)}
          <a href="#demo" className="lp-btn lp-btn-mango" onClick={() => setOpen(false)}>Try the live demo</a>
        </nav>
      )}
    </header>
  )
}

/** Opening: the kitchen printer prints Hapag's first ticket, it gets stamped, the curtain lifts. */
function Intro({ skipping, onSkip }: { skipping: boolean; onSkip: () => void }) {
  return (
    <div className={`lp-intro${skipping ? ' is-skipping' : ''}`} onClick={onSkip}>
      <div className="lp-intro-printer" aria-hidden="true">
        <div className="lp-printer-body"><span className="lp-printer-led" /><span>HAPAG · KITCHEN</span></div>
        <div className="lp-printer-slot">
          <div className="lp-ticket lp-intro-ticket">
            <div className="lp-ticket-row"><b>ORDER #0001</b><span>TABLE 01</span></div>
            <div className="lp-ticket-line">1× QR ordering</div>
            <div className="lp-ticket-line">1× Live kitchen screen</div>
            <div className="lp-ticket-line">1× Floor plan, every floor</div>
            <div className="lp-ticket-row lp-ticket-total"><span>TOTAL</span><b>SALAMAT</b></div>
            <span className="lp-intro-stamp">KAIN NA</span>
          </div>
        </div>
      </div>
      <p className="lp-intro-caption" aria-live="polite">Preparing your table…</p>
      <button type="button" className="lp-intro-skip" onClick={e => { e.stopPropagation(); onSkip() }}>Skip intro</button>
    </div>
  )
}

function SoundToggle() {
  const on = useSyncExternalStore(subscribeSound, getSound, getSoundServer)
  return (
    <button type="button" className={`lp-sound${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => setSound(!on)} title={on ? 'Turn sound off' : 'Turn sound on'}>
      <span className="lp-sound-bars" aria-hidden="true"><i /><i /><i /><i /></span>
      Sound {on ? 'on' : 'off'}
    </button>
  )
}

function Hero({ guestPath }: { guestPath: string }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => { setN(v => v + 1); printer() }, 3800)
    return () => clearInterval(t)
  }, [])
  const now = PRINT_QUEUE[n % PRINT_QUEUE.length]
  return (
    <section id="top" className="lp-hero">
      <div className="lp-wrap lp-feed" aria-live="off">
        <span className="lp-feed-live"><i aria-hidden="true" />Live orders</span>
        <span key={n} className="lp-feed-item"><time>{now.time}</time>{now.feed}</span>
        <span className="lp-feed-meta">Demo restaurant · resets nightly</span>
      </div>
      <div className="lp-wrap lp-hero-inner">
        <div className="lp-hero-copy">
          <p className="lp-def"><b>ha·pag</b> <i>(n.)</i> dining table</p>
          <h1 className="lp-hero-title">QR ordering for Filipino restaurants</h1>
          <p className="lp-hero-sub">
            Guests scan the code on their table, order and pay from their phone. The cashier and the kitchen see it the
            moment it’s sent. Nothing to install.
          </p>
          <div className="lp-hero-cta">
            <a href="#demo" className="lp-btn lp-btn-mango">Try the live demo <span className="lp-arrow" aria-hidden="true">→</span></a>
            <a href="#how" className="lp-btn lp-btn-line">See how an order moves <span className="lp-arrow" aria-hidden="true">↓</span></a>
          </div>
          <ul className="lp-hero-facts">
            <li><span>Setup</span>Print the table QR codes</li>
            <li><span>Runs on</span>Any phone, tablet or PC</li>
            <li><span>Payments</span>QR Ph · card · cash</li>
          </ul>
        </div>

        <div className="lp-hero-device">
          <div className="lp-phone">
            <div className="lp-phone-screen">
              <Image src="/landing/guest-welcome.jpg" alt="" fill sizes="330px" className="lp-phone-poster" priority />
              <iframe src={guestPath} title="Live demo: the guest menu at Table 1" className="lp-phone-frame" loading="eager" />
            </div>
          </div>
          <p className="lp-phone-hint">This phone is live. Tap “View the menu”.</p>

          <TicketPrinter n={n} />
          <div className="lp-ticket lp-ticket-b" aria-hidden="true">
            <div className="lp-ticket-row"><b>TABLE 06</b><span>7:21 PM</span></div>
            <div className="lp-ticket-line">Ready to serve</div>
          </div>
        </div>
      </div>
    </section>
  )
}

/** A receipt printer that keeps printing the next order */
function TicketPrinter({ n }: { n: number }) {
  const tk = PRINT_QUEUE[n % PRINT_QUEUE.length]
  return (
    <div className="lp-printer" aria-hidden="true">
      <div className="lp-printer-body"><span className="lp-printer-led" /><span>HAPAG · KITCHEN</span></div>
      <div className="lp-printer-slot">
        <div key={n} className="lp-ticket lp-ticket-print">
          <div className="lp-ticket-row"><b>{tk.head}</b><span>{tk.meta}</span></div>
          {tk.lines.map(([item, note]) => (
            <div key={item} className="lp-ticket-line">{item}{note && <em>{note}</em>}</div>
          ))}
          <div className="lp-ticket-row lp-ticket-total"><span>TOTAL</span><b>{tk.total}</b></div>
          <span className="lp-ticket-stamp">{tk.stamp}</span>
        </div>
      </div>
    </div>
  )
}

/** Woven banig strip used as a section border */
function Weave() {
  return <div className="lp-weave" aria-hidden="true" />
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

/** Friday rush: tickets on the kitchen rail, timers running */
function Rush() {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSecs(v => v + 1), 1000)
    return () => clearInterval(t)
  }, [])
  // Ding when a ticket goes over 10 minutes
  useEffect(() => { if (secs > 0 && RAIL.some(r => r.waited + secs === 600)) bell() }, [secs])
  return (
    <section className="lp-rush" aria-labelledby="rush-title">
      <div className="lp-wrap">
        <header className="lp-rush-head">
          <div>
            <p className="lp-label">Friday, 7:30 PM</p>
            <h2 className="lp-h2" id="rush-title">Twelve tables. One kitchen.</h2>
          </div>
          <p className="lp-lead">Every paid order lands on the kitchen screen with its own timer, so nothing gets forgotten under the heat lamp. Anything waiting over ten minutes turns red.</p>
        </header>
      </div>
      <div className="lp-rail-wrap">
        <div className="lp-rail" aria-hidden="true" />
        <ul className="lp-rail-tickets">
          {RAIL.map(r => {
            const sec = r.waited + secs
            const late = sec >= 600
            return (
              <li key={r.table} className={`lp-rail-ticket${late ? ' is-late' : ''}`}>
                <span className="lp-clip" aria-hidden="true" />
                <div className="lp-ticket-row"><b>{r.table.toUpperCase()}</b><span className="lp-rail-state">{late ? 'Late' : r.state}</span></div>
                <ul>{r.items.map(i => <li key={i}>{i}</li>)}</ul>
                <div className="lp-rail-timer"><span>WAITING</span><b>{mmss(sec)}</b></div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

const STATIONS = ['Guest', 'Cashier', 'Payment', 'Kitchen', 'Floor', 'Owner']
const STAMPS = ['NEW', 'ACCEPTED', 'PAID · QR PH', 'COOKING', 'READY', 'SERVED']

function Timeline() {
  return (
    <section id="how" className="lp-how">
      <Journey />
      {/* Phones and reduced motion: the same story as a vertical list */}
      <div className="lp-wrap lp-how-list">
        <header className="lp-head">
          <p className="lp-label">How it works</p>
          <h2 className="lp-h2">Follow one order through the restaurant</h2>
        </header>
        <ol className="lp-log">
          {TIMELINE.map(s => (
            <li key={s.time + s.title} className="lp-log-item">
              <time>{s.time}</time>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              <div className={`lp-log-shot lp-log-shot-${s.device}`}>
                <Image src={`/landing/${s.shot}.jpg`} alt={`${s.title}: screenshot`} width={s.device === 'phone' ? 390 : 1440} height={s.device === 'phone' ? 844 : 900} sizes="90vw" />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/**
 * Desktop: the section pins while you scroll and the screens travel sideways
 * like stations on a route. One ticket rides along and gets re-stamped.
 * Scroll position is written to CSS variables (no re-render per frame).
 */
function Journey() {
  const root = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const panels = useRef<(HTMLElement | null)[]>([])
  const [step, setStep] = useState(0)

  useEffect(() => {
    const el = root.current
    if (!el) return
    let raf = 0
    let last = -1
    let centers: number[] = []
    // Layout positions (offsetLeft ignores transforms) of each station's centre
    const measure = () => {
      centers = panels.current.map(pn => (pn ? pn.offsetLeft + pn.offsetWidth / 2 : 0))
    }
    const update = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const max = r.height - window.innerHeight
      if (max <= 0) return
      const prog = Math.min(1, Math.max(0, -r.top / max))
      el.style.setProperty('--p', prog.toFixed(4))
      const cx = window.innerWidth / 2
      // Glide from one station's centre to the next, so each one lands dead centre
      if (track.current && centers.length > 1) {
        const seg = prog * (centers.length - 1)
        const i = Math.min(centers.length - 2, Math.floor(seg))
        const c = centers[i] + (centers[i + 1] - centers[i]) * (seg - i)
        track.current.style.transform = `translate3d(${cx - c}px, 0, 0)`
      }
      panels.current.forEach(pn => {
        if (!pn) return
        const b = pn.getBoundingClientRect()
        const raw = Math.abs(b.left + b.width / 2 - cx) / (window.innerWidth * 0.6)
        const d = raw < 0.06 ? 0 : Math.min(1, raw)   // the station in focus is fully crisp
        pn.style.setProperty('--d', d.toFixed(3))
      })
      const st = Math.min(TIMELINE.length - 1, Math.round(prog * (TIMELINE.length - 1)))
      if (st !== last) { last = st; setStep(st) }
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    const onResize = () => { measure(); onScroll() }
    measure(); update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    const ro = new ResizeObserver(onResize)
    if (track.current) ro.observe(track.current)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize); ro.disconnect(); cancelAnimationFrame(raf) }
  }, [])

  // Soft click at each new station (only if sound is on)
  const first = useRef(true)
  useEffect(() => { if (first.current) { first.current = false; return } tick() }, [step])

  const now = TIMELINE[step]
  return (
    <div ref={root} className="lp-journey" style={{ '--n': TIMELINE.length } as CSSProperties}>
      <div className="lp-journey-pin">
        <div className="lp-wrap lp-journey-head">
          <div>
            <p className="lp-label">How it works</p>
            <h2 className="lp-h2">Follow one order through the restaurant</h2>
          </div>
          <div className="lp-jclock" aria-hidden="true">
            <span>ORDER #A031 · TABLE 4</span>
            <b key={step}>{now.time}</b>
          </div>
        </div>

        <div className="lp-jtrack-wrap">
          <div ref={track} className="lp-jtrack">
            {TIMELINE.map((s, i) => (
              <article key={s.time + s.title} ref={el => { panels.current[i] = el }} className={`lp-jpanel lp-jpanel-${s.device}${i === step ? ' is-active' : ''}`}>
                <span className="lp-jpanel-time" aria-hidden="true">{s.time === 'Anytime' ? 'Any' : s.time.replace(' PM', '')}</span>
                <div className={`lp-frame lp-frame-${s.device}`}>
                  {s.device === 'desktop' && <div className="lp-browser-bar"><i /><i /><i /><span>{s.shot.startsWith('admin') ? '/admin' : s.shot.startsWith('kitchen') ? '/kitchen' : '/cashier'}</span></div>}
                  <div className="lp-frame-img"><Image src={`/landing/${s.shot}.jpg`} alt={`${s.title}: screenshot`} fill sizes="60vw" /></div>
                </div>
                <div className="lp-jpanel-copy">
                  <span className="lp-jpanel-station">{STATIONS[i]}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="lp-wrap lp-journey-foot">
          <ol className="lp-route" aria-label="Where the order is">
            {STATIONS.map((st, i) => (
              <li key={st} className={i <= step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>{st}</li>
            ))}
          </ol>
          <div className="lp-jticket" aria-hidden="true">
            <div className="lp-ticket-row"><b>TABLE 04</b><span>#A031</span></div>
            <div className="lp-ticket-line">1× Kare-Kare <em>good for 3–4</em></div>
            <div className="lp-ticket-line">3× Garlic rice</div>
            <span key={step} className={`lp-jstamp${step === STAMPS.length - 1 ? ' is-final' : ''}`}>{STAMPS[step]}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Features() {
  return (
    <section id="features" className="lp-features">
      <div className="lp-wrap">
        <header className="lp-head">
          <p className="lp-label">Features</p>
          <h2 className="lp-h2">Built for a full Friday night</h2>
        </header>
        <div className="lp-feature-cols">
          {FEATURES.map(f => (
            <div key={f.group} className="lp-feature-col" data-reveal>
              <div className="lp-feature-img"><Image src={f.img} alt="" fill sizes="(max-width: 860px) 92vw, 380px" /></div>
              <h3>{f.group}</h3>
              <ul>{f.items.map(it => <li key={it}>{it}</li>)}</ul>
            </div>
          ))}
        </div>
        <figure className="lp-figure" data-reveal>
          <div className="lp-figure-img"><Image src="/landing/admin-floor.jpg" alt="The floor plan editor: two floors of tables, walls, bar and kitchen" fill sizes="(max-width: 1240px) 94vw, 1180px" /></div>
          <figcaption>The floor plan editor. Draw each floor to match the room; the cashier sees it live.</figcaption>
        </figure>
      </div>
    </section>
  )
}

function BrandStudio() {
  const [color, setColor] = useState(THEME_PRESETS[0].color)
  const [mode, setMode] = useState<ThemeMode>('light')
  const theme = useMemo(() => buildBrandTheme(color, mode), [color, mode])
  const active = THEME_PRESETS.find(p => p.color === color && p.mode === mode)

  return (
    <section id="brand" className="lp-brand">
      <div className="lp-wrap lp-brand-grid">
        <div>
          <p className="lp-label">Your colours</p>
          <h2 className="lp-h2">Every restaurant looks like itself</h2>
          <p className="lp-lead">
            Pick the restaurant’s colour and the guest screens follow: buttons, prices, highlights. Hapag works out
            readable text colours on its own. Try it here; this is the same code the app uses.
          </p>
          <div className="lp-swatches" role="radiogroup" aria-label="Brand colour">
            {THEME_PRESETS.map(p => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active?.id === p.id}
                className={`lp-swatch${active?.id === p.id ? ' is-on' : ''}`}
                onClick={() => { setColor(p.color); setMode(p.mode); tick() }}
              >
                <i style={{ '--sw': p.color, '--swbg': p.mode === 'dark' ? '#0B0A08' : p.color } as CSSProperties} />
                {p.name}
              </button>
            ))}
            <label className="lp-swatch lp-swatch-custom">
              {/* Some browsers add their own style to colour inputs before React loads */}
              <input type="color" value={color} onChange={e => setColor(normalizeHex(e.target.value) ?? color)} aria-label="Pick any colour" suppressHydrationWarning />
              <i style={{ '--sw': color, '--swbg': color } as CSSProperties} />
              Any colour
            </label>
          </div>
          <div className="lp-brand-meta">
            <div className="lp-toggle" role="radiogroup" aria-label="Background">
              {(['light', 'dark'] as const).map(m => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'is-on' : ''} onClick={() => { setMode(m); tick() }}>
                  {m === 'light' ? 'Light' : 'Dark'}
                </button>
              ))}
            </div>
            <code>{color}</code>
            <span className="lp-brand-check">Text contrast {theme.report.buttonText.toFixed(1)}:1 on buttons, {theme.report.accentText.toFixed(1)}:1 on prices</span>
          </div>
        </div>

        <div className="lp-brand-device">
          <div className="lp-phone lp-phone-sm">
            <div className="lp-phone-screen">
              <div className="hp hp-preview lp-brand-preview" data-hp-theme={mode} style={theme.vars as CSSProperties}>
                <p className="hp-eyebrow">À la carte</p>
                <p className="hp-title" style={{ fontSize: '1.8rem', margin: '6px 0 4px' }}>What will you have today?</p>
                {[
                  { name: 'Kare-Kare', price: '₱485.00', badge: 'Bestseller' },
                  { name: 'Sizzling Sisig', price: '₱320.00', badge: 'Signature' },
                  { name: 'Halo-Halo', price: '₱195.00', badge: '' },
                ].map(d => (
                  <div key={d.name} className="hp-dish" style={{ gridTemplateColumns: '1fr 72px', padding: '13px 0', cursor: 'default' }}>
                    <div className="hp-dish-text">
                      {d.badge && <span className="hp-badge">{d.badge}</span>}
                      <h3 className="hp-dish-name" style={{ fontSize: '1.12rem' }}>{d.name}</h3>
                      <span className="hp-price">{d.price}</span>
                    </div>
                    <div className="hp-dish-media" style={{ width: 72, height: 72 }}>
                      <div className="hp-img hp-img-fallback" style={{ width: 72, height: 72, borderRadius: 14 }}><span className="hp-img-initial">{d.name[0]}</span></div>
                      <span className="hp-add" style={{ width: 30, height: 30 }}><span className="material-symbols-outlined">add</span></span>
                    </div>
                  </div>
                ))}
                <button type="button" tabIndex={-1} className="hp-btn hp-btn-primary hp-btn-block" style={{ marginTop: 16 }}>Send order · ₱1,000.00</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function UnderTheHood() {
  const [tab, setTab] = useState<(typeof CODE_TABS)[number]['id']>('pricing')
  const t = CODE_TABS.find(c => c.id === tab)!
  return (
    <section id="tech" className="lp-tech">
      <div className="lp-wrap lp-tech-grid">
        <div>
          <p className="lp-label">Under the hood</p>
          <h2 className="lp-h2">Built like it’ll handle real money</h2>
          <p className="lp-lead">
            The screens are the easy part. Most of the work went into the things you don’t see: prices the phone
            can’t change, payments that have to prove themselves, and a database that says no.
          </p>
          <dl className="lp-tech-stats">
            <div><dt>42</dt><dd>step click-through test, guest to kitchen to owner</dd></div>
            <div><dt>60</dt><dd>security checks against the live database rules</dd></div>
            <div><dt>0</dt><dd>prices trusted from the guest’s phone</dd></div>
          </dl>
          <ul className="lp-stack" aria-label="Built with">{STACK.map(x => <li key={x}>{x}</li>)}</ul>
        </div>

        <div className="lp-code">
          <div className="lp-code-tabs" role="tablist" aria-label="Code excerpts">
            {CODE_TABS.map(c => (
              <button key={c.id} type="button" role="tab" id={`tab-${c.id}`} aria-selected={tab === c.id} aria-controls="lp-code-panel" className={tab === c.id ? 'is-on' : ''} onClick={() => { setTab(c.id); tick() }}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="lp-code-panel" id="lp-code-panel" role="tabpanel" aria-labelledby={`tab-${t.id}`}>
            <div className="lp-code-file"><span>{t.file}</span><span>{t.id === 'rules' ? 'Firestore rules' : 'TypeScript'} · excerpt</span></div>
            <pre key={t.id}><code>{t.code}</code></pre>
            <p className="lp-code-note">{t.note}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Demo({ guestPath, origin }: { guestPath: string; origin: string }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const guestUrl = origin ? origin + guestPath : ''

  const open = useCallback(async (role: DemoRole | 'guest') => {
    setError('')
    bell()
    if (role === 'guest') { setTimeout(() => window.location.assign(guestPath), getSound() ? 350 : 0); return }
    setBusy(role)
    try { await enterDemo(role) } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); setBusy(null) }
  }, [guestPath])

  return (
    <section id="demo" className="lp-demo">
      <div className="lp-wrap lp-demo-grid">
        <div className="lp-demo-intro">
          <p className="lp-label">Live demo</p>
          <h2 className="lp-h2">Pick a seat</h2>
          <p className="lp-lead">
            This is a working restaurant. Order as a guest, then open the cashier and watch the order arrive. Click
            anything; the demo resets every night.
          </p>
          {guestUrl && (
            <div className="lp-demo-qr">
              <div className="lp-qr"><QRCodeSVG value={guestUrl} size={120} bgColor="#F2F1EA" fgColor="#14170F" level="M" /></div>
              <p>Scan with your phone to be the guest, then open the cashier on this screen.</p>
            </div>
          )}
          <ul className="lp-demo-notes">
            <li>Payments are practice only. No real money moves.</li>
            <li>Deleting or renaming things is turned off in the demo.</li>
          </ul>
        </div>

        <ul className="lp-roles">
          {ROLES.map(r => (
            <li key={r.id} className="lp-role">
              <div>
                <h3>{r.title}</h3>
                <p>{r.body}</p>
              </div>
              <button type="button" className="lp-btn lp-btn-role" onClick={() => open(r.id)} disabled={busy !== null}>
                {busy === r.id ? 'Opening…' : r.cta}
              </button>
            </li>
          ))}
          {error && <li className="lp-demo-error" role="alert">{error}</li>}
        </ul>
      </div>
    </section>
  )
}

/** Closing band: "Kain na!" is Tagalog for "Let's eat!" */
function KainNa() {
  return (
    <section className="lp-kain" aria-labelledby="kain-title">
      <Weave />
      <div className="lp-wrap lp-kain-inner">
        <div className="lp-kain-copy">
          <h2 className="lp-kain-title" id="kain-title">Kain na.</h2>
          <p className="lp-kain-sub"><i>(Tagalog)</i> Let’s eat. Your guests are ready to order.</p>
          <a href="#demo" className="lp-btn lp-btn-ink">Try the live demo <span className="lp-arrow" aria-hidden="true">→</span></a>
        </div>
        <ul className="lp-dishes" aria-label="Dishes from the demo menu">
          {DISH_PHOTOS.map(d => (
            <li key={d.name} className="lp-dish-card">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote demo photo, plain img keeps config simple */}
              <img src={d.src} alt={d.name} loading="lazy" width={300} height={300} />
              <span><b>{d.name}</b>{d.price}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="lp-footer">
      <div className="lp-wrap lp-footer-cols">
        <div>
          <span className="lp-logo">hapag</span>
          <p>QR ordering and kitchen screens for Filipino restaurants. A portfolio project with a working demo.</p>
        </div>
        <nav aria-label="Footer">
          <h3>Explore</h3>
          {NAV.map(n => <a key={n.id} href={`#${n.id}`}>{n.label}</a>)}
        </nav>
        <nav aria-label="Demo">
          <h3>Try it</h3>
          <a href="#demo">Guest menu</a>
          <a href="#demo">Cashier screen</a>
          <a href="#demo">Kitchen screen</a>
          <a href="#demo">Owner dashboard</a>
        </nav>
      </div>
      <div className="lp-wrap lp-footer-row">
        <span>Hapag · Filipino for “dining table”</span>
        <span>
          Designed and built by{' '}
          {SITE.authorUrl ? <a href={SITE.authorUrl} target="_blank" rel="noreferrer">{SITE.author}</a> : SITE.author}
          {SITE.repoUrl && <> · <a href={SITE.repoUrl} target="_blank" rel="noreferrer">Source code</a></>}
          {SITE.contactEmail && <> · <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a></>}
        </span>
        <span>© {year}</span>
      </div>
    </footer>
  )
}

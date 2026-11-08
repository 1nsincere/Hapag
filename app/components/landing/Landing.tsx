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
  { head: 'TABLE 04', meta: '#A031 · 7:02 PM', lines: [['1× Kare-Kare', 'good for 3–4'], ['3× Garlic rice']], total: '₱1,430.00', stamp: 'NEW' },
  { head: 'TABLE 02', meta: '#A032 · 7:04 PM', lines: [['1× Sizzling Sisig'], ['2× Calamansi juice']], total: '₱500.00', stamp: 'PAID · QR PH' },
  { head: 'TAKEOUT', meta: '#A033 · 7:06 PM', lines: [['3× Pork BBQ'], ['3× Garlic rice']], total: '₱630.00', stamp: 'CASH' },
  { head: 'TABLE 07', meta: '#A034 · 7:09 PM', lines: [['2× Halo-Halo'], ['1× Leche flan']], total: '₱510.00', stamp: 'NEW' },
]

/** The kitchen rail: minutes already waiting when the page opens */
const RAIL = [
  { table: 'Table 3', items: ['1× Crispy Pata', '2× Bagoong rice'], waited: 14 * 60 + 20, state: 'Cooking' },
  { table: 'Table 5', items: ['2× Chicken Inasal', '2× Garlic rice'], waited: 9 * 60 + 5, state: 'Cooking' },
  { table: 'Takeout', items: ['3× Pork BBQ', '1× Pancit Canton'], waited: 6 * 60 + 41, state: 'In queue' },
  { table: 'Table 8', items: ['1× Beef Mami', '1× Leche flan'], waited: 3 * 60 + 12, state: 'In queue' },
  { table: 'Table 1', items: ['1× Sinigang na Baboy', '4× Sago’t Gulaman'], waited: 48, state: 'New' },
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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    const first = requestAnimationFrame(onScroll)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(first) }
  }, [])

  return (
    <div ref={root} className={`lp ${lpSans.variable} ${lpMono.variable}`}>
      <Nav scrolled={scrolled} />
      <Hero guestPath={guestPath} />
      <Weave />
      <Timeline />
      <Rush />
      <Features />
      <BrandStudio />
      <Demo guestPath={guestPath} origin={origin} />
      <KainNa />
      <Footer />
    </div>
  )
}

// ─── Sections ───────────────────────────────────────────────────────────────

function Nav({ scrolled }: { scrolled: boolean }) {
  return (
    <header className={`lp-nav${scrolled ? ' is-scrolled' : ''}`}>
      <a href="#top" className="lp-logo" aria-label="Hapag, back to top">hapag</a>
      <nav aria-label="Sections" className="lp-nav-links">
        <a href="#how">How it works</a>
        <a href="#features">Features</a>
        <a href="#brand">Your colours</a>
      </nav>
      <a href="#demo" className="lp-btn lp-btn-sm">Try the demo</a>
    </header>
  )
}

function Hero({ guestPath }: { guestPath: string }) {
  return (
    <section id="top" className="lp-hero">
      <div className="lp-wrap lp-hero-inner">
        <div className="lp-hero-copy">
          <p className="lp-def"><b>ha·pag</b> <i>(n.)</i> dining table</p>
          <h1 className="lp-hero-title">QR ordering for Filipino restaurants</h1>
          <p className="lp-hero-sub">
            Guests scan the code on their table, order and pay from their phone. The cashier and the kitchen see it the
            moment it’s sent. Nothing to install.
          </p>
          <div className="lp-hero-cta">
            <a href="#demo" className="lp-btn lp-btn-mango">Try the live demo</a>
            <a href="#how" className="lp-btn lp-btn-line">See how an order moves</a>
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

          <TicketPrinter />
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
function TicketPrinter() {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setN(v => v + 1), 3800)
    return () => clearInterval(t)
  }, [])
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
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 1000)
    return () => clearInterval(t)
  }, [])
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
            const sec = r.waited + tick
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

function Timeline() {
  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLLIElement | null)[]>([])
  useEffect(() => {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i)) })
    }, { rootMargin: '-45% 0px -45% 0px' })
    refs.current.forEach(el => el && io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <section id="how" className="lp-how">
      <div className="lp-wrap">
        <header className="lp-head">
          <p className="lp-label">How it works</p>
          <h2 className="lp-h2">Follow one order through the restaurant</h2>
        </header>
        <div className="lp-how-grid">
          <div className="lp-how-stage" aria-hidden="true">
            <div className="lp-how-sticky">
              {TIMELINE.map((s, i) => (
                <div key={s.time + s.title} className={`lp-shot${i === active ? ' is-active' : ''}`}>
                  <div className={`lp-frame lp-frame-${s.device}`}>
                    {s.device === 'desktop' && <div className="lp-browser-bar"><i /><i /><i /><span>{s.shot.startsWith('admin') ? '/admin' : s.shot.startsWith('kitchen') ? '/kitchen' : '/cashier'}</span></div>}
                    <div className="lp-frame-img"><Image src={`/landing/${s.shot}.jpg`} alt="" fill sizes="(max-width: 900px) 90vw, 55vw" /></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <ol className="lp-log">
            {TIMELINE.map((s, i) => (
              <li key={s.time + s.title} ref={el => { refs.current[i] = el }} data-i={i} className={`lp-log-item${i === active ? ' is-active' : ''}`}>
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
      </div>
    </section>
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
                onClick={() => { setColor(p.color); setMode(p.mode) }}
              >
                <i style={{ '--sw': p.color, '--swbg': p.mode === 'dark' ? '#0B0A08' : p.color } as CSSProperties} />
                {p.name}
              </button>
            ))}
            <label className="lp-swatch lp-swatch-custom">
              <input type="color" value={color} onChange={e => setColor(normalizeHex(e.target.value) ?? color)} aria-label="Pick any colour" />
              <i style={{ '--sw': color, '--swbg': color } as CSSProperties} />
              Any colour
            </label>
          </div>
          <div className="lp-brand-meta">
            <div className="lp-toggle" role="radiogroup" aria-label="Background">
              {(['light', 'dark'] as const).map(m => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'is-on' : ''} onClick={() => setMode(m)}>
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

function Demo({ guestPath, origin }: { guestPath: string; origin: string }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const guestUrl = origin ? origin + guestPath : ''

  const open = useCallback(async (role: DemoRole | 'guest') => {
    setError('')
    if (role === 'guest') { window.location.assign(guestPath); return }
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
        <div>
          <h2 className="lp-kain-title" id="kain-title">Kain na.</h2>
          <p className="lp-kain-sub"><i>(Tagalog)</i> Let’s eat. Your guests are ready to order.</p>
        </div>
        <a href="#demo" className="lp-btn lp-btn-ink">Try the live demo</a>
      </div>
    </section>
  )
}

function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="lp-footer">
      <div className="lp-wrap lp-footer-row">
        <span className="lp-logo">hapag</span>
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

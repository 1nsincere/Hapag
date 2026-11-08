'use client'

/**
 * Hapag showcase landing page (demo site only — see app/page.tsx).
 * Styling: ./landing.css (scoped under .lp). Motion respects prefers-reduced-motion.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as RPointerEvent } from 'react'
import Image from 'next/image'
import { QRCodeSVG } from 'qrcode.react'
import { THEME_PRESETS, buildBrandTheme, normalizeHex, type ThemeMode } from '@/lib/theme'
import type { DemoRole } from '@/lib/demo'
import { SITE } from '@/lib/site'
import { enterDemo } from './enterDemo'
import './landing.css'

// ─── Content ────────────────────────────────────────────────────────────────

const FLOW = [
  { k: '01', title: 'The guest orders', body: 'Scan the code on the table, browse a photo menu, send the order. No app, no sign-up — and the server checks every price.', shot: 'guest-cart', device: 'phone' },
  { k: '02', title: 'The cashier confirms', body: 'A card slides into the corner of the cashier screen and stays there — with a chime — until someone taps Accept.', shot: 'cashier-orders', device: 'desktop' },
  { k: '03', title: 'The guest pays', body: 'From the phone with QR Ph or card, or at the counter. The order is only marked paid when the payment is verified.', shot: 'guest-status', device: 'phone' },
  { k: '04', title: 'The kitchen cooks', body: 'Paid tickets land on the kitchen screen with timers. One tap for cooking, one tap for ready.', shot: 'kitchen', device: 'desktop' },
  { k: '05', title: 'The floor knows', body: 'The live floor plan shows which table is waiting, eating or ready to clear — across every floor.', shot: 'cashier-floor', device: 'desktop' },
  { k: '06', title: 'The owner sees it all', body: 'Menu, tables, floor plan, staff and brand colours — managed in one calm place.', shot: 'admin-floor', device: 'desktop' },
] as const

const ROLES: { id: DemoRole | 'guest'; n: string; title: string; body: string; cta: string }[] = [
  { id: 'guest', n: '01', title: 'Guest', body: 'Order from Table 1 like a diner would — menu, cart, payment, live order status.', cta: 'Open the menu' },
  { id: 'cashier', n: '02', title: 'Cashier', body: 'Accept orders, answer staff calls, take payments and watch the live floor plan.', cta: 'Enter as Cashier' },
  { id: 'kitchen', n: '03', title: 'Kitchen', body: 'Paid tickets arrive instantly. Start cooking, mark ready, see the history.', cta: 'Enter as Kitchen' },
  { id: 'admin', n: '04', title: 'Owner', body: 'Menu, tables, multi-floor plan editor, staff, insights and the brand colour.', cta: 'Enter as Owner' },
]

const MANIFESTO = 'Hapag is Filipino for the dining table. We built it for the places that feed us — from a six-table carinderia to a two-floor family restaurant — so the people serving spend less time running and more time hosting.'

const DISHES = ['Lumpiang Shanghai', 'Kare-Kare', 'Sizzling Sisig', 'Chicken Inasal', 'Sinigang na Baboy', 'Halo-Halo', 'Crispy Pata', 'Leche Flan', 'Mango Shake', 'Pancit Canton']

const noopSubscribe = () => () => {}

// ─── Small hooks ────────────────────────────────────────────────────────────

/** Adds .is-in to [data-reveal] elements as they enter the viewport */
function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const els = root.current?.querySelectorAll<HTMLElement>('[data-reveal]')
    if (!els?.length) return
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target) } })
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 })
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [root])
}

/** 0 → 1 progress of an element scrolling through the viewport */
function useScrollProgress(ref: React.RefObject<HTMLElement | null>) {
  const [p, setP] = useState(0)
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      setP(Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35))))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf) }
  }, [ref])
  return p
}

/** Buttons that lean toward the cursor (desktop only) */
function magnetic(e: RPointerEvent<HTMLElement>) {
  if (e.pointerType !== 'mouse') return
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width - 0.5) * 14}px`)
  el.style.setProperty('--my', `${((e.clientY - r.top) / r.height - 0.5) * 10}px`)
}
const unmagnetic = (e: RPointerEvent<HTMLElement>) => { e.currentTarget.style.setProperty('--mx', '0px'); e.currentTarget.style.setProperty('--my', '0px') }

/** Spotlight that follows the cursor on cards */
function spotlight(e: RPointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--sx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--sy', `${e.clientY - r.top}px`)
}

function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      if (reduce) { setN(to); return }
      const start = performance.now()
      const tick = (t: number) => {
        const k = Math.min(1, (t - start) / 1400)
        setN(Math.round(to * (1 - Math.pow(1 - k, 3))))
        if (k < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, { threshold: 0.6 })
    io.observe(el)
    return () => io.disconnect()
  }, [to])
  return <span ref={ref}>{n}{suffix}</span>
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function Landing({ guestPath }: { guestPath: string }) {
  const root = useRef<HTMLDivElement>(null)
  useReveal(root)
  const [scrolled, setScrolled] = useState(false)
  const [loaded, setLoaded] = useState(false)
  // Site address for the guest QR code (empty during server render)
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => '')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    const first = requestAnimationFrame(onScroll)
    window.addEventListener('scroll', onScroll, { passive: true })
    const t = setTimeout(() => setLoaded(true), 60)
    return () => { window.removeEventListener('scroll', onScroll); clearTimeout(t); cancelAnimationFrame(first) }
  }, [])

  return (
    <div ref={root} className={`lp${loaded ? ' is-loaded' : ''}`}>
      <div className="lp-grain" aria-hidden="true" />
      <Nav scrolled={scrolled} />
      <Hero guestPath={guestPath} />
      <Marquee />
      <Manifesto />
      <Flow />
      <Bento />
      <BrandStudio />
      <Numbers />
      <Demo guestPath={guestPath} origin={origin} />
      <Footer />
    </div>
  )
}

// ─── Sections ───────────────────────────────────────────────────────────────

function Nav({ scrolled }: { scrolled: boolean }) {
  return (
    <header className={`lp-nav${scrolled ? ' is-scrolled' : ''}`}>
      <a href="#top" className="lp-logo" aria-label="Hapag — back to top">Hapag<i aria-hidden="true" /></a>
      <nav aria-label="Sections" className="lp-nav-links">
        <a href="#flow">How it works</a>
        <a href="#product">Features</a>
        <a href="#brand">Your brand</a>
      </nav>
      <a href="#demo" className="lp-btn lp-btn-sm lp-btn-light" onPointerMove={magnetic} onPointerLeave={unmagnetic}>
        Try it live <span aria-hidden="true">↗</span>
      </a>
    </header>
  )
}

function Hero({ guestPath }: { guestPath: string }) {
  return (
    <section id="top" className="lp-hero">
      <div className="lp-hero-glow" aria-hidden="true" />
      <div className="lp-hero-grid" aria-hidden="true" />
      <div className="lp-wrap lp-hero-inner">
        <div className="lp-hero-copy">
          <p className="lp-eyebrow lp-load" style={{ '--d': '0ms' } as CSSProperties}>
            <span className="lp-dot" />QR ordering &amp; POS · Made in the Philippines
          </p>
          <h1 className="lp-hero-title" aria-label="Every table is a front door.">
            <span className="lp-line"><span style={{ '--d': '80ms' } as CSSProperties}>Every table</span></span>
            <span className="lp-line"><span style={{ '--d': '200ms' } as CSSProperties}>is a <em>front door.</em></span></span>
          </h1>
          <p className="lp-hero-sub lp-load" style={{ '--d': '420ms' } as CSSProperties}>
            Guests scan, order and pay from their seat. The cashier, the kitchen and the owner see it the same second.
            No app to install.
          </p>
          <div className="lp-hero-cta lp-load" style={{ '--d': '540ms' } as CSSProperties}>
            <a href="#demo" className="lp-btn lp-btn-accent" onPointerMove={magnetic} onPointerLeave={unmagnetic}>
              Step inside the live demo <span aria-hidden="true">→</span>
            </a>
            <a href="#flow" className="lp-btn lp-btn-ghost" onPointerMove={magnetic} onPointerLeave={unmagnetic}>
              Watch an order travel
            </a>
          </div>
          <dl className="lp-hero-facts lp-load" style={{ '--d': '660ms' } as CSSProperties}>
            <div><dt>Setup</dt><dd>Print a QR, done</dd></div>
            <div><dt>Works on</dt><dd>Any phone &amp; tablet</dd></div>
            <div><dt>Pay with</dt><dd>QR Ph · Card · Cash</dd></div>
          </dl>
        </div>

        <div className="lp-hero-device lp-load" style={{ '--d': '300ms' } as CSSProperties}>
          <div className="lp-phone">
            <div className="lp-phone-notch" aria-hidden="true" />
            <div className="lp-phone-screen">
              <Image src="/landing/guest-welcome.jpg" alt="" fill sizes="340px" className="lp-phone-poster" priority />
              <iframe src={guestPath} title="Live demo: the guest menu at Table 1" className="lp-phone-frame" loading="eager" />
            </div>
          </div>
          <p className="lp-phone-hint"><span className="lp-dot" />This phone is live — tap around</p>
          <div className="lp-chip lp-chip-a" aria-hidden="true"><span className="lp-chip-ic">🔔</span><b>New order</b> · Table 4 · ₱1,240</div>
          <div className="lp-chip lp-chip-b" aria-hidden="true"><span className="lp-chip-ic lp-ok">✓</span><b>Paid</b> · QR Ph</div>
          <div className="lp-chip lp-chip-c" aria-hidden="true"><span className="lp-chip-ic">🍽</span><b>Ready to serve</b> · Table 6</div>
        </div>
      </div>
      <a href="#flow" className="lp-scroll" aria-label="Scroll to how it works"><span>Scroll</span><i /></a>
    </section>
  )
}

function Marquee() {
  const words = ['Scan', 'Order', 'Cook', 'Serve', 'Pay', 'Salamat']
  return (
    <section className="lp-marquee" aria-label="Scan, order, cook, serve, pay, salamat">
      <div className="lp-marquee-row" aria-hidden="true">
        {[0, 1].map(k => (
          <div key={k} className="lp-marquee-track">
            {words.map(w => <span key={w + k} className="lp-marquee-word">{w}<i>✦</i></span>)}
          </div>
        ))}
      </div>
      <div className="lp-marquee-row lp-marquee-rev" aria-hidden="true">
        {[0, 1].map(k => (
          <div key={k} className="lp-marquee-track">
            {DISHES.map(d => <span key={d + k} className="lp-marquee-dish">{d}</span>)}
          </div>
        ))}
      </div>
    </section>
  )
}

function Manifesto() {
  const ref = useRef<HTMLElement>(null)
  const p = useScrollProgress(ref)
  const words = useMemo(() => MANIFESTO.split(' '), [])
  return (
    <section ref={ref} className="lp-manifesto">
      <div className="lp-wrap">
        <p className="lp-kicker" data-reveal>Why Hapag</p>
        <p className="lp-manifesto-text">
          {words.map((w, i) => {
            const on = p * words.length * 1.15 > i
            const hl = w.startsWith('Hapag') || w.startsWith('table') || w.startsWith('hosting')
            return <span key={i} className={`${on ? 'is-on' : ''}${hl ? ' is-hl' : ''}`}>{w} </span>
          })}
        </p>
      </div>
    </section>
  )
}

function Flow() {
  const [active, setActive] = useState(0)
  const stepRefs = useRef<(HTMLLIElement | null)[]>([])
  useEffect(() => {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i)) })
    }, { rootMargin: '-45% 0px -45% 0px' })
    stepRefs.current.forEach(el => el && io.observe(el))
    return () => io.disconnect()
  }, [])
  const step = FLOW[active]

  return (
    <section id="flow" className="lp-flow">
      <div className="lp-wrap">
        <header className="lp-section-head">
          <p className="lp-kicker" data-reveal>How it works</p>
          <h2 className="lp-h2" data-reveal>One order.<br /><em>Four screens.</em> Zero shouting.</h2>
        </header>
        <div className="lp-flow-grid">
          <div className="lp-flow-stage" aria-hidden="true">
            <div className="lp-flow-sticky">
              <div className={`lp-stage lp-stage-${step.device}`}>
                {FLOW.map((s, i) => (
                  <div key={s.k} className={`lp-stage-shot${i === active ? ' is-active' : ''}`}>
                    <div className={`lp-frame lp-frame-${s.device}`}>
                      {s.device === 'desktop' && <div className="lp-browser-bar"><i /><i /><i /><span>{s.shot.startsWith('admin') ? '/admin' : s.shot.startsWith('kitchen') ? '/kitchen' : '/cashier'}</span></div>}
                      <div className="lp-stage-img">
                        <Image src={`/landing/${s.shot}.jpg`} alt="" fill sizes="(max-width: 900px) 90vw, 55vw" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="lp-flow-progress">
                {FLOW.map((s, i) => <i key={s.k} className={i <= active ? 'is-on' : ''} />)}
              </div>
            </div>
          </div>
          <ol className="lp-flow-steps">
            {FLOW.map((s, i) => (
              <li key={s.k} ref={el => { stepRefs.current[i] = el }} data-i={i} className={`lp-flow-step${i === active ? ' is-active' : ''}`}>
                <span className="lp-flow-k">{s.k}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
                <div className={`lp-flow-mobile-shot lp-flow-mobile-${s.device}`}>
                  <Image src={`/landing/${s.shot}.jpg`} alt={`${s.title} — screenshot`} width={s.device === 'phone' ? 390 : 1440} height={s.device === 'phone' ? 844 : 900} sizes="90vw" />
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

function Bento() {
  return (
    <section id="product" className="lp-bento-sec">
      <div className="lp-wrap">
        <header className="lp-section-head">
          <p className="lp-kicker" data-reveal>Features</p>
          <h2 className="lp-h2" data-reveal>Everything a busy floor needs.<br /><em>Nothing it doesn&apos;t.</em></h2>
        </header>
        <div className="lp-bento">
          <article className="lp-card lp-card-floor" onPointerMove={spotlight} data-reveal>
            <div className="lp-card-copy">
              <h3>A floor plan that matches your room</h3>
              <p>Draw every floor — walls, bar, kitchen, garden. Drag, rotate and resize tables. The cashier sees it live.</p>
            </div>
            <div className="lp-card-media"><Image src="/landing/admin-floor.jpg" alt="Floor plan editor with two floors of tables" fill sizes="(max-width: 900px) 92vw, 60vw" /></div>
          </article>

          <article className="lp-card lp-card-alerts" onPointerMove={spotlight} data-reveal>
            <h3>Alerts that don&apos;t disappear</h3>
            <p>New orders, staff calls and ready plates stay on screen until someone handles them.</p>
            <div className="lp-mock-alerts" aria-hidden="true">
              <div className="lp-mock-alert lp-red"><b>Table 3</b> is calling for staff<span>On my way</span></div>
              <div className="lp-mock-alert lp-amber"><b>New order</b> · Table 5 · ₱860<span>Accept</span></div>
              <div className="lp-mock-alert lp-green"><b>Ready to serve</b> · Table 2<span>Mark served</span></div>
            </div>
          </article>

          <article className="lp-card lp-card-lock" onPointerMove={spotlight} data-reveal>
            <span className="lp-card-icon" aria-hidden="true"><span className="material-symbols-outlined">verified_user</span></span>
            <h3>Prices the phone can&apos;t change</h3>
            <p>Every total is recalculated on the server from the menu, tax and service fee. Tampered phones still pay the real price.</p>
          </article>

          <article className="lp-card lp-card-qr" onPointerMove={spotlight} data-reveal>
            <span className="lp-card-icon" aria-hidden="true"><span className="material-symbols-outlined">qr_code_2</span></span>
            <h3>No app. Any phone.</h3>
            <p>Each table&apos;s QR code carries a secret, so only guests at the table can order.</p>
          </article>

          <article className="lp-card lp-card-pay" onPointerMove={spotlight} data-reveal>
            <h3>Pay your way</h3>
            <p>QR Ph, card or cash at the counter. Online payments are confirmed by a signed message from the payment provider.</p>
            <div className="lp-pills" aria-hidden="true"><span>QR Ph</span><span>GCash</span><span>Maya</span><span>Card</span><span>Cash</span></div>
          </article>

          <article className="lp-card lp-card-menu" onPointerMove={spotlight} data-reveal>
            <div className="lp-card-copy">
              <h3>Photo menus, zero setup</h3>
              <p>Upload a photo and it&apos;s resized automatically. Bestseller tags, sizes, sold-out states and suggestions at checkout.</p>
            </div>
            <div className="lp-card-phones">
              <div className="lp-card-phone"><Image src="/landing/guest-menu.jpg" alt="Photo menu on the guest's phone" fill sizes="230px" /></div>
              <div className="lp-card-phone lp-card-phone-2"><Image src="/landing/guest-dish.jpg" alt="Dish detail with sizes on the guest's phone" fill sizes="230px" /></div>
            </div>
          </article>

          <article className="lp-card lp-card-roles" onPointerMove={spotlight} data-reveal>
            <h3>The right screen for each person</h3>
            <p>Owner, cashier and kitchen logins — each sees only what they need.</p>
            <div className="lp-pills" aria-hidden="true"><span>Owner</span><span>Cashier</span><span>Kitchen</span></div>
          </article>

          <article className="lp-card lp-card-offline" onPointerMove={spotlight} data-reveal>
            <span className="lp-card-icon" aria-hidden="true"><span className="material-symbols-outlined">wifi_off</span></span>
            <h3>Keeps going through Wi-Fi drops</h3>
            <p>Changes are saved on the device and sync the moment the connection is back.</p>
          </article>
        </div>
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
        <div className="lp-brand-copy">
          <p className="lp-kicker" data-reveal>Your brand</p>
          <h2 className="lp-h2" data-reveal>Your colours.<br /><em>In one tap.</em></h2>
          <p className="lp-lead" data-reveal>
            Every restaurant is different, so Hapag dresses up in yours. Pick a colour — buttons, prices and highlights follow,
            and readable contrast is worked out automatically.
          </p>
          <div className="lp-swatches" role="radiogroup" aria-label="Brand colour" data-reveal>
            {THEME_PRESETS.map(p => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active?.id === p.id}
                aria-label={p.name}
                title={`${p.name} — ${p.hint}`}
                className={`lp-swatch${active?.id === p.id ? ' is-on' : ''}`}
                style={{ '--sw': p.color, '--swbg': p.mode === 'dark' ? '#0B0A08' : p.color } as CSSProperties}
                onClick={() => { setColor(p.color); setMode(p.mode) }}
              />
            ))}
            <label className="lp-swatch lp-swatch-custom" title="Any colour">
              <input type="color" value={color} onChange={e => setColor(normalizeHex(e.target.value) ?? color)} aria-label="Pick any colour" />
              <span className="material-symbols-outlined" aria-hidden="true">colorize</span>
            </label>
          </div>
          <div className="lp-brand-meta" data-reveal>
            <span>{active ? active.name : 'Custom'} · <code>{color}</code></span>
            <div className="lp-toggle" role="radiogroup" aria-label="Background">
              {(['light', 'dark'] as const).map(m => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'is-on' : ''} onClick={() => setMode(m)}>
                  {m === 'light' ? 'Light' : 'Dark'}
                </button>
              ))}
            </div>
          </div>
          <p className="lp-brand-check" data-reveal>
            <span className="material-symbols-outlined" aria-hidden="true">check_circle</span>
            Text contrast {theme.report.buttonText.toFixed(1)}:1 on buttons · {theme.report.accentText.toFixed(1)}:1 on prices — easy to read (WCAG AA)
          </p>
        </div>

        <div className="lp-brand-device" data-reveal>
          <div className="lp-phone lp-phone-sm">
            <div className="lp-phone-notch" aria-hidden="true" />
            <div className="lp-phone-screen">
              <div className="hp hp-preview lp-brand-preview" data-hp-theme={mode} style={theme.vars as CSSProperties}>
                <p className="hp-eyebrow">À la carte</p>
                <p className="hp-title" style={{ fontSize: '1.9rem', margin: '6px 0 4px' }}>What will you <em style={{ color: 'var(--hp-accent-text)' }}>have today?</em></p>
                {[
                  { name: 'Kare-Kare', price: '₱485.00', badge: 'Bestseller' },
                  { name: 'Sizzling Sisig', price: '₱320.00', badge: 'Signature' },
                  { name: 'Halo-Halo', price: '₱195.00', badge: '' },
                ].map(d => (
                  <div key={d.name} className="hp-dish" style={{ gridTemplateColumns: '1fr 76px', padding: '14px 0', cursor: 'default' }}>
                    <div className="hp-dish-text">
                      {d.badge && <span className="hp-badge">{d.badge}</span>}
                      <h3 className="hp-dish-name" style={{ fontSize: '1.15rem' }}>{d.name}</h3>
                      <span className="hp-price">{d.price}</span>
                    </div>
                    <div className="hp-dish-media" style={{ width: 76, height: 76 }}>
                      <div className="hp-img hp-img-fallback" style={{ width: 76, height: 76, borderRadius: 14 }}><span className="hp-img-initial">{d.name[0]}</span></div>
                      <span className="hp-add" style={{ width: 32, height: 32 }}><span className="material-symbols-outlined">add</span></span>
                    </div>
                  </div>
                ))}
                <button type="button" tabIndex={-1} className="hp-btn hp-btn-primary hp-btn-block" style={{ marginTop: 18 }}>Send order · ₱1,000.00</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Numbers() {
  return (
    <section className="lp-numbers" aria-label="Hapag in numbers">
      <div className="lp-wrap lp-numbers-grid">
        <div data-reveal><strong><CountUp to={6} /></strong><span>order stages, tracked live</span></div>
        <div data-reveal><strong><CountUp to={4} /></strong><span>screens: guest, cashier, kitchen, owner</span></div>
        <div data-reveal><strong><CountUp to={0} /></strong><span>apps to install</span></div>
        <div data-reveal><strong><CountUp to={42} /></strong><span>automated checks before every release</span></div>
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
      <div className="lp-wrap">
        <header className="lp-section-head lp-demo-head">
          <p className="lp-kicker" data-reveal>Live demo</p>
          <h2 className="lp-h2" data-reveal>Step inside.</h2>
          <p className="lp-lead" data-reveal>
            This is a working restaurant. Order as a guest, then switch to the cashier and watch it arrive.
            Everything resets every night — click anything.
          </p>
        </header>

        <div className="lp-demo-grid">
          {ROLES.map(r => (
            <article key={r.id} className={`lp-role${r.id === 'guest' ? ' lp-role-guest' : ''}`} onPointerMove={spotlight} data-reveal>
              <span className="lp-role-n">{r.n}</span>
              <h3>{r.title}</h3>
              <p>{r.body}</p>
              {r.id === 'guest' && guestUrl && (
                <div className="lp-role-qr">
                  <div className="lp-qr"><QRCodeSVG value={guestUrl} size={112} bgColor="transparent" fgColor="#F4EDE2" level="M" /></div>
                  <span>Scan with your phone<br />for the real thing</span>
                </div>
              )}
              <button
                type="button"
                className="lp-btn lp-btn-role"
                onClick={() => open(r.id)}
                disabled={busy !== null}
                onPointerMove={magnetic}
                onPointerLeave={unmagnetic}
              >
                {busy === r.id ? 'Opening…' : r.cta} <span aria-hidden="true">→</span>
              </button>
            </article>
          ))}
        </div>
        {error && <p className="lp-demo-error" role="alert">{error}</p>}

        <div className="lp-demo-tips" data-reveal>
          <p><span className="material-symbols-outlined" aria-hidden="true">devices</span><b>Best on two screens:</b> guest on your phone, cashier on your laptop.</p>
          <p><span className="material-symbols-outlined" aria-hidden="true">science</span><b>Practice payments:</b> no real money moves.</p>
          <p><span className="material-symbols-outlined" aria-hidden="true">lock</span><b>Demo limits:</b> deleting or renaming things is turned off.</p>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="lp-footer">
      <div className="lp-wrap">
        <div className="lp-footer-cta" data-reveal>
          <p className="lp-kicker">For restaurants</p>
          <h2 className="lp-h2">Ready to set your table?</h2>
          <a href="#demo" className="lp-btn lp-btn-accent" onPointerMove={magnetic} onPointerLeave={unmagnetic}>Try the demo again <span aria-hidden="true">↺</span></a>
        </div>
        <p className="lp-wordmark" aria-hidden="true">Hapag<span>.</span></p>
        <div className="lp-footer-row">
          <span><em>Hapag</em> — Filipino for &ldquo;dining table&rdquo;</span>
          <span>
            Designed &amp; built by{' '}
            {SITE.authorUrl ? <a href={SITE.authorUrl} target="_blank" rel="noreferrer">{SITE.author}</a> : SITE.author}
            {SITE.repoUrl && <> · <a href={SITE.repoUrl} target="_blank" rel="noreferrer">Source</a></>}
            {SITE.contactEmail && <> · <a href={`mailto:${SITE.contactEmail}`}>Contact</a></>}
          </span>
          <span>© {year}</span>
        </div>
      </div>
    </footer>
  )
}

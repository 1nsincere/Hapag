'use client'

/**
 * Hapag Noir — shared customer UI primitives.
 * Styling lives in app/hapag.css (everything scoped under `.hp`).
 */

import Link from 'next/link'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'

// ─── Formatting ───────────────────────────────────────────────────────────────

export function peso(amount: number) {
  const n = Number.isFinite(amount) ? amount : 0
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function shortId(id: string) {
  return id.slice(0, 6).toUpperCase()
}

export function pad2(n: number) {
  return String(n).padStart(2, '0')
}

/** Stagger helper for `.hp-fade-up` — `style={delay(120)}` */
export function delay(ms: number): CSSProperties {
  return { ['--d' as string]: `${ms}ms` } as CSSProperties
}

/** Dietary / marketing tags get a quiet coloured dot instead of loud pills. */
export function tagTone(tag: string): CSSProperties {
  const t = tag.toLowerCase()
  // Mid-tones that read on both the light and dark themes; "bestseller" follows the brand colour
  let tone = 'var(--hp-text-3)'
  if (/spicy|hot|chili/.test(t)) tone = '#D9452B'
  else if (/vegan|vegetarian|plant/.test(t)) tone = '#2E8B57'
  else if (/best|popular|signature|favorite/.test(t)) tone = 'var(--hp-accent)'
  else if (/new/.test(t)) tone = '#2F6FB5'
  else if (/chef|recommend/.test(t)) tone = '#8E44AD'
  else if (/gluten|free|organic|fresh|healthy/.test(t)) tone = '#5C9E31'
  return { ['--tone' as string]: tone } as CSSProperties
}

// ─── Dish image with graceful fallback ────────────────────────────────────────

export function DishImage({ src, alt, className = '', eager = false }: {
  src?: string
  alt: string
  className?: string
  eager?: boolean
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (!src || failedSrc === src) {
    const initial = alt.trim().charAt(0).toUpperCase() || '·'
    return (
      <div className={`hp-img hp-img-fallback ${className}`} role="img" aria-label={alt}>
        <span className="hp-img-initial" aria-hidden="true">{initial}</span>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- menu images come from arbitrary hosts
    <img
      src={src}
      alt={alt}
      className={`hp-img ${className}`}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailedSrc(src)}
    />
  )
}

// ─── Bottom sheet / dialog ────────────────────────────────────────────────────

export function Sheet({ open, onClose, label, dismissible = true, children }: {
  open: boolean
  onClose: () => void
  label: string
  dismissible?: boolean
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && dismissible) onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, dismissible])

  if (!open) return null

  return (
    <div className="hp-sheet-root" role="dialog" aria-modal="true" aria-label={label}>
      <div className="hp-backdrop" onClick={() => { if (dismissible) onClose() }} />
      <div className="hp-sheet">{children}</div>
    </div>
  )
}

export function SheetHeader({ eyebrow, title, onClose }: { eyebrow?: string; title: ReactNode; onClose?: () => void }) {
  return (
    <>
      <div className="hp-sheet-handle" />
      <div className="hp-sheet-head">
        <div>
          {eyebrow && <p className="hp-eyebrow">{eyebrow}</p>}
          <h2 className="hp-title">{title}</h2>
        </div>
        {onClose && (
          <button type="button" className="hp-icon-btn" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        )}
      </div>
    </>
  )
}

// ─── Quantity stepper ─────────────────────────────────────────────────────────

export function Stepper({ value, onDecrement, onIncrement, min = 0, small = false, label = 'item' }: {
  value: number
  onDecrement: () => void
  onIncrement: () => void
  min?: number
  small?: boolean
  label?: string
}) {
  return (
    <div className={`hp-stepper${small ? ' hp-stepper-sm' : ''}`} role="group" aria-label={`Quantity of ${label}`}>
      <button type="button" onClick={onDecrement} disabled={value <= min} aria-label={`Remove one ${label}`}>
        <span className="material-symbols-outlined">{value <= 1 && min === 0 ? 'delete' : 'remove'}</span>
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={onIncrement} aria-label={`Add one ${label}`}>
        <span className="material-symbols-outlined">add</span>
      </button>
    </div>
  )
}

// ─── Top bar ──────────────────────────────────────────────────────────────────

export function TopBar({ title, subtitle, left, right, children }: {
  title: ReactNode
  subtitle?: ReactNode
  left?: ReactNode
  right?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="hp-topbar">
      <div className="hp-container hp-topbar-row">
        {left}
        <div className="hp-topbar-text">
          <p className="hp-topbar-title">{title}</p>
          {subtitle && <p className="hp-topbar-sub">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </header>
  )
}

// ─── Bottom navigation ────────────────────────────────────────────────────────

export function BottomNav({ tableNumber, active, cartCount = 0, onCart, orderId }: {
  tableNumber: number
  active: 'menu' | 'cart' | 'status'
  cartCount?: number
  onCart?: () => void
  orderId?: string | null
}) {
  const cls = (key: string) => `hp-nav-item${active === key ? ' is-active' : ''}`
  return (
    <nav className="hp-nav" aria-label="Primary">
      <div className="hp-nav-inner">
        <Link href={`/menu/${tableNumber}`} className={cls('menu')}>
          <span className="material-symbols-outlined">restaurant_menu</span>
          Menu
        </Link>
        {onCart ? (
          <button type="button" onClick={onCart} className={cls('cart')}>
            <span className="material-symbols-outlined">shopping_bag</span>
            Order
            {cartCount > 0 && <span className="hp-count">{cartCount}</span>}
          </button>
        ) : (
          <Link href={`/menu/${tableNumber}`} className={cls('cart')}>
            <span className="material-symbols-outlined">shopping_bag</span>
            Order
          </Link>
        )}
        {orderId ? (
          <Link href={`/status/${orderId}`} className={cls('status')}>
            <span className="material-symbols-outlined">timelapse</span>
            Track
          </Link>
        ) : (
          <span className={`${cls('status')} is-disabled`} aria-disabled="true">
            <span className="material-symbols-outlined">timelapse</span>
            Track
          </span>
        )}
      </div>
    </nav>
  )
}

// ─── Full-screen states ───────────────────────────────────────────────────────

export function LoadingScreen({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="hp hp-center" aria-busy="true">
      <div className="hp-loader" aria-hidden="true" />
      <p className="hp-label">{label}</p>
    </div>
  )
}

export function MessageScreen({ icon, title, body, action }: {
  icon: string
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="hp hp-center">
      <div className="hp-orb"><span className="material-symbols-outlined">{icon}</span></div>
      <h1 className="hp-title">{title}</h1>
      {body && <p className="hp-muted" style={{ maxWidth: 320 }}>{body}</p>}
      {action}
    </div>
  )
}

export function PoweredBy({ inline = true }: { inline?: boolean }) {
  return <p className={inline ? 'hp-poweredby-inline' : 'hp-poweredby'}>Powered by <b>Hapag</b></p>
}

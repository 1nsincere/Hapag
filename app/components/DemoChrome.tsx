'use client'

/**
 * Demo-only UI: a small "Live demo" badge on staff screens (with a way back to
 * the tour) and a note when a visitor tries something that's turned off.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { DEMO_BLOCKED_EVENT, DEMO_MODE } from '@/lib/demo'

export default function DemoChrome() {
  const pathname = usePathname()
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (!DEMO_MODE) return
    let timer: ReturnType<typeof setTimeout>
    const onBlocked = (e: Event) => {
      setNote(String((e as CustomEvent).detail || 'That'))
      clearTimeout(timer)
      timer = setTimeout(() => setNote(null), 4200)
    }
    window.addEventListener(DEMO_BLOCKED_EVENT, onBlocked)
    return () => { window.removeEventListener(DEMO_BLOCKED_EVENT, onBlocked); clearTimeout(timer) }
  }, [])

  if (!DEMO_MODE) return null
  const staffScreen = /^\/(admin|cashier|kitchen|pos|dashboard)/.test(pathname ?? '')

  return (
    <>
      {staffScreen && (
        <Link href="/" className="demo-badge" aria-label="Live demo — back to the tour">
          <i aria-hidden="true" />Live demo<span>· resets nightly · Tour ↗</span>
        </Link>
      )}
      {note && (
        <div className="demo-note" role="status" aria-live="polite">
          <span className="material-symbols-outlined" aria-hidden="true">lock</span>
          <span><strong>{note}</strong> is turned off in the demo — everything else works.</span>
        </div>
      )}
    </>
  )
}

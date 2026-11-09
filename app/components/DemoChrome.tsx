'use client'

/**
 * Demo-only UI: a small "Live demo" badge on staff screens (with a way back to
 * the tour) and a note when a visitor tries something that's turned off.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { DEMO_BLOCKED_EVENT, DEMO_MODE, setDemoUser } from '@/lib/demo'

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

  const { data: session, status } = useSession()
  // Real owner signed in on the demo site → full editing, no demo badge
  const isDemoAccount = status !== 'authenticated' || session?.user?.demo === true ||
    (session?.user?.email ?? '').endsWith('@demo.hapag.app')   // sessions issued before the flag existed
  useEffect(() => { setDemoUser(isDemoAccount) }, [isDemoAccount])
  const staffScreen = DEMO_MODE && isDemoAccount && /^\/(admin|cashier|kitchen|pos|dashboard)/.test(pathname ?? '')
  // Phones: the badge is a strip along the top; make room for it instead of covering the header
  useEffect(() => {
    document.documentElement.classList.toggle('demo-strip', staffScreen)
    return () => document.documentElement.classList.remove('demo-strip')
  }, [staffScreen])

  if (!DEMO_MODE) return null

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

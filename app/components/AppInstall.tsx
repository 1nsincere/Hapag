'use client'

/**
 * Installable app support.
 *  • <ServiceWorker />: registers /sw.js (production only) so an installed
 *    Hapag shows a proper "No internet" screen instead of the browser's error.
 *  • <InstallAppButton />: "Install Hapag" button. Uses the browser's install
 *    prompt where there is one (Chrome, Edge, Android); on iPhone/iPad it
 *    explains Share → Add to Home Screen. Hidden once Hapag runs as an app.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => { /* app still works without it */ })
  }, [])
  return null
}

// ── Shared install-prompt store (the browser fires the event once, early) ──
let deferred: InstallPrompt | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallPrompt; emit() })
  window.addEventListener('appinstalled', () => { deferred = null; emit() })
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

function standalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
}
function isIOS() {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

/** 'prompt' | 'ios' | 'none' */
function installMode(): 'prompt' | 'ios' | 'none' {
  if (standalone()) return 'none'
  if (deferred) return 'prompt'
  if (isIOS()) return 'ios'
  return 'none'
}

export function InstallAppButton({ className = '' }: { className?: string }) {
  const mode = useSyncExternalStore(subscribe, installMode, () => 'none' as const)
  const [iosHelp, setIosHelp] = useState(false)
  if (mode === 'none') return null

  const onClick = async () => {
    if (mode === 'ios') { setIosHelp((v) => !v); return }
    const p = deferred
    if (!p) return
    await p.prompt()
    await p.userChoice.catch(() => null)
    deferred = null
    emit()
  }

  return (
    <div className={className}>
      <button type="button" onClick={onClick}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-bold text-on-surface hover:bg-zinc-50 transition-colors">
        <span className="material-symbols-outlined text-lg" aria-hidden="true">install_mobile</span>
        Install Hapag on this device
      </button>
      {iosHelp && (
        <p className="mt-2 text-xs text-on-surface-variant leading-relaxed text-center">
          In Safari, tap <strong>Share</strong> <span className="material-symbols-outlined text-sm align-middle" aria-hidden="true">ios_share</span>, then <strong>Add to Home Screen</strong>.
        </p>
      )}
    </div>
  )
}

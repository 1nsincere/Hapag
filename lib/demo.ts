/**
 * Public demo mode (portfolio site). Turn on with NEXT_PUBLIC_DEMO_MODE=true.
 *
 *  • the landing page at / showcases Hapag and offers one-click entry
 *  • demo staff accounts (staff/{uid}.demo = true) run the restaurant but
 *    can't delete or rename things — enforced by firestore.rules (isDemo)
 *  • everything demo visitors create is tagged demo: true and reset nightly
 *
 * Never turn this on for a real restaurant's site.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export type DemoRole = 'admin' | 'cashier' | 'kitchen'

export const DEMO_ACCOUNTS: Record<DemoRole, { uid: string; email: string; name: string; path: string }> = {
  admin:   { uid: 'demo-owner',   email: 'owner@demo.hapag.app',   name: 'Demo Owner',   path: '/admin' },
  cashier: { uid: 'demo-cashier', email: 'cashier@demo.hapag.app', name: 'Demo Cashier', path: '/cashier' },
  kitchen: { uid: 'demo-kitchen', email: 'kitchen@demo.hapag.app', name: 'Demo Kitchen', path: '/kitchen' },
}

/**
 * Is the signed-in person a public demo account? Set by DemoChrome from the
 * login session. Until the session is known, the demo site assumes "yes" (safe).
 * The real owner logging in on the demo site gets full editing.
 */
let demoUser = DEMO_MODE
export const setDemoUser = (v: boolean) => { demoUser = DEMO_MODE && v }
export const isDemoUser = () => demoUser

/** Extra fields for anything created in demo mode, so the nightly reset can find it */
export const demoTag = () => (DEMO_MODE ? { demo: true } : {})

export const DEMO_BLOCKED_EVENT = 'hapag:demo-blocked'

/**
 * Call at the start of an action that's turned off in the demo (deleting dishes,
 * editing staff…). In demo mode it shows the "turned off in the demo" note and
 * returns true — the caller then skips the action. Outside demo mode: false.
 */
export function demoBlocked(what: string): boolean {
  if (!demoUser) return false
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(DEMO_BLOCKED_EVENT, { detail: what }))
  return true
}

/** Same as demoBlocked, but throws (for actions whose screens already show errors). */
export function guardDemo(what: string) {
  if (demoBlocked(what)) throw new Error(`${what} is turned off in the demo.`)
}

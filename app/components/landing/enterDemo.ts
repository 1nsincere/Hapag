'use client'

/** One-click demo entry: server hands out a sign-in token for the demo account, we sign in like normal staff. */
import { signInWithCustomToken } from 'firebase/auth'
import { signIn } from 'next-auth/react'
import { auth } from '@/lib/firebase'
import type { DemoRole } from '@/lib/demo'

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
const isNetworkError = (e: unknown) => {
  const code = (e as { code?: string })?.code ?? ''
  return code === 'auth/network-request-failed' || code === 'auth/timeout' || e instanceof TypeError
}

/** Retries a step a few times when the connection blips (common on mobile data / busy Wi-Fi). */
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn() }
    catch (e) {
      if (i >= tries - 1 || !isNetworkError(e)) throw e
      await wait(800 * (i + 1))
    }
  }
}

export async function enterDemo(role: DemoRole) {
  try {
    const data = await withRetry(async () => {
      const res = await fetch('/api/demo/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.token) throw Object.assign(new Error(body.error || 'The demo is waking up — please try again.'), { code: 'demo/unavailable' })
      return body as { token: string; path: string }
    })
    const cred = await withRetry(() => signInWithCustomToken(auth, data.token))
    const idToken = await cred.user.getIdToken()
    const result = await signIn('credentials', { idToken, redirect: false })
    if (!result || result.error) throw new Error('Couldn’t open the demo. Please try again.')
    window.location.assign(data.path)
  } catch (e) {
    if (isNetworkError(e)) throw new Error('The connection dropped for a moment. Please tap the button again.')
    throw e instanceof Error ? e : new Error('Couldn’t open the demo. Please try again.')
  }
}

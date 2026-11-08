'use client'

/** One-click demo entry: server hands out a sign-in token for the demo account, we sign in like normal staff. */
import { signInWithCustomToken } from 'firebase/auth'
import { signIn } from 'next-auth/react'
import { auth } from '@/lib/firebase'
import type { DemoRole } from '@/lib/demo'

export async function enterDemo(role: DemoRole) {
  const res = await fetch('/api/demo/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.token) throw new Error(data.error || 'The demo is waking up — please try again.')
  const cred = await signInWithCustomToken(auth, data.token)
  const idToken = await cred.user.getIdToken()
  const result = await signIn('credentials', { idToken, redirect: false })
  if (!result || result.error) throw new Error('Couldn’t open the demo. Please try again.')
  window.location.assign(data.path)
}

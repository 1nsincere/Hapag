'use client'

import { useState, useEffect } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ROLE_LANDING, UserRole } from '@/lib/auth'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebase'

const isNetworkError = (err: unknown) => (err as { code?: string })?.code === 'auth/network-request-failed'

/** Retry a Firebase call a couple of times when the connection blips (patchy restaurant Wi-Fi). */
async function withNetworkRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try { return await fn() } catch (err) {
      if (!isNetworkError(err) || i >= attempts) throw err
      await new Promise(r => setTimeout(r, 1200 * i))
    }
  }
}

export default function LoginPage() {
  const router = useRouter()
  const { status, data: session } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // If already authenticated, redirect to the role's landing page (must be in
  // useEffect to avoid calling router.replace during render).
  // Skipped while a login is in progress: the NextAuth session becomes
  // "authenticated" before the Firebase sign-in finishes, and leaving early
  // would strand staff without a Firebase session (staff-only data fails).
  useEffect(() => {
    if (status === 'authenticated' && !isLoading) {
      const role = session?.user?.role
      router.replace(role && ROLE_LANDING[role] ? ROLE_LANDING[role] : '/unauthorized')
    }
  }, [status, session, router, isLoading])

  if (status === 'authenticated' && !isLoading) {
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      // 1. Verify credentials server-side via NextAuth FIRST. Only staff with
      //    valid credentials may go on to get a Firebase session — otherwise
      //    anyone could claim a staff email in Firebase Auth.
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('Invalid email or password. Please try again.')
        setIsLoading(false)
        return
      }

      // 2. Sign into Firebase Auth so Firestore security rules see the staff email
      try {
        await withNetworkRetry(() => signInWithEmailAndPassword(auth, email, password))
      } catch (err) {
        const code = (err as { code?: string }).code
        if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
          // First login for a seeded staff account — create its Firebase user
          try {
            await withNetworkRetry(() => createUserWithEmailAndPassword(auth, email, password))
          } catch (createErr) {
            if ((createErr as { code?: string }).code === 'auth/email-already-in-use') {
              await signOut({ redirect: false })
              setError('This staff account exists in Firebase with a different password. Reset it in the Firebase console.')
              setIsLoading(false)
              return
            }
            throw createErr
          }
        } else {
          throw err
        }
      }

      // Fetch the session to get the role
      const sessionRes = await fetch('/api/auth/session')
      const session = await sessionRes.json()
      const role = session?.user?.role as UserRole | undefined

      if (role && ROLE_LANDING[role]) {
        router.push(ROLE_LANDING[role])
      } else {
        router.push('/dashboard')
      }
    } catch (err) {
      console.error('Login error:', err)
      // Don't leave a half-finished login (app session without Firebase session)
      try { await signOut({ redirect: false }) } catch { /* ignore */ }
      setError(isNetworkError(err)
        ? 'Can’t reach the login server. Check the internet connection and try again.'
        : 'Something went wrong. Please try again.')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-white to-amber-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo & Header */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="w-20 h-20 bg-primary rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-2xl shadow-primary/30">
            <span className="material-symbols-outlined text-white text-4xl">restaurant</span>
          </div>
          <h1 className="text-3xl font-black text-on-surface tracking-tight">Staff Login</h1>
          <p className="text-on-surface-variant mt-2 text-sm">
            Sign in to Hapag — your restaurant&apos;s command center
          </p>
        </div>

        {/* Login Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-3xl shadow-xl border border-zinc-100 p-8 space-y-5 animate-fade-in"
        >
          {/* Email */}
          <div>
            <label htmlFor="login-email" className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-zinc-400 text-xl">
                mail
              </span>
              <input
                id="login-email"
                type="email"
                placeholder="admin@restaurant.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full pl-12 pr-4 py-3.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium
                           focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all
                           placeholder:text-zinc-400"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label htmlFor="login-password" className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">
              Password
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-zinc-400 text-xl">
                lock
              </span>
              <input
                id="login-password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full pl-12 pr-4 py-3.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium
                           focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all
                           placeholder:text-zinc-400"
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <span className="material-symbols-outlined text-red-500 text-lg">error</span>
              <p className="text-red-700 text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-primary hover:bg-primary-container text-white rounded-xl font-bold text-sm
                       transition-all shadow-lg shadow-primary/20 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed
                       flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                Signing in…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg">login</span>
                Sign In
              </>
            )}
          </button>
        </form>

        {/* Demo Credentials */}
        <div className="mt-6 bg-white/80 backdrop-blur rounded-2xl border border-zinc-100 p-5 animate-fade-in">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">
            Demo Credentials
          </p>
          <div className="space-y-2">
            {[
              { role: 'Admin',   email: 'admin@restaurant.com',   pass: 'admin123',   icon: 'admin_panel_settings', color: 'text-primary' },
              { role: 'Cashier', email: 'cashier@restaurant.com', pass: 'cashier123', icon: 'point_of_sale',        color: 'text-blue-600' },
              { role: 'Kitchen', email: 'kitchen@restaurant.com', pass: 'kitchen123', icon: 'soup_kitchen',         color: 'text-green-600' },
            ].map(cred => (
              <button
                key={cred.role}
                type="button"
                onClick={() => { setEmail(cred.email); setPassword(cred.pass); setError('') }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-50 transition-colors text-left group"
              >
                <span className={`material-symbols-outlined ${cred.color}`}>{cred.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-zinc-700">{cred.role}</p>
                  <p className="text-[10px] text-zinc-400 font-mono truncate">{cred.email} / {cred.pass}</p>
                </div>
                <span className="material-symbols-outlined text-zinc-300 text-sm group-hover:text-primary transition-colors">
                  arrow_forward
                </span>
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-[10px] text-zinc-400 mt-6">
          Customer ordering via QR code does not require login
        </p>
      </div>
    </div>
  )
}

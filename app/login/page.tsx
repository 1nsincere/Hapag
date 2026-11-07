'use client'

import { useState, useEffect } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ROLE_LANDING, UserRole } from '@/lib/auth'
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut as firebaseSignOut } from 'firebase/auth'
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
  const [notice, setNotice] = useState('')

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

  const handleForgot = async () => {
    setError('')
    setNotice('')
    if (!email.trim()) { setError('Type your email above first, then tap “Forgot password?”.'); return }
    try {
      await withNetworkRetry(() => sendPasswordResetEmail(auth, email.trim()))
    } catch (err) {
      if (isNetworkError(err)) { setError('Can’t reach the login server. Check the internet connection.'); return }
      // Don't reveal whether the email exists — fall through to the same message
    }
    setNotice('If that email belongs to a staff account, a password-reset link is on its way.')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    setNotice('')
    try {
      // 1. Firebase checks the email + password (the app never sees or stores passwords)
      let idToken: string
      try {
        const cred = await withNetworkRetry(() => signInWithEmailAndPassword(auth, email.trim(), password))
        idToken = await cred.user.getIdToken()
      } catch (err) {
        const code = (err as { code?: string }).code ?? ''
        if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(code)) {
          setError('Wrong email or password. Please try again.')
        } else if (code === 'auth/too-many-requests') {
          setError('Too many attempts. Wait a minute, or use “Forgot password?”.')
        } else if (code === 'auth/user-disabled') {
          setError('This account has been disabled. Ask the owner for help.')
        } else {
          throw err
        }
        setIsLoading(false)
        return
      }

      // 2. The server verifies the Firebase token and checks the staff list (role, active)
      const result = await signIn('credentials', { idToken, redirect: false })
      if (result?.error) {
        await firebaseSignOut(auth).catch(() => {})
        setError('This account isn’t set up as staff, or it was deactivated. Ask the owner to add you in Admin → Staff.')
        setIsLoading(false)
        return
      }

      // 3. Go to the screen for this person's role
      const sessionRes = await fetch('/api/auth/session')
      const session = await sessionRes.json()
      const role = session?.user?.role as UserRole | undefined
      router.push(role && ROLE_LANDING[role] ? ROLE_LANDING[role] : '/unauthorized')
    } catch (err) {
      console.error('Login error:', err)
      // Don't leave a half-finished login (Firebase session without app session)
      await firebaseSignOut(auth).catch(() => {})
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

          <div className="flex justify-end -mt-2">
            <button type="button" onClick={handleForgot} className="text-xs font-semibold text-primary hover:underline">
              Forgot password?
            </button>
          </div>

          {notice && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <span className="material-symbols-outlined text-emerald-600 text-lg">mark_email_read</span>
              <p className="text-emerald-800 text-sm font-medium">{notice}</p>
            </div>
          )}

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
            Demo accounts — change these passwords before going live
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

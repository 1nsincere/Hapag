'use client'

/**
 * Admin → Staff: the owner adds people, sets their role, deactivates leavers
 * and sends password resets. Passwords are handled by Firebase Authentication.
 */

import { useEffect, useState } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import type { UserRole } from '@/lib/auth'
import {
  listenToStaff, createStaffAccount, updateStaff, sendStaffPasswordReset, ensureOwnProfile,
  ROLE_INFO, type StaffMember,
} from '@/lib/staff'

const ROLES: UserRole[] = ['cashier', 'kitchen', 'admin']

function generatePassword() {
  const words = ['adobo', 'sinigang', 'lechon', 'pancit', 'halo', 'kare', 'tapa', 'sisig', 'mango', 'ube']
  const bytes = new Uint32Array(2)
  crypto.getRandomValues(bytes)
  return `${words[bytes[0] % words.length]}-${words[bytes[1] % words.length]}-${100 + (bytes[0] % 900)}`
}

export default function StaffManager({ currentEmail, currentName }: { currentEmail: string; currentName: string }) {
  const [staff, setStaff] = useState<StaffMember[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cashier' as UserRole })
  const [adding, setAdding] = useState(false)
  const [formError, setFormError] = useState('')
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null)
  const [busyUid, setBusyUid] = useState<string | null>(null)
  const [rowMsg, setRowMsg] = useState<Record<string, string>>({})
  const myUid = auth.currentUser?.uid

  useEffect(() => listenToStaff(s => { setStaff(s); setLoadError(false) }, () => setLoadError(true)), [])
  // The original demo admin may not have a profile yet — create it so they appear in the list
  useEffect(() => { ensureOwnProfile(currentName || 'Owner').catch(err => console.warn('[staff] own profile', err)) }, [currentName])

  const addStaff = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) return setFormError('Enter their name.')
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setFormError('Enter a valid email address.')
    if (form.password.length < 6) return setFormError('The password must be at least 6 characters.')
    setAdding(true)
    try {
      await createStaffAccount(form)
      setCreated({ name: form.name.trim(), email: form.email.trim(), password: form.password })
      setForm({ name: '', email: '', password: '', role: 'cashier' })
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setAdding(false)
    }
  }

  const act = async (uid: string, fn: () => Promise<void>, ok?: string) => {
    setBusyUid(uid)
    setRowMsg(m => ({ ...m, [uid]: '' }))
    try {
      await fn()
      if (ok) setRowMsg(m => ({ ...m, [uid]: ok }))
    } catch (err) {
      setRowMsg(m => ({ ...m, [uid]: (err as Error).message }))
    } finally {
      setBusyUid(null)
    }
  }

  const active = (staff ?? []).filter(s => s.active)
  const inactive = (staff ?? []).filter(s => !s.active)

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-zinc-900 mb-1">Staff</h2>
        <p className="text-sm text-zinc-500">Give each person their own login. Their role decides which screens they can open.</p>
      </div>

      {/* Roles explained */}
      <div className="grid sm:grid-cols-3 gap-3">
        {ROLES.map(r => (
          <div key={r} className="bg-white rounded-2xl border border-zinc-200 p-4">
            <p className="font-bold text-zinc-900 flex items-center gap-2"><span className="material-symbols-outlined text-primary">{ROLE_INFO[r].icon}</span>{ROLE_INFO[r].label}</p>
            <p className="text-xs text-zinc-500 mt-1">{ROLE_INFO[r].can}</p>
          </div>
        ))}
      </div>

      {/* Add staff */}
      <form onSubmit={addStaff} className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 space-y-4">
        <h3 className="font-bold text-zinc-900">Add a staff member</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Name</span>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Maria Santos"
              className="mt-1 w-full h-11 px-3 rounded-xl border border-zinc-200 bg-zinc-50 text-sm focus:ring-2 focus:ring-primary outline-none" />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Email (their login)</span>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="maria@yourrestaurant.com"
              className="mt-1 w-full h-11 px-3 rounded-xl border border-zinc-200 bg-zinc-50 text-sm focus:ring-2 focus:ring-primary outline-none" />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Temporary password</span>
            <div className="mt-1 flex gap-2">
              <input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters"
                className="flex-1 h-11 px-3 rounded-xl border border-zinc-200 bg-zinc-50 text-sm font-mono focus:ring-2 focus:ring-primary outline-none" />
              <button type="button" onClick={() => setForm({ ...form, password: generatePassword() })}
                className="h-11 px-4 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 flex items-center gap-1">
                <span className="material-symbols-outlined text-[18px]">casino</span>Generate
              </button>
            </div>
            <span className="text-[11px] text-zinc-400">Give it to them in person. They can change it with “Forgot password?” on the login screen.</span>
          </label>
        </div>
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Role</span>
          <div className="mt-1 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Role">
            {ROLES.map(r => (
              <button key={r} type="button" role="radio" aria-checked={form.role === r} onClick={() => setForm({ ...form, role: r })}
                className={`h-12 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 ${form.role === r ? 'border-primary bg-orange-50 text-primary' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'}`}>
                <span className="material-symbols-outlined text-[18px]">{ROLE_INFO[r].icon}</span>{ROLE_INFO[r].label}
              </button>
            ))}
          </div>
        </div>
        {formError && <p className="text-sm text-red-600 font-medium">{formError}</p>}
        <button type="submit" disabled={adding} className="h-11 px-6 rounded-xl bg-primary text-white font-bold text-sm hover:bg-orange-800 disabled:opacity-50 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">{adding ? 'progress_activity' : 'person_add'}</span>
          {adding ? 'Creating…' : 'Add staff member'}
        </button>
      </form>

      {created && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 flex gap-3">
          <span className="material-symbols-outlined text-emerald-600">check_circle</span>
          <div className="flex-1">
            <p className="font-bold">{created.name} can log in now.</p>
            <p className="mt-1">Email: <span className="font-mono">{created.email}</span> · Temporary password: <span className="font-mono font-bold">{created.password}</span></p>
            <p className="text-xs mt-1 text-emerald-800">Write this down for them — it won’t be shown again.</p>
          </div>
          <button onClick={() => setCreated(null)} className="self-start text-emerald-700 hover:text-emerald-900" aria-label="Dismiss">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      )}

      {/* Staff list */}
      <section className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
          <h3 className="font-bold text-zinc-900">Team ({active.length} active)</h3>
        </div>
        {loadError ? (
          <p className="p-5 text-sm text-red-600">Couldn’t load the staff list. Log out and back in as an admin.</p>
        ) : staff === null ? (
          <p className="p-5 text-sm text-zinc-400">Loading…</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {[...active, ...inactive].map(m => {
              const isMe = m.uid === myUid
              const busy = busyUid === m.uid
              return (
                <li key={m.uid} className={`px-5 py-4 flex flex-wrap items-center gap-3 ${m.active ? '' : 'bg-zinc-50 opacity-70'}`}>
                  <div className="w-10 h-10 rounded-full bg-orange-100 text-primary font-bold flex items-center justify-center shrink-0">
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-zinc-900 truncate">{m.name}{isMe && <span className="ml-2 text-xs font-bold text-primary">You</span>}{!m.active && <span className="ml-2 text-xs font-bold text-zinc-500">Deactivated</span>}</p>
                    <p className="text-xs text-zinc-500 truncate">{m.email}</p>
                    {rowMsg[m.uid] && <p className="text-xs mt-1 text-zinc-600">{rowMsg[m.uid]}</p>}
                  </div>
                  <select
                    value={m.role}
                    disabled={isMe || busy || !m.active}
                    title={isMe ? 'You can’t change your own role' : 'Change role'}
                    onChange={e => act(m.uid, () => updateStaff(m.uid, { role: e.target.value as UserRole }), 'Role updated — applies at their next login.')}
                    className="h-9 px-2 rounded-lg border border-zinc-200 bg-white text-sm font-medium disabled:opacity-60"
                  >
                    {ROLES.map(r => <option key={r} value={r}>{ROLE_INFO[r].label}</option>)}
                  </select>
                  <button
                    disabled={busy}
                    onClick={() => act(m.uid, () => sendStaffPasswordReset(m.email), 'Password-reset email sent.')}
                    className="h-9 px-3 rounded-lg border border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    title="Firebase emails them a link to choose a new password"
                  >
                    Send password reset
                  </button>
                  {!isMe && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (m.active && !confirm(`Deactivate ${m.name}? They won’t be able to log in or use any staff screen.`)) return
                        act(m.uid, () => updateStaff(m.uid, { active: !m.active }), m.active ? 'Deactivated.' : 'Reactivated.')
                      }}
                      className={`h-9 px-3 rounded-lg text-xs font-semibold disabled:opacity-50 ${m.active ? 'border border-red-200 text-red-600 hover:bg-red-50' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                    >
                      {m.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <ChangeMyPassword email={currentEmail} />

      <p className="text-xs text-zinc-400">
        The built-in demo accounts (admin@ / cashier@ / kitchen@restaurant.com) keep working until they have a profile here.
        Add your real team, then deactivate the demo accounts you don’t use.
      </p>
    </div>
  )
}

function ChangeMyPassword({ email }: { email: string }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    const user = auth.currentUser
    if (!user || !user.email) return setMsg({ ok: false, text: 'Please log in again first.' })
    if (next.length < 8) return setMsg({ ok: false, text: 'Use at least 8 characters for your new password.' })
    setBusy(true)
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current))
      await updatePassword(user, next)
      setCurrent(''); setNext('')
      setMsg({ ok: true, text: 'Password changed. Use the new one next time you log in.' })
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      setMsg({ ok: false, text: code === 'auth/invalid-credential' || code === 'auth/wrong-password' ? 'Your current password is wrong.' : code === 'auth/weak-password' ? 'That password is too weak.' : (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 space-y-3">
      <h3 className="font-bold text-zinc-900">Change my password <span className="font-normal text-sm text-zinc-500">({email})</span></h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <input type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} placeholder="Current password"
          className="h-11 px-3 rounded-xl border border-zinc-200 bg-zinc-50 text-sm focus:ring-2 focus:ring-primary outline-none" />
        <input type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} placeholder="New password (8+ characters)"
          className="h-11 px-3 rounded-xl border border-zinc-200 bg-zinc-50 text-sm focus:ring-2 focus:ring-primary outline-none" />
      </div>
      {msg && <p className={`text-sm font-medium ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</p>}
      <button type="submit" disabled={busy || !current || !next} className="h-10 px-5 rounded-xl bg-zinc-900 text-white text-sm font-bold disabled:opacity-40">
        {busy ? 'Saving…' : 'Change password'}
      </button>
    </form>
  )
}

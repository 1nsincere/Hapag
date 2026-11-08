'use client'

import { useState } from 'react'

export default function PracticeButtons({ sessionId, amountLabel }: { sessionId: string; amountLabel: string }) {
  const [busy, setBusy] = useState<'pay' | 'cancel' | null>(null)
  const [error, setError] = useState('')

  const act = async (action: 'pay' | 'cancel') => {
    setBusy(action); setError('')
    try {
      const res = await fetch(`/api/payments/practice/${sessionId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.redirect) throw new Error(data.error || 'Something went wrong. Please try again.')
      window.location.assign(data.redirect)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2">
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      <button
        type="button"
        onClick={() => act('pay')}
        disabled={busy !== null}
        className="w-full h-12 rounded-xl bg-slate-900 text-white font-bold disabled:opacity-60"
      >
        {busy === 'pay' ? 'Processing…' : `Pay ${amountLabel}`}
      </button>
      <button
        type="button"
        onClick={() => act('cancel')}
        disabled={busy !== null}
        className="w-full h-11 rounded-xl border border-slate-300 text-slate-700 font-semibold disabled:opacity-60"
      >
        {busy === 'cancel' ? 'Going back…' : 'Cancel and go back'}
      </button>
    </div>
  )
}

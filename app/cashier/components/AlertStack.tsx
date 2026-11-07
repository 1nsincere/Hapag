'use client'

/**
 * Persistent action alerts — bottom-left of the cashier screen.
 *
 * Rule: an alert only appears when someone must DO something, and it stays
 * until they do it.
 *   • Staff call     → "On my way"   (resolves the request)
 *   • New order      → "Accept"      (or accepting it anywhere else)
 *   • Ready to serve → "Mark served" (or "Got it" if someone else serves)
 * Chimes on arrival and every minute while orders/calls are still waiting.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Order, ServiceRequest } from '@/lib/data'
import { playChime } from '@/lib/chime'

const ACK_KEY = 'hapag_alert_acks'
const MAX_VISIBLE = 3

type Alert =
  | { id: string; kind: 'call'; request: ServiceRequest; at: number }
  | { id: string; kind: 'new'; order: Order; at: number }
  | { id: string; kind: 'ready'; order: Order; at: number }

function readAcks(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(ACK_KEY) ?? '[]')) } catch { return new Set() }
}

function ago(ts: number, now: number) {
  const m = Math.max(0, Math.floor((now - ts) / 60000))
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`
}

export function AlertStack({ orders, requests, now, hasPriceIssue, onAccept, onMarkServed, onResolveRequest, onReview }: {
  orders: Order[]
  requests: ServiceRequest[]
  now: number
  hasPriceIssue: (order: Order) => boolean
  onAccept: (order: Order) => Promise<void>
  onMarkServed: (order: Order) => Promise<void>
  onResolveRequest: (request: ServiceRequest) => Promise<void>
  onReview: () => void
}) {
  const [acks, setAcks] = useState<Set<string>>(() => (typeof window === 'undefined' ? new Set() : readAcks()))
  const [busy, setBusy] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  // Minimised = shrunk to a pill (nothing is dismissed). Re-opens on any NEW alert.
  const [minimised, setMinimised] = useState(false)
  const seen = useRef<Set<string> | null>(null)

  const alerts = useMemo<Alert[]>(() => {
    const list: Alert[] = [
      ...requests.map(r => ({ id: `call:${r.id}`, kind: 'call' as const, request: r, at: r.createdAt })),
      ...orders.filter(o => o.status === 'pending').map(o => ({ id: `new:${o.id}`, kind: 'new' as const, order: o, at: o.createdAt })),
      ...orders.filter(o => o.status === 'ready' && !acks.has(`ready:${o.id}`))
        .map(o => ({ id: `ready:${o.id}`, kind: 'ready' as const, order: o, at: o.updatedAt ?? o.createdAt })),
    ]
    const rank = { call: 0, new: 1, ready: 2 }
    return list.sort((a, b) => rank[a.kind] - rank[b.kind] || a.at - b.at)
  }, [orders, requests, acks])

  // Chime when a new alert arrives (not for ones already showing at page load)
  useEffect(() => {
    const ids = new Set(alerts.map(a => a.id))
    if (seen.current === null) {
      seen.current = ids
      if (alerts.some(a => a.kind !== 'ready')) playChime()
      return
    }
    const fresh = alerts.filter(a => !seen.current!.has(a.id))
    if (fresh.length) { playChime(); setMinimised(false) }
    seen.current = ids
  }, [alerts])

  // Gentle reminder every minute while customers are waiting on the cashier
  const waiting = alerts.some(a => a.kind === 'call' || a.kind === 'new')
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(playChime, 60_000)
    return () => clearInterval(t)
  }, [waiting])

  // Forget acknowledgements for orders that no longer exist / moved on
  useEffect(() => {
    const live = new Set(orders.filter(o => o.status === 'ready').map(o => `ready:${o.id}`))
    const pruned = new Set([...acks].filter(k => live.has(k)))
    if (pruned.size !== acks.size) {
      try { localStorage.setItem(ACK_KEY, JSON.stringify([...pruned])) } catch { /* non-critical */ }
    }
  }, [orders, acks])

  const acknowledge = (key: string) => {
    const next = new Set(acks).add(key)
    setAcks(next)
    try { localStorage.setItem(ACK_KEY, JSON.stringify([...next])) } catch { /* non-critical */ }
  }

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id)
    try { await fn() } catch (e) { console.error('[AlertStack]', e) } finally { setBusy(null) }
  }

  if (alerts.length === 0) return null

  if (minimised) {
    const counts = { call: 0, new: 0, ready: 0 }
    alerts.forEach(a => { counts[a.kind]++ })
    return (
      <button
        onClick={() => setMinimised(false)}
        className="fixed left-4 bottom-4 z-[70] h-12 pl-3 pr-4 rounded-full bg-zinc-900 text-white shadow-2xl flex items-center gap-2 text-sm font-bold"
        aria-label={`${alerts.length} alerts waiting — show`}
      >
        <span className="material-symbols-outlined text-[20px]">notifications_active</span>
        {alerts.length} waiting
        {counts.call > 0 && <span className="w-2.5 h-2.5 rounded-full bg-red-500" title="Staff calls" />}
        {counts.new > 0 && <span className="w-2.5 h-2.5 rounded-full bg-amber-400" title="New orders" />}
        {counts.ready > 0 && <span className="w-2.5 h-2.5 rounded-full bg-green-500" title="Ready to serve" />}
      </button>
    )
  }

  const visible = expanded ? alerts : alerts.slice(0, MAX_VISIBLE)
  const hidden = alerts.length - visible.length

  return (
    <div
      className="fixed left-4 bottom-4 z-[70] w-[min(380px,calc(100vw-2rem))] flex flex-col gap-2 max-h-[calc(100vh-6rem)] overflow-y-auto"
      role="region"
      aria-label="Alerts that need action"
      aria-live="assertive"
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 bg-white/90 rounded-full px-2 py-0.5 shadow-sm">
          Needs action · {alerts.length}
        </span>
        <button
          onClick={() => setMinimised(true)}
          className="h-7 px-2.5 rounded-full bg-white/90 shadow-sm text-xs font-semibold text-zinc-600 hover:text-zinc-900 flex items-center gap-1"
          title="Shrink — alerts stay until handled"
        >
          <span className="material-symbols-outlined text-[16px]">minimize</span>Minimise
        </button>
      </div>
      {visible.map(a => {
        const isBusy = busy === a.id
        if (a.kind === 'call') {
          return (
            <Card key={a.id} tone="red" icon="front_hand" title={`Table ${a.request.tableNumber} is calling for staff`} meta={ago(a.at, now)}>
              <button disabled={isBusy} onClick={() => run(a.id, () => onResolveRequest(a.request))} className="flex-1 h-10 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 disabled:opacity-50">
                {isBusy ? 'Saving…' : 'On my way'}
              </button>
            </Card>
          )
        }
        if (a.kind === 'new') {
          const o = a.order
          const count = o.items.reduce((s, i) => s + i.quantity, 0)
          const summary = o.items.slice(0, 2).map(i => `${i.quantity}× ${i.name}`).join(', ') + (o.items.length > 2 ? ` +${o.items.length - 2} more` : '')
          const priceIssue = hasPriceIssue(o)
          return (
            <Card key={a.id} tone="amber" icon="notifications_active" title={`New order · ${o.tableNumber ? `Table ${o.tableNumber}` : 'Takeout'}`} meta={`${count} item${count !== 1 ? 's' : ''} · ₱${o.total.toFixed(2)} · ${ago(a.at, now)}`}>
              <p className="w-full text-xs text-amber-900/80 -mt-1 mb-1 truncate">{summary}</p>
              {priceIssue && (
                <p className="w-full text-xs font-bold text-red-600 -mt-1 mb-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">warning</span>Prices don&apos;t match the menu — review first
                </p>
              )}
              {!priceIssue && (
                <button disabled={isBusy} onClick={() => run(a.id, () => onAccept(o))} className="flex-1 h-10 rounded-lg bg-amber-600 text-white font-bold text-sm hover:bg-amber-700 disabled:opacity-50">
                  {isBusy ? 'Accepting…' : 'Accept'}
                </button>
              )}
              <button onClick={onReview} className={`${priceIssue ? 'flex-1 bg-red-600 text-white border-red-600' : 'bg-white text-amber-900 border-amber-300'} h-10 px-4 rounded-lg border font-semibold text-sm`}>
                Review
              </button>
            </Card>
          )
        }
        const o = a.order
        return (
          <Card key={a.id} tone="green" icon="room_service" title={`Ready to serve · ${o.tableNumber ? `Table ${o.tableNumber}` : 'Takeout'}`} meta={ago(a.at, now)}>
            <button disabled={isBusy} onClick={() => run(a.id, () => onMarkServed(o))} className="flex-1 h-10 rounded-lg bg-green-600 text-white font-bold text-sm hover:bg-green-700 disabled:opacity-50">
              {isBusy ? 'Saving…' : 'Mark served'}
            </button>
            <button onClick={() => acknowledge(a.id)} className="h-10 px-4 rounded-lg border border-green-300 bg-white text-green-900 font-semibold text-sm" title="Someone else is serving it">
              Got it
            </button>
          </Card>
        )
      })}
      {(hidden > 0 || expanded) && alerts.length > MAX_VISIBLE && (
        <button onClick={() => setExpanded(v => !v)} className="self-start h-9 px-4 rounded-full bg-zinc-900 text-white text-sm font-semibold shadow-lg">
          {expanded ? 'Show less' : `+${hidden} more waiting`}
        </button>
      )}
    </div>
  )
}

const TONES = {
  red:   { box: 'bg-red-50 border-red-300',     icon: 'bg-red-600 text-white',   title: 'text-red-900',   meta: 'text-red-800/70' },
  amber: { box: 'bg-amber-50 border-amber-300', icon: 'bg-amber-500 text-white', title: 'text-amber-950', meta: 'text-amber-900/70' },
  green: { box: 'bg-green-50 border-green-300', icon: 'bg-green-600 text-white', title: 'text-green-950', meta: 'text-green-900/70' },
}

function Card({ tone, icon, title, meta, children }: {
  tone: keyof typeof TONES
  icon: string
  title: string
  meta: string
  children: React.ReactNode
}) {
  const t = TONES[tone]
  return (
    <div className={`rounded-2xl border-2 ${t.box} shadow-xl p-3 animate-[hpAlertIn_.35s_ease-out]`}>
      <div className="flex items-start gap-3 mb-2">
        <span className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${t.icon}`}>
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </span>
        <div className="min-w-0">
          <p className={`font-bold text-sm leading-tight ${t.title}`}>{title}</p>
          <p className={`text-xs mt-0.5 ${t.meta}`}>{meta}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

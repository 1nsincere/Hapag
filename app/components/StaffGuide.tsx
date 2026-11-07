'use client'

/**
 * "How it works" — a built-in staff guide. Same content on every staff screen,
 * with the current role's tasks highlighted, so training is one conversation.
 */

import { useEffect } from 'react'
import { STAGES, TABLE_RULES, TONE_CLASSES, type Role } from '@/lib/orderFlow'

type GuideRole = 'cashier' | 'kitchen' | 'admin'

const ROLE_OWNS: Record<GuideRole, Role[]> = {
  cashier: ['Cashier', 'Server'],
  kitchen: ['Kitchen', 'Server'],
  admin: ['Cashier', 'Kitchen', 'Server'],
}

const FAQ: { q: string; a: string; roles: GuideRole[] }[] = [
  { q: 'A walk-in customer wants to order at the counter.', a: 'Cart tab → add the items → choose their table (or Takeout) → take payment. It goes straight to the kitchen — no accepting needed.', roles: ['cashier', 'admin'] },
  { q: 'A customer says they paid, but the kitchen doesn’t have it.', a: 'Open the Orders tab. If the order still says “Awaiting payment”, the payment didn’t go through — tap Take payment and collect it at the counter.', roles: ['cashier', 'admin'] },
  { q: 'An order shows prices in red.', a: 'The prices don’t match the menu. Don’t accept it — ask the customer to order again from the QR menu.', roles: ['cashier', 'admin'] },
  { q: 'The guests have left.', a: 'Tables tab (or Floor plan) → tap the table → Clear table (guests left). Paying does NOT free a table — only you do, so nobody gets seated at a table that’s still eating.', roles: ['cashier', 'admin'] },
  { q: 'I tapped the wrong button in the kitchen.', a: 'Use the Undo button on the message that pops up right after you tap.', roles: ['kitchen', 'admin'] },
  { q: 'The kitchen marked something ready — who serves it?', a: 'Whoever is free. The cashier sees a green “Ready to serve” alert: tap Mark served after bringing it, or Got it if someone else is serving.', roles: ['cashier', 'kitchen', 'admin'] },
  { q: 'Where do I change the menu, prices or tables?', a: 'Admin → Menu Manager for dishes and prices, Table Management for tables & QR codes, Floor Plan to arrange the dining room.', roles: ['admin'] },
]

export function StaffGuide({ open, onClose, role }: { open: boolean; onClose: () => void; role: GuideRole }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const mine = ROLE_OWNS[role]

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="How Hapag works">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-3xl shadow-2xl">
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-zinc-100 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-xl font-bold text-zinc-900">How Hapag works</h2>
            <p className="text-sm text-zinc-500">One order, six steps. Your steps are highlighted.</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-xl hover:bg-zinc-100 flex items-center justify-center" aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* The journey */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">The order journey</h3>
            <ol className="space-y-2">
              {STAGES.map(s => {
                const isMine = s.owner !== null && mine.includes(s.owner)
                const tone = TONE_CLASSES[s.tone]
                return (
                  <li key={s.status} className={`flex gap-3 rounded-2xl border p-3 ${isMine ? 'border-orange-300 bg-orange-50/60' : 'border-zinc-100'}`}>
                    <span className="w-8 h-8 shrink-0 rounded-full bg-zinc-900 text-white text-sm font-bold flex items-center justify-center">{s.step}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold ${tone.chip}`}>
                          <span className="material-symbols-outlined text-[14px]">{s.icon}</span>{s.label}
                        </span>
                        {s.owner && <span className="text-xs text-zinc-500">Who: <b className="text-zinc-800">{s.owner}</b></span>}
                        {s.nextAction && <span className="text-xs text-zinc-500">Button: <b className="text-zinc-800">{s.nextAction}</b></span>}
                        {isMine && <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-orange-700">Your step</span>}
                      </div>
                      <p className="text-sm text-zinc-600 mt-1">{s.explain}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>

          {/* Tables */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">Tables</h3>
            <div className="grid sm:grid-cols-3 gap-2">
              {TABLE_RULES.map(t => (
                <div key={t.status} className="rounded-2xl border border-zinc-100 p-3">
                  <p className="font-bold text-sm flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />{t.status}</p>
                  <p className="text-sm text-zinc-600 mt-1">{t.explain}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-zinc-600 mt-3 bg-zinc-50 rounded-xl p-3">
              <b>Golden rule:</b> a table only becomes Available when the cashier marks it — after the guests leave.
              A table with a <b>“Ready to clear”</b> tag has everything served and paid.
            </p>
          </section>

          {/* Alerts */}
          {role !== 'kitchen' && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">Alerts (bottom-left of the cashier screen)</h3>
              <ul className="space-y-2 text-sm text-zinc-700">
                <li className="flex gap-2"><span className="w-3 h-3 mt-1 rounded-full bg-red-600 shrink-0" /><span><b>Table is calling for staff</b> — go to the table, then tap <b>On my way</b>.</span></li>
                <li className="flex gap-2"><span className="w-3 h-3 mt-1 rounded-full bg-amber-500 shrink-0" /><span><b>New order</b> — check it and tap <b>Accept</b>. The customer can’t pay until you do.</span></li>
                <li className="flex gap-2"><span className="w-3 h-3 mt-1 rounded-full bg-green-600 shrink-0" /><span><b>Ready to serve</b> — bring the food, tap <b>Mark served</b>.</span></li>
              </ul>
              <p className="text-xs text-zinc-500 mt-2">Alerts stay until someone handles them, and chime again every minute while a customer is waiting.</p>
            </section>
          )}

          {/* FAQ */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">Quick answers</h3>
            <div className="space-y-2">
              {FAQ.filter(f => f.roles.includes(role)).map(f => (
                <details key={f.q} className="group rounded-2xl border border-zinc-100 p-3">
                  <summary className="cursor-pointer list-none font-semibold text-sm text-zinc-800 flex items-center justify-between gap-2">
                    {f.q}
                    <span className="material-symbols-outlined text-zinc-400 group-open:rotate-180 transition-transform">expand_more</span>
                  </summary>
                  <p className="text-sm text-zinc-600 mt-2">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

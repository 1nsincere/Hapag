/**
 * Practice payment page — stands in for PayMongo / Xendit's hosted checkout.
 * No real money moves. Clearly labelled so nobody mistakes it for a real bank page.
 */
import { adminDb } from '@/lib/server/firebaseAdmin'
import { getProvider } from '@/lib/server/payments'
import PracticeButtons from './PracticeButtons'

export const dynamic = 'force-dynamic'

/** Still payable? (status + 30-minute expiry) */
function isOpen(s: FirebaseFirestore.DocumentData | null) {
  return s?.status === 'open' && Date.now() < Number(s.expiresAt)
}

const METHOD = { qrph: 'QR Ph (GCash, Maya, bank apps)', card: 'Debit / credit card' } as const

export default async function PracticePayPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const valid = /^[a-f0-9]{32}$/.test(sessionId) && getProvider().practice
  const snap = valid ? await adminDb().collection('paymentSessions').doc(sessionId).get() : null
  const session = snap?.exists && snap.get('provider') === 'practice' ? snap.data()! : null
  const settings = session ? (await adminDb().collection('settings').doc('general').get()).data() : null

  const open = isOpen(session)
  const amount = Number(session?.amount ?? 0)

  return (
    <main className="min-h-dvh bg-slate-100 text-slate-900 flex items-start sm:items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-3 rounded-xl bg-amber-100 border border-amber-300 text-amber-950 px-4 py-3 text-sm flex gap-2">
          <span className="material-symbols-outlined text-[20px]">science</span>
          <span><strong>Practice payment.</strong> No real money moves. A real payment provider replaces this page when it&apos;s connected.</span>
        </div>

        <div className="rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
          {!session ? (
            <div className="p-8 text-center">
              <span className="material-symbols-outlined text-4xl text-slate-400">link_off</span>
              <h1 className="mt-2 text-lg font-bold">Payment not found</h1>
              <p className="mt-1 text-sm text-slate-500">Go back to the restaurant&apos;s page and tap Pay again.</p>
            </div>
          ) : (
            <>
              <div className="px-6 pt-6 pb-4 border-b border-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pay to</p>
                <p className="text-lg font-bold">{String(settings?.restaurantName ?? 'Restaurant')}</p>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Amount</p>
                <p className="text-4xl font-extrabold tabular-nums">₱{amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="px-6 py-4 text-sm flex items-center gap-3">
                <span className="material-symbols-outlined text-slate-500">{session.method === 'card' ? 'credit_card' : 'qr_code_scanner'}</span>
                <span>{METHOD[session.method as keyof typeof METHOD] ?? 'Online payment'}</span>
              </div>
              <div className="px-6 pb-6">
                {open ? (
                  <PracticeButtons sessionId={sessionId} amountLabel={`₱${amount.toFixed(2)}`} />
                ) : session.status === 'paid' ? (
                  <p className="text-center text-sm font-semibold text-emerald-700">Already paid — you can close this page.</p>
                ) : (
                  <p className="text-center text-sm text-slate-500">This payment link is no longer active. Go back and tap Pay again.</p>
                )}
              </div>
            </>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">Secured checkout · Hapag practice mode</p>
      </div>
    </main>
  )
}

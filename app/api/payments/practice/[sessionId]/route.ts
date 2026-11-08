/**
 * POST /api/payments/practice/:sessionId  { action: 'pay' | 'cancel' }
 * The Practice payment page's buttons. "Pay" sends a SIGNED webhook to our own
 * webhook route — the same path a real provider uses. Disabled unless the
 * Practice provider is the active one.
 */
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { adminDb } from '@/lib/server/firebaseAdmin'
import { getProvider } from '@/lib/server/payments'
import { signPracticeWebhook } from '@/lib/server/payments/practice'
import { requestOrigin } from '@/lib/server/customerRequest'

export const runtime = 'nodejs'

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  if (!getProvider().practice) return fail('Practice payments are turned off.', 404)
  const { sessionId } = await ctx.params
  if (!/^[a-f0-9]{32}$/.test(sessionId)) return fail('Payment not found.', 404)
  const body = await req.json().catch(() => ({}))
  const action = body?.action

  const db = adminDb()
  const ref = db.collection('paymentSessions').doc(sessionId)
  const session = await ref.get()
  if (!session.exists || session.get('provider') !== 'practice') return fail('Payment not found.', 404)
  const status = session.get('status')
  if (status === 'paid') return NextResponse.json({ redirect: session.get('successUrl') })
  if (status !== 'open') return fail('This payment link is no longer active. Go back and tap Pay again.', 409)
  if (Date.now() > Number(session.get('expiresAt'))) {
    await ref.update({ status: 'expired' })
    return fail('This payment link expired. Go back and tap Pay again.', 409)
  }

  if (action === 'cancel') {
    await ref.update({ status: 'cancelled' })
    return NextResponse.json({ redirect: session.get('cancelUrl') })
  }
  if (action !== 'pay') return fail('Bad request.')

  // Like a real provider: tell the shop's webhook, signed, and retry if it's busy
  const payload = JSON.stringify({
    type: 'payment.paid',
    data: { sessionId, amount: Number(session.get('amount')), reference: 'PRACTICE-' + randomBytes(4).toString('hex').toUpperCase() },
  })
  const webhookUrl = new URL('/api/payments/webhook/practice', requestOrigin(req))
  let delivered = false
  for (let i = 0; i < 3 && !delivered; i++) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...signPracticeWebhook(payload) },
        body: payload,
      })
      delivered = res.ok
    } catch { /* retry */ }
    if (!delivered) await new Promise(r => setTimeout(r, 800 * (i + 1)))
  }
  if (!delivered) return fail('The restaurant didn’t get the payment message. Please try again.', 502)
  return NextResponse.json({ redirect: session.get('successUrl') })
}

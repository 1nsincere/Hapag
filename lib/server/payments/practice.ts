/**
 * Practice payment provider — behaves like a real gateway, but no money moves.
 *
 *  • createCheckout → our own payment page (/pay/practice/:sessionId)
 *  • when the guest taps Pay there, we send ourselves a SIGNED webhook,
 *    exactly like PayMongo/Xendit would, and the normal webhook code checks
 *    the signature before marking the order paid
 *
 * The signature is HMAC-SHA256 over "timestamp.body" — the same scheme
 * real providers use — so the webhook path is exercised for real.
 */
import { createHmac, timingSafeEqual } from 'crypto'
import type { CheckoutRequest, CheckoutResult, PaidEvent, PaymentProvider } from './types'

const SIGNATURE_HEADER = 'x-hapag-signature'
const MAX_AGE_SECONDS = 5 * 60

function secret() {
  return process.env.PAYMENT_WEBHOOK_SECRET || process.env.NEXTAUTH_SECRET || 'hapag-practice-webhook-secret'
}

const sign = (timestamp: number, body: string) =>
  createHmac('sha256', secret()).update(`${timestamp}.${body}`).digest('hex')

export function signPracticeWebhook(body: string) {
  const t = Math.floor(Date.now() / 1000)
  return { [SIGNATURE_HEADER]: `t=${t},v1=${sign(t, body)}` }
}

export const practiceProvider: PaymentProvider = {
  id: 'practice',
  label: 'Practice payments (no real money)',
  practice: true,

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    const origin = new URL(req.successUrl).origin
    return { checkoutUrl: `${origin}/pay/practice/${req.sessionId}` }
  },

  async verifyWebhook(rawBody: string, headers: Headers): Promise<PaidEvent | null> {
    const header = headers.get(SIGNATURE_HEADER) ?? ''
    const parts = Object.fromEntries(header.split(',').map(p => p.split('=') as [string, string]))
    const t = Number(parts.t)
    if (!t || !parts.v1) throw new Error('missing signature')
    if (Math.abs(Date.now() / 1000 - t) > MAX_AGE_SECONDS) throw new Error('stale signature')
    const expected = Buffer.from(sign(t, rawBody), 'hex')
    const given = Buffer.from(parts.v1, 'hex')
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error('bad signature')

    const event = JSON.parse(rawBody) as { type?: string; data?: { sessionId?: string; amount?: number; reference?: string } }
    if (event.type !== 'payment.paid') return null
    const d = event.data ?? {}
    if (!d.sessionId || typeof d.amount !== 'number') throw new Error('malformed event')
    return { sessionId: d.sessionId, amount: d.amount, reference: d.reference ?? '' }
  },
}

/**
 * Online payments, provider-neutral.
 *
 * Rule: an order becomes PAID only when a verified provider webhook says the
 * money arrived, for the exact amount the server asked for. The phone can't
 * mark anything paid.
 *
 * paymentSessions/{id} (server-only; rules deny all client access):
 *   { orderId, provider, amount, status: open | paid | cancelled | superseded | expired,
 *     createdAt, expiresAt, successUrl, cancelUrl, reference? }
 */
import { randomBytes } from 'crypto'
import type { Firestore } from 'firebase-admin/firestore'
import type { PaidEvent, PaymentProvider } from './types'
import { practiceProvider } from './practice'
import { demoTag } from '@/lib/demo'

const SESSION_TTL_MS = 30 * 60 * 1000

const PROVIDERS: Record<string, PaymentProvider> = {
  practice: practiceProvider,
  // paymongo: paymongoProvider,   ← add when the account is approved
  // xendit: xenditProvider,
}

export function getProvider(id = process.env.PAYMENT_PROVIDER || 'practice'): PaymentProvider {
  const p = PROVIDERS[id]
  if (!p) throw new Error(`Payment provider "${id}" isn't connected yet.`)
  return p
}

export function findProvider(id: string): PaymentProvider | null {
  return PROVIDERS[id] ?? null
}

/** Starts a checkout for an order whose items/totals the server has just set. */
export async function startOnlinePayment(db: Firestore, input: {
  orderId: string
  tableNumber: number
  amount: number
  method: 'qrph' | 'card'
  origin: string
  restaurantName: string
}) {
  const provider = getProvider()
  const sessionId = randomBytes(16).toString('hex')
  const successUrl = `${input.origin}/confirmation/${input.orderId}`
  const cancelUrl = `${input.origin}/checkout/${input.orderId}?payment=cancelled`
  const now = Date.now()

  await db.collection('paymentSessions').doc(sessionId).set({
    orderId: input.orderId,
    provider: provider.id,
    practice: provider.practice,
    amount: input.amount,
    method: input.method,
    status: 'open',
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    successUrl,
    cancelUrl,
    ...demoTag(),
  })

  const { checkoutUrl, providerRef } = await provider.createCheckout({
    sessionId,
    orderId: input.orderId,
    amount: input.amount,
    description: `${input.restaurantName} · Table ${input.tableNumber}`,
    method: input.method,
    successUrl,
    cancelUrl,
  })

  // The newest attempt is the one that counts; older open ones are superseded.
  const orderRef = db.collection('orders').doc(input.orderId)
  await db.runTransaction(async tx => {
    const order = await tx.get(orderRef)
    const previous = order.get('paymentSessionId') as string | undefined
    const prevRef = previous && previous !== sessionId ? db.collection('paymentSessions').doc(previous) : null
    const prev = prevRef ? await tx.get(prevRef) : null
    tx.update(orderRef, { paymentSessionId: sessionId, paymentProvider: provider.id, updatedAt: Date.now() })
    if (prevRef && prev?.get('status') === 'open') tx.update(prevRef, { status: 'superseded' })
    if (providerRef) tx.update(db.collection('paymentSessions').doc(sessionId), { providerRef })
  })

  return { checkoutUrl, practice: provider.practice }
}

/**
 * Called only with a VERIFIED webhook event. Safe to receive twice (providers retry).
 * Returns a short word for logs.
 */
export async function markSessionPaid(db: Firestore, providerId: string, event: PaidEvent) {
  const sessionRef = db.collection('paymentSessions').doc(event.sessionId)
  return db.runTransaction(async tx => {
    const session = await tx.get(sessionRef)
    if (!session.exists || session.get('provider') !== providerId) return 'unknown-session'
    if (session.get('status') === 'paid') return 'already-paid'

    const orderRef = db.collection('orders').doc(session.get('orderId'))
    const order = await tx.get(orderRef)
    const now = Date.now()
    const amountOk = Math.abs(Number(session.get('amount')) - event.amount) < 0.01
    tx.update(sessionRef, { status: 'paid', paidAt: now, reference: event.reference, amountReceived: event.amount })

    if (!order.exists) return 'order-missing'
    if (order.get('paymentStatus') === 'paid') {
      // Paid twice (e.g. counter + phone) — keep the order, tell the cashier
      tx.update(orderRef, { paymentIssue: `A second online payment of ₱${event.amount.toFixed(2)} arrived (ref ${event.reference}). Check before refunding.`, updatedAt: now })
      return 'double-payment'
    }
    const current = order.get('paymentSessionId') === event.sessionId
    const amountMatchesOrder = Math.abs(Number(order.get('grandTotal')) - event.amount) < 0.01
    if (!amountOk || !current || !amountMatchesOrder) {
      // Money arrived but doesn't match what's owed now (order changed after paying started)
      tx.update(orderRef, { paymentIssue: `Online payment of ₱${event.amount.toFixed(2)} (ref ${event.reference}) doesn't match this order's total. Check with the guest.`, updatedAt: now })
      return 'mismatch'
    }
    tx.update(orderRef, {
      paymentStatus: 'paid',
      paidAt: now,
      status: 'preparing',
      paymentReference: event.reference,
      paymentIssue: null,
      updatedAt: now,
    })
    return 'paid'
  })
}

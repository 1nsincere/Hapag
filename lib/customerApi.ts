/**
 * Customer phone → server. The phone sends only what it wants (dishes,
 * options, quantities); the server sets prices and totals (lib/server/orders.ts).
 */
import { collection, doc } from 'firebase/firestore'
import { auth, db } from './firebase'
import { ensureAuth, type CartItem } from './data'

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

async function post<T>(path: string, body: unknown): Promise<T> {
  await ensureAuth()
  const user = auth.currentUser
  if (!user) throw new Error('Please refresh the page and try again.')
  const token = await user.getIdToken()
  let res: Response | null = null
  // Both calls are safe to repeat (orders carry their own id; paying twice is a no-op)
  for (let attempt = 0; ; attempt++) {
    // Never leave the guest staring at "Sending…": give up on a stuck request and retry
    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), 20_000)
    try {
      res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: timeout.signal,
      })
      if (res.status < 500 || attempt >= 2) break
    } catch {
      if (attempt >= 2) throw new Error('The connection is slow right now. Please check your internet and try again.')
    } finally {
      clearTimeout(timer)
    }
    await wait(1000 * (attempt + 1))
  }
  const data = await res!.json().catch(() => ({}))
  if (!res!.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
  return data as T
}

const wanted = (items: CartItem[]) =>
  items.map(({ id, baseId, variantName, quantity, notes }) => ({ id, baseId, variantName, quantity, notes }))

/** A fresh order id, made on the phone so a retried request can't create a duplicate. */
export const newOrderId = () => doc(collection(db, 'orders')).id

export function placeCustomerOrder(input: {
  orderId: string
  tableNumber: number
  qrToken: string
  items: CartItem[]
  specialInstructions?: string
}) {
  return post<{ orderId: string }>('/api/orders', { ...input, items: wanted(input.items) })
}

export function payCustomerOrder(orderId: string, input: {
  paymentMethod: 'qrph' | 'card' | 'cash'
  tipPercent: number
  items: CartItem[]
}) {
  return post<{ status: 'paid' | 'pay-at-counter' | 'redirect'; grandTotal: number; checkoutUrl?: string; practice?: boolean }>(
    `/api/orders/${encodeURIComponent(orderId)}/pay`,
    { ...input, items: wanted(input.items) },
  )
}

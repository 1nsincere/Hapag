/**
 * Customer orders, decided on the server.
 *
 * The phone only says WHAT it wants (dish ids, options, quantities). Names,
 * prices, tax, service fee and totals always come from the menu and Settings
 * in Firestore, so a tampered phone can't change what it pays.
 *
 * Firestore rules no longer let customers write orders or stock directly —
 * these functions (called by /api/orders…) are the only way in.
 */
import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore'
import type { CartItem, MenuItem } from '@/lib/data'
import { orderTotals, round2, DEFAULT_TAX_RATE, DEFAULT_SERVICE_FEE } from '@/lib/pricing'
import { startOnlinePayment } from './payments'

export class OrderError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

const MAX_LINES = 40          // different dishes in one order
const MAX_QTY = 50            // of one dish
const MAX_OPEN_ORDERS = 5     // unpaid orders per phone (stops spam)
const OPEN_WINDOW_MS = 6 * 60 * 60 * 1000
const MAX_TIP_PERCENT = 30
const ORDER_ID = /^[A-Za-z0-9]{20}$/

type PaymentMethod = 'qrph' | 'card' | 'cash'
interface Line { key: string; base: string; variantName?: string; quantity: number; notes?: string }

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const safeImage = (img: unknown) => (typeof img === 'string' && !img.startsWith('data:') ? img : '')

/** What the phone asked for → clean, merged lines (no prices trusted). */
function parseLines(raw: unknown): Line[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new OrderError('Your order has no items.')
  if (raw.length > MAX_LINES) throw new OrderError('Too many different dishes in one order.')
  const merged = new Map<string, Line>()
  for (const r of raw as Record<string, unknown>[]) {
    const id = text(r?.id, 200)
    const base = text(r?.baseId, 128) || id.split('::')[0]
    if (!base || base.includes('/')) throw new OrderError('A dish in your order wasn’t recognised.')
    const variantName = text(r.variantName, 60) || undefined
    const quantity = Number(r.quantity)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) throw new OrderError('Please check the quantities in your order.')
    const notes = text(r.notes, 200) || undefined
    const key = variantName ? `${base}::${variantName}` : base
    const prev = merged.get(key)
    if (prev) {
      prev.quantity += quantity
      if (prev.quantity > MAX_QTY) throw new OrderError('Please check the quantities in your order.')
    } else {
      merged.set(key, { key, base, variantName, quantity, notes })
    }
  }
  return [...merged.values()]
}

/** Lines → order items with the menu's own names and prices. */
function priceLines(lines: Line[], menu: Map<string, MenuItem | undefined>): CartItem[] {
  return lines.map(l => {
    const m = menu.get(l.base)
    if (!m) throw new OrderError('A dish in your order is no longer on the menu. Please review your order.', 409)
    let price = Number(m.price)
    if (l.variantName) {
      const v = m.variants?.find(x => x.name === l.variantName)
      if (!v) throw new OrderError(`That option for ${m.name} is no longer available.`, 409)
      price = Number(v.price)
    }
    if (!Number.isFinite(price) || price < 0) throw new OrderError(`${m.name} has no price yet — please ask staff.`, 409)
    return {
      id: l.key, baseId: l.base, name: m.name, price: round2(price), quantity: l.quantity, image: safeImage(m.image),
      ...(l.variantName ? { variantName: l.variantName } : {}),
      ...(l.notes ? { notes: l.notes } : {}),
    }
  })
}

const qtyByBase = (items: { id: string; baseId?: string; quantity: number }[]) => {
  const out = new Map<string, number>()
  for (const i of items) {
    const base = i.baseId ?? i.id.split('::')[0]
    out.set(base, (out.get(base) ?? 0) + (Number(i.quantity) || 0))
  }
  return out
}
const subtotalOf = (items: CartItem[]) => round2(items.reduce((s, i) => s + i.price * i.quantity, 0))

async function readMenu(db: Firestore, tx: Transaction, bases: string[]) {
  if (bases.length === 0) return new Map<string, MenuItem | undefined>()
  const snaps = await tx.getAll(...bases.map(b => db.collection('menu').doc(b)))
  return new Map(snaps.map(s => [s.id, s.exists ? ({ id: s.id, ...s.data() } as MenuItem) : undefined]))
}

function soldOutMessage(m: MenuItem, stockLeft?: number) {
  return typeof stockLeft === 'number' && stockLeft > 0
    ? `Only ${stockLeft} ${m.name} left — please lower the quantity.`
    : `Sorry, ${m.name} just sold out.`
}

function stockUpdate(ref: DocumentReference, tx: Transaction, m: MenuItem, change: number) {
  if (typeof m.stock !== 'number' || change === 0) return
  const stock = Math.max(0, m.stock - change)
  tx.update(ref, { stock, ...(stock <= 0 ? { available: false } : {}) })
}

// ─── Place an order (from the table's QR code) ─────────────────────────────

export async function createCustomerOrder(db: Firestore, uid: string, body: Record<string, unknown>) {
  const tableNumber = Number(body.tableNumber)
  if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > 9999) throw new OrderError('Table not found. Please scan the QR code on your table again.')
  const qrToken = text(body.qrToken, 100)
  if (!qrToken) throw new OrderError('To order, please scan the QR code on your table.', 403)
  const orderId = text(body.orderId, 40)
  if (!ORDER_ID.test(orderId)) throw new OrderError('Please refresh the page and try again.')
  const lines = parseLines(body.items)
  const specialInstructions = text(body.specialInstructions, 500)

  // Anti-spam: a phone can only have a few unpaid orders open at once
  const mine = await db.collection('orders').where('customerUid', '==', uid).get()
  const openCount = mine.docs.filter(d =>
    d.id !== orderId && d.get('paymentStatus') !== 'paid' && Date.now() - Number(d.get('createdAt') || 0) < OPEN_WINDOW_MS).length
  if (openCount >= MAX_OPEN_ORDERS) throw new OrderError('You have several orders waiting already. Please ask staff for help.', 429)

  return db.runTransaction(async tx => {
    const ref = db.collection('orders').doc(orderId)
    const existing = await tx.get(ref)
    if (existing.exists) {
      // Same request sent twice (e.g. the Wi-Fi dropped) — return the first one
      if (existing.get('customerUid') === uid) return { orderId }
      throw new OrderError('Please refresh the page and try again.', 409)
    }

    const secret = await tx.get(db.collection('tableSecrets').doc(String(tableNumber)))
    if (!secret.exists || secret.get('token') !== qrToken) {
      throw new OrderError('This QR code is no longer valid. Please scan the code on your table again.', 403)
    }

    const bases = [...new Set(lines.map(l => l.base))]
    const menu = await readMenu(db, tx, bases)
    const items = priceLines(lines, menu)
    const need = qtyByBase(items)
    for (const [base, qty] of need) {
      const m = menu.get(base)!
      if (m.available === false) throw new OrderError(soldOutMessage(m), 409)
      if (typeof m.stock === 'number' && m.stock < qty) throw new OrderError(soldOutMessage(m, m.stock), 409)
    }

    const now = Date.now()
    tx.set(ref, {
      tableNumber,
      items,
      status: 'pending',
      paymentStatus: 'pending',
      specialInstructions,
      total: subtotalOf(items),
      orderType: 'dine-in',
      customerUid: uid,
      qrToken,
      priceSource: 'server',
      createdAt: now,
      updatedAt: now,
    })
    // Reserve stock now so two tables can't buy the last plate
    for (const [base, qty] of need) stockUpdate(db.collection('menu').doc(base), tx, menu.get(base)!, qty)
    return { orderId }
  })
}

// ─── Check out (after the cashier accepts) ─────────────────────────────────

export async function payCustomerOrder(db: Firestore, uid: string, orderId: string, body: Record<string, unknown>, origin: string) {
  if (!ORDER_ID.test(orderId)) throw new OrderError('Order not found.', 404)
  const method = body.paymentMethod as PaymentMethod
  if (method !== 'qrph' && method !== 'card' && method !== 'cash') throw new OrderError('Please choose how you’ll pay.')
  const tipPercent = Number(body.tipPercent ?? 0)
  if (!Number.isFinite(tipPercent) || tipPercent < 0 || tipPercent > MAX_TIP_PERCENT) throw new OrderError('Please choose a tip from the list.')
  const lines = parseLines(body.items)

  const result = await db.runTransaction(async tx => {
    const ref = db.collection('orders').doc(orderId)
    const snap = await tx.get(ref)
    if (!snap.exists || snap.get('customerUid') !== uid) throw new OrderError('Order not found.', 404)
    const order = snap.data()!
    if (order.paymentStatus === 'paid') return { status: 'paid' as const, grandTotal: Number(order.grandTotal) || 0 }
    if (order.status !== 'accepted') throw new OrderError('Your order is still waiting for the restaurant to confirm it. Please try again in a moment.', 409)

    const settingsSnap = await tx.get(db.collection('settings').doc('general'))
    const settings = {
      taxRate: String(settingsSnap.get('taxRate') ?? DEFAULT_TAX_RATE),
      serviceFee: String(settingsSnap.get('serviceFee') ?? DEFAULT_SERVICE_FEE),
    }

    const before = qtyByBase((order.items ?? []) as CartItem[])
    const bases = [...new Set([...before.keys(), ...lines.map(l => l.base)])]
    const menu = await readMenu(db, tx, bases)
    const items = priceLines(lines, menu)
    const after = qtyByBase(items)

    // Only ADDED plates need stock; removed plates go back on the shelf
    const changes: [string, number][] = bases.map(b => [b, (after.get(b) ?? 0) - (before.get(b) ?? 0)])
    for (const [base, delta] of changes) {
      const m = menu.get(base)
      if (delta <= 0 || !m) continue
      if (m.available === false) throw new OrderError(soldOutMessage(m), 409)
      if (typeof m.stock === 'number' && m.stock < delta) throw new OrderError(soldOutMessage(m, m.stock), 409)
    }

    const subtotal = subtotalOf(items)
    const now = Date.now()
    for (const [base, delta] of changes) {
      const m = menu.get(base)
      if (m) stockUpdate(db.collection('menu').doc(base), tx, m, delta)
    }

    if (method === 'cash') {
      // Cash: nothing is paid yet — the cashier collects it and then sends it to the kitchen
      const totals = orderTotals(subtotal, settings)
      tx.update(ref, {
        items, total: subtotal, paymentMethod: 'cash', payAtCounter: true,
        tipAmount: 0, grandTotal: totals.total, priceSource: 'server', updatedAt: now,
      })
      return { status: 'pay-at-counter' as const, grandTotal: totals.total }
    }

    // QR Ph / card: lock in what's owed. It is NOT paid yet — only the payment
    // provider's verified webhook can mark it paid (lib/server/payments).
    const totals = orderTotals(subtotal, settings, { tipPercent })
    tx.update(ref, {
      items, total: subtotal, paymentMethod: method, payAtCounter: false,
      tipAmount: totals.tip, grandTotal: totals.total, priceSource: 'server', updatedAt: now,
    })
    return {
      status: 'online' as const, grandTotal: totals.total, method,
      tableNumber: Number(order.tableNumber), restaurantName: String(settingsSnap.get('restaurantName') ?? 'Restaurant'),
    }
  })

  if (result.status !== 'online') return result
  // Talk to the provider outside the transaction (network calls must not be retried by it)
  try {
    const { checkoutUrl, practice } = await startOnlinePayment(db, {
      orderId, tableNumber: result.tableNumber, amount: result.grandTotal,
      method: result.method, origin, restaurantName: result.restaurantName,
    })
    return { status: 'redirect' as const, grandTotal: result.grandTotal, checkoutUrl, practice }
  } catch (e) {
    console.error('[payCustomerOrder] provider error', e)
    throw new OrderError('Online payment isn’t available right now. Please try again, or choose Cash and pay at the counter.', 502)
  }
}

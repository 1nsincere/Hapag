'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  listenToOrder, listenToSettings, listenToMenu, processPaymentAndActivateOrder,
  Order, AppSettings, DEFAULT_SETTINGS, MenuItem, CartItem,
} from '@/lib/data'
import {
  peso, pad2, shortId, DishImage, Sheet, SheetHeader, Stepper, TopBar, LoadingScreen, MessageScreen,
} from '@/app/components/customer/ui'

type PaymentMethod = 'qrph' | 'card' | 'cash'

const PAYMENT_METHODS: { key: PaymentMethod; label: string; description: string; icon: string }[] = [
  { key: 'qrph', label: 'QR Ph', description: 'Scan with GCash, Maya or your banking app.', icon: 'qr_code_scanner' },
  { key: 'card', label: 'Debit / credit card', description: 'Visa, Mastercard and more.', icon: 'credit_card' },
  { key: 'cash', label: 'Cash', description: 'Pay at the counter — your order starts once paid.', icon: 'payments' },
]
const methodLabel = (m: PaymentMethod) => PAYMENT_METHODS.find(p => p.key === m)?.label ?? m
const methodIcon = (m: PaymentMethod) => PAYMENT_METHODS.find(p => p.key === m)?.icon ?? 'payments'

const TIP_OPTIONS = [0, 5, 10, 15]

export default function CheckoutPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.orderId as string

  const [order, setOrder] = useState<Order | null>(null)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [tipPercent, setTipPercent] = useState<number>(0)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('qrph')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [orderItems, setOrderItems] = useState<CartItem[]>([])
  const [cartExpiry, setCartExpiry] = useState<number | null>(null)
  const [cartRestored, setCartRestored] = useState(false)
  const [payError, setPayError] = useState('')

  // Remove confirmation dialog state
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null)
  // Pre-payment summary sheet
  const [showSummaryModal, setShowSummaryModal] = useState(false)

  // ─── Cart persistence (5-minute window, per table) ─────────────────────────
  const saveCartToStorage = useCallback((items: CartItem[], tableNumber: number) => {
    try {
      localStorage.setItem(`cart_${tableNumber}`, JSON.stringify({ items, tableNumber, timestamp: Date.now(), orderId }))
      setCartExpiry(Date.now() + 5 * 60 * 1000)
    } catch { /* storage unavailable — non-critical */ }
  }, [orderId])

  const loadCartFromStorage = useCallback((tableNumber: number) => {
    try {
      const stored = localStorage.getItem(`cart_${tableNumber}`)
      if (stored) {
        const cartData = JSON.parse(stored)
        const age = Date.now() - cartData.timestamp
        if (age < 5 * 60 * 1000 && cartData.orderId === orderId) {
          setOrderItems(cartData.items)
          setCartExpiry(cartData.timestamp + 5 * 60 * 1000)
          setCartRestored(true)
          setTimeout(() => setCartRestored(false), 3000)
          return true
        }
        localStorage.removeItem(`cart_${tableNumber}`)
      }
    } catch (error) {
      console.error('Error loading cart from storage:', error)
    }
    return false
  }, [orderId])

  // Initialise items: restore the guest's edits if recent, otherwise use the order
  useEffect(() => {
    if (order?.tableNumber) {
      const loaded = loadCartFromStorage(order.tableNumber)
      if (!loaded && order.items) setOrderItems(order.items)
    }
  }, [order?.tableNumber, order?.items, loadCartFromStorage])

  useEffect(() => {
    if (order?.tableNumber && orderItems.length > 0) saveCartToStorage(orderItems, order.tableNumber)
  }, [orderItems, order?.tableNumber, saveCartToStorage])

  useEffect(() => {
    if (!cartExpiry) return
    const timeout = setTimeout(() => {
      if (order?.tableNumber) {
        try { localStorage.removeItem(`cart_${order.tableNumber}`) } catch { /* non-critical */ }
        setCartExpiry(null)
      }
    }, Math.max(0, cartExpiry - Date.now()))
    return () => clearTimeout(timeout)
  }, [cartExpiry, order?.tableNumber])

  useEffect(() => {
    const unsubSettings = listenToSettings(setSettings)
    const unsubMenu = listenToMenu(setMenuItems)
    // Items are initialised by the effect above, so a live status change
    // (e.g. cashier confirming) never wipes the guest's quantity edits.
    const unsubOrder = listenToOrder(orderId, data => { setOrder(data); setIsLoading(false) })
    return () => { unsubSettings(); unsubMenu(); unsubOrder() }
  }, [orderId])

  if (isLoading) return <LoadingScreen label="Preparing checkout" />
  if (!order) {
    return (
      <MessageScreen
        icon="receipt_long"
        title="Order not found"
        body="This order can only be opened on the phone that placed it. Please ask a member of staff for help."
        action={<Link href="/" className="hp-btn hp-btn-ghost">Return home</Link>}
      />
    )
  }

  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const taxRate = parseFloat(settings.taxRate) || 0
  const tax = subtotal * (taxRate / 100)
  const serviceFee = parseFloat(settings.serviceFee) || 0
  const tipAmount = (subtotal * tipPercent) / 100
  const grandTotal = subtotal + tax + serviceFee + tipAmount
  const itemCount = orderItems.reduce((s, i) => s + i.quantity, 0)

  const isPaid = order.paymentStatus === 'paid'
  const canPay = !isPaid && order.status === 'accepted' && orderItems.length > 0

  const addItem = (itemId: string) => {
    setOrderItems(prev => prev.map(item => item.id === itemId ? { ...item, quantity: item.quantity + 1 } : item))
  }

  // Removing the last unit asks for confirmation first
  const requestRemove = (itemId: string, itemName: string) => {
    if (orderItems.find(i => i.id === itemId)?.quantity === 1) {
      setRemoveTarget({ id: itemId, name: itemName })
    } else {
      setOrderItems(prev => prev.map(item =>
        item.id === itemId && item.quantity > 1 ? { ...item, quantity: item.quantity - 1 } : item
      ))
    }
  }

  const confirmRemove = () => {
    if (!removeTarget) return
    setOrderItems(prev => prev.filter(item => item.id !== removeTarget.id))
    setRemoveTarget(null)
  }

  const addFromMenu = (item: MenuItem) => {
    const existing = orderItems.find(oi => oi.baseId === item.id || oi.id === item.id)
    if (existing) {
      addItem(existing.id)
    } else {
      setOrderItems(prev => [...prev, {
        id: `${item.id}_${prev.length}_${item.price}`,
        baseId: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        image: item.image,
      }])
    }
  }

  const handlePay = async () => {
    setPayError('')
    if (isPaid) { router.push(`/confirmation/${orderId}`); return }
    if (order.status !== 'accepted') {
      setShowSummaryModal(false)
      setPayError('Your order is still waiting for the restaurant to confirm it. Please try again in a moment.')
      return
    }
    if (orderItems.length === 0) {
      setShowSummaryModal(false)
      setPayError('Your order has no items.')
      return
    }
    setIsProcessing(true)
    try {
      // Simulated payment — replace with a real gateway in production
      await new Promise(r => setTimeout(r, 1500))

      // Mark paid + persist final items + send to the kitchen (table stays occupied)
      await processPaymentAndActivateOrder(orderId, paymentMethod, tipAmount, grandTotal, { items: orderItems, total: subtotal })

      try { sessionStorage.removeItem(`tableId_${orderId}`) } catch { /* non-critical */ }
      router.push(`/confirmation/${orderId}`)
    } catch {
      setIsProcessing(false)
      setShowSummaryModal(false)
      setPayError('Payment didn’t go through. Please try again.')
    }
  }

  const addOns = menuItems.filter(i => i.available).slice(0, 8)
  // Uploaded photos live on the menu item, not on the order
  const photoFor = (item: CartItem) =>
    item.image || menuItems.find(m => m.id === (item.baseId ?? item.id.split('::')[0]))?.image || ''

  return (
    <div className="hp">
      <TopBar
        title="Checkout"
        subtitle={`${settings.restaurantName} · Table ${pad2(order.tableNumber)} · #${shortId(order.id)}`}
        left={
          <button type="button" className="hp-icon-btn" onClick={() => router.push(`/status/${order.id}`)} aria-label="Back">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
        }
      />

      <main className="hp-container hp-stack" style={{ paddingBottom: 150 }}>
        {cartRestored && (
          <div className="hp-notice hp-notice-success" role="status">
            <span className="material-symbols-outlined">history</span>
            We kept the changes you made to your order.
          </div>
        )}
        {isPaid ? (
          <div className="hp-notice hp-notice-success">
            <span className="material-symbols-outlined">verified</span>
            <span>This order is already paid. <Link href={`/confirmation/${order.id}`}>View receipt</Link></span>
          </div>
        ) : order.status === 'pending' ? (
          <div className="hp-notice" role="status">
            <span className="material-symbols-outlined">hourglass_top</span>
            The restaurant is confirming your order. You can pay as soon as it&apos;s confirmed — this page updates on its own.
          </div>
        ) : null}
        {payError && (
          <div className="hp-notice hp-notice-danger" role="alert">
            <span className="material-symbols-outlined">error</span>
            {payError}
          </div>
        )}

        {/* Order */}
        <section className="hp-card hp-card-pad">
          <div className="hp-card-head">
            <h2 className="hp-title-sm">Your order</h2>
            <span className="hp-label">{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
          </div>
          {orderItems.map(item => (
            <div key={item.id} className="hp-line">
              <DishImage src={photoFor(item)} alt={item.name} />
              <div className="hp-line-main">
                <p className="hp-line-name">{item.name}</p>
                <p className="hp-line-sub hp-num">
                  {item.variantName ? `${item.variantName} · ` : ''}{peso(item.price * item.quantity)}
                </p>
                {item.notes && <p className="hp-line-sub" style={{ fontStyle: 'italic' }}>&ldquo;{item.notes}&rdquo;</p>}
              </div>
              <Stepper
                small
                value={item.quantity}
                label={item.name}
                onDecrement={() => requestRemove(item.id, item.name)}
                onIncrement={() => addItem(item.id)}
              />
            </div>
          ))}
        </section>

        {/* Add-ons */}
        {!isPaid && addOns.length > 0 && (
          <section>
            <div className="hp-card-head" style={{ padding: '6px 2px 4px' }}>
              <h2 className="hp-title-sm">Something <em style={{ fontStyle: 'italic', color: 'var(--hp-accent-text)' }}>more?</em></h2>
            </div>
            <div className="hp-scroller">
              {addOns.map(item => (
                <div key={item.id} className="hp-addon">
                  <DishImage src={item.image} alt={item.name} />
                  <p className="hp-addon-name">{item.name}</p>
                  <div className="hp-addon-foot">
                    <span className="hp-price" style={{ fontSize: '0.8125rem' }}>{peso(item.price)}</span>
                    <button type="button" className="hp-addon-add" onClick={() => addFromMenu(item)} aria-label={`Add ${item.name}`}>
                      <span className="material-symbols-outlined">add</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Tip */}
        <section className="hp-card hp-card-pad">
          <div className="hp-card-head">
            <h2 className="hp-title-sm">Tip the team</h2>
            <span className="hp-label">Optional</span>
          </div>
          <div className="hp-segment" role="radiogroup" aria-label="Tip amount">
            {TIP_OPTIONS.map(pct => (
              <button
                key={pct}
                type="button"
                role="radio"
                aria-checked={tipPercent === pct}
                className={tipPercent === pct ? 'is-selected' : ''}
                onClick={() => setTipPercent(pct)}
              >
                {pct === 0 ? 'None' : `${pct}%`}
                <small>{pct === 0 ? '—' : peso((subtotal * pct) / 100)}</small>
              </button>
            ))}
          </div>
        </section>

        {/* Payment */}
        <section className="hp-card hp-card-pad">
          <div className="hp-card-head" style={{ marginBottom: 14 }}>
            <h2 className="hp-title-sm">Payment method</h2>
          </div>
          <div role="radiogroup" aria-label="Payment method">
            {PAYMENT_METHODS.map(method => (
              <button
                key={method.key}
                type="button"
                role="radio"
                aria-checked={paymentMethod === method.key}
                className={`hp-option${paymentMethod === method.key ? ' is-selected' : ''}`}
                onClick={() => setPaymentMethod(method.key)}
              >
                <span className="hp-option-icon"><span className="material-symbols-outlined">{method.icon}</span></span>
                <span className="hp-option-main">
                  <span className="hp-option-title">{method.label}</span>
                  <span className="hp-option-sub">{method.description}</span>
                </span>
                <span className="hp-radio" />
              </button>
            ))}
          </div>
        </section>

        {/* Totals */}
        <section className="hp-card hp-card-pad">
          <div className="hp-totals">
            <div className="hp-total-row"><span>Subtotal</span><span>{peso(subtotal)}</span></div>
            {tax > 0 && <div className="hp-total-row"><span>Tax ({settings.taxRate}%)</span><span>{peso(tax)}</span></div>}
            {serviceFee > 0 && <div className="hp-total-row"><span>Service fee</span><span>{peso(serviceFee)}</span></div>}
            {tipAmount > 0 && <div className="hp-total-row"><span>Tip ({tipPercent}%)</span><span>{peso(tipAmount)}</span></div>}
            <div className="hp-total-row hp-total-grand"><span>Total</span><span>{peso(grandTotal)}</span></div>
          </div>
        </section>

        <p className="hp-fineprint">
          <span className="material-symbols-outlined">lock</span>
          Your order goes to the kitchen once payment is confirmed.
        </p>
      </main>

      {/* Pay bar */}
      <div className="hp-actionbar">
        <div className="hp-actionbar-inner">
          <button
            type="button"
            className="hp-btn hp-btn-primary hp-btn-lg hp-btn-block hp-btn-split"
            onClick={() => { setPayError(''); setShowSummaryModal(true) }}
            disabled={isProcessing || !canPay}
          >
            {isProcessing ? (
              <span className="hp-row" style={{ margin: '0 auto' }}>
                <span className="material-symbols-outlined hp-spin">progress_activity</span>Processing…
              </span>
            ) : isPaid ? (
              <span style={{ margin: '0 auto' }}>Paid</span>
            ) : order.status !== 'accepted' ? (
              <span className="hp-row" style={{ margin: '0 auto' }}>
                <span className="material-symbols-outlined">hourglass_top</span>Awaiting confirmation
              </span>
            ) : (
              <><span>Pay · {methodLabel(paymentMethod)}</span><span className="hp-num">{peso(grandTotal)}</span></>
            )}
          </button>
        </div>
      </div>

      {/* Remove confirmation */}
      <Sheet open={!!removeTarget} onClose={() => setRemoveTarget(null)} label="Remove item">
        <SheetHeader title="Remove item?" onClose={() => setRemoveTarget(null)} />
        <div className="hp-sheet-body">
          <p className="hp-muted">
            <span style={{ color: 'var(--hp-text)', fontWeight: 600 }}>{removeTarget?.name}</span> will be removed from your order.
          </p>
        </div>
        <div className="hp-sheet-foot hp-sheet-foot-row">
          <button type="button" className="hp-btn hp-btn-ghost" style={{ flex: 1 }} onClick={() => setRemoveTarget(null)}>Keep it</button>
          <button type="button" className="hp-btn hp-btn-danger" style={{ flex: 1 }} onClick={confirmRemove}>Remove</button>
        </div>
      </Sheet>

      {/* Final review */}
      <Sheet open={showSummaryModal} onClose={() => setShowSummaryModal(false)} dismissible={!isProcessing} label="Confirm payment">
        <SheetHeader
          eyebrow="Final review"
          title={<>Confirm &amp; <em>pay</em></>}
          onClose={isProcessing ? undefined : () => setShowSummaryModal(false)}
        />
        <div className="hp-sheet-body">
          {orderItems.map(item => (
            <div key={item.id} className="hp-line hp-line-compact">
              <span className="hp-qty-chip">{item.quantity}×</span>
              <div className="hp-line-main"><p className="hp-line-name">{item.name}</p></div>
              <span className="hp-line-price">{peso(item.price * item.quantity)}</span>
            </div>
          ))}
          <div className="hp-totals" style={{ marginTop: 18 }}>
            <div className="hp-total-row"><span>Subtotal</span><span>{peso(subtotal)}</span></div>
            {tax > 0 && <div className="hp-total-row"><span>Tax ({settings.taxRate}%)</span><span>{peso(tax)}</span></div>}
            {serviceFee > 0 && <div className="hp-total-row"><span>Service fee</span><span>{peso(serviceFee)}</span></div>}
            {tipAmount > 0 && <div className="hp-total-row"><span>Tip ({tipPercent}%)</span><span>{peso(tipAmount)}</span></div>}
            <div className="hp-total-row hp-total-grand"><span>Total</span><span>{peso(grandTotal)}</span></div>
          </div>
          <div className="hp-option is-selected" style={{ marginTop: 18, cursor: 'default' }}>
            <span className="hp-option-icon"><span className="material-symbols-outlined">{methodIcon(paymentMethod)}</span></span>
            <span className="hp-option-main">
              <span className="hp-option-sub">Paying with</span>
              <span className="hp-option-title">{methodLabel(paymentMethod)}</span>
            </span>
          </div>
        </div>
        <div className="hp-sheet-foot">
          <button type="button" className="hp-btn hp-btn-primary hp-btn-lg hp-btn-block hp-btn-split" onClick={handlePay} disabled={isProcessing}>
            {isProcessing ? (
              <span className="hp-row" style={{ margin: '0 auto' }}>
                <span className="material-symbols-outlined hp-spin">progress_activity</span>Processing payment…
              </span>
            ) : (
              <><span>Confirm &amp; pay</span><span className="hp-num">{peso(grandTotal)}</span></>
            )}
          </button>
          <p className="hp-fineprint">By confirming, you agree to the charges above.</p>
        </div>
      </Sheet>
    </div>
  )
}

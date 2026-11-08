'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { listenToOrder, Order } from '@/lib/data'
import {
  peso, pad2, shortId, delay, TopBar, LoadingScreen, MessageScreen, PoweredBy,
} from '@/app/components/customer/ui'

const METHOD_LABEL: Record<string, string> = { qrph: 'QR Ph', card: 'Card', cash: 'Cash' }

export default function ConfirmationPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.orderId as string
  const [order, setOrder] = useState<Order | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!orderId) return
    return listenToOrder(orderId, data => { setOrder(data); setLoaded(true) })
  }, [orderId])

  if (!loaded) return <LoadingScreen label="Loading receipt" />
  if (!order) {
    return (
      <MessageScreen
        icon="receipt_long"
        title="Receipt not found"
        action={<Link href="/" className="hp-btn hp-btn-ghost">Return home</Link>}
      />
    )
  }

  const isPaid = order.paymentStatus === 'paid'
  // Back from the payment page; the provider's confirmation usually lands within seconds
  if (!isPaid && order.paymentSessionId && !order.payAtCounter && !order.paymentIssue) {
    return (
      <MessageScreen
        icon="hourglass_top"
        title="Confirming your payment"
        body="This usually takes a few seconds. Please keep this page open — it updates by itself."
        action={<Link href={`/checkout/${order.id}`} className="hp-btn hp-btn-ghost">Back to checkout</Link>}
      />
    )
  }
  const tip = order.tipAmount ?? 0
  const totalPaid = order.grandTotal ?? order.total
  const extras = Math.max(0, totalPaid - order.total - tip) // tax + service fee

  return (
    <div className="hp">
      <TopBar
        title="Receipt"
        subtitle={`Table ${pad2(order.tableNumber)}`}
        left={
          <button type="button" className="hp-icon-btn" onClick={() => router.push(`/menu/${order.tableNumber}`)} aria-label="Back to menu">
            <span className="material-symbols-outlined">close</span>
          </button>
        }
      />

      <main className="hp-container hp-stack" style={{ paddingBottom: 48 }}>
        <section className="hp-status-hero">
          <div className="hp-orb hp-fade-up"><span className="material-symbols-outlined">done_all</span></div>
          <p className="hp-eyebrow hp-fade-up" style={delay(80)}>{isPaid ? 'Payment received' : 'Order placed'}</p>
          <h1 className="hp-display hp-fade-up" style={delay(140)}>Salamat<em>.</em></h1>
          <p className="hp-muted hp-fade-up" style={{ ...delay(200), maxWidth: 340 }}>
            {isPaid
              ? `Your order is with the kitchen. We'll bring it to Table ${order.tableNumber}.`
              : 'We’ve received your order.'}
          </p>
        </section>

        <section className="hp-receipt hp-fade-up" style={delay(260)}>
          <dl className="hp-receipt-meta">
            <div><dt className="hp-label">Order no.</dt><dd>#{shortId(order.id)}</dd></div>
            <div><dt className="hp-label">Table</dt><dd>{pad2(order.tableNumber)}</dd></div>
            <div><dt className="hp-label">Paid with</dt><dd>{order.paymentMethod ? METHOD_LABEL[order.paymentMethod] : '—'}</dd></div>
            <div><dt className="hp-label">Est. time</dt><dd>15–20 min</dd></div>
          </dl>
          <div className="hp-receipt-tear" aria-hidden="true" />
          <div className="hp-receipt-body">
            {order.items.map(item => (
              <div key={item.id} className="hp-line hp-line-compact">
                <span className="hp-qty-chip">{item.quantity}×</span>
                <div className="hp-line-main">
                  <p className="hp-line-name">{item.name}</p>
                  {item.variantName && <p className="hp-line-sub">{item.variantName}</p>}
                </div>
                <span className="hp-line-price">{peso(item.price * item.quantity)}</span>
              </div>
            ))}
            {order.specialInstructions && <p className="hp-note">&ldquo;{order.specialInstructions}&rdquo;</p>}
            <div className="hp-totals" style={{ marginTop: 18 }}>
              <div className="hp-total-row"><span>Subtotal</span><span>{peso(order.total)}</span></div>
              {extras > 0.009 && <div className="hp-total-row"><span>Tax &amp; service</span><span>{peso(extras)}</span></div>}
              {tip > 0 && <div className="hp-total-row"><span>Tip</span><span>{peso(tip)}</span></div>}
              <div className="hp-total-row hp-total-grand">
                <span>{isPaid ? 'Total paid' : 'Total'}</span>
                <span>{peso(totalPaid)}</span>
              </div>
            </div>
          </div>
        </section>

        <Link href={`/status/${order.id}`} className="hp-btn hp-btn-primary hp-btn-lg hp-btn-block">
          Track my order
          <span className="material-symbols-outlined">arrow_forward</span>
        </Link>
        <Link href={`/menu/${order.tableNumber}`} className="hp-btn hp-btn-ghost hp-btn-block">
          Order something more
        </Link>

        <PoweredBy />
      </main>
    </div>
  )
}

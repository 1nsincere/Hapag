'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { listenToOrder, listenToMenu, createServiceRequest, Order, OrderStatus, MenuItem, CartItem } from '@/lib/data'
import {
  peso, pad2, shortId, delay, DishImage, TopBar, BottomNav, LoadingScreen, MessageScreen,
} from '@/app/components/customer/ui'

const STEPS: { key: OrderStatus; title: string; headline: string; desc: string; icon: string }[] = [
  { key: 'pending',     title: 'Order sent',          headline: 'Order sent',        icon: 'send',                  desc: 'The restaurant is reviewing your order.' },
  { key: 'accepted',    title: 'Confirmed',           headline: 'Ready for payment', icon: 'task_alt',              desc: 'Your order is confirmed. Pay now and it goes straight to the kitchen.' },
  { key: 'preparing',   title: 'Paid · in the queue', headline: 'In the kitchen',    icon: 'receipt_long',          desc: 'Payment received. The kitchen has your order.' },
  { key: 'in-progress', title: 'Being prepared',      headline: 'Being prepared',    icon: 'local_fire_department', desc: 'The chefs are cooking your meal right now.' },
  { key: 'ready',       title: 'Ready',               headline: 'Almost at your table', icon: 'room_service',       desc: 'Your order is ready and on its way to you.' },
  { key: 'served',      title: 'Served',              headline: 'Enjoy your meal',   icon: 'restaurant',            desc: 'Everything has been served. Masarap na kainan!' },
]

const stepIndex = (status: OrderStatus) => Math.max(0, STEPS.findIndex(s => s.key === status))

export default function StatusPage() {
  const params = useParams()
  const orderId = params.orderId as string
  const [order, setOrder] = useState<Order | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [menu, setMenu] = useState<MenuItem[]>([])
  useEffect(() => listenToMenu(setMenu), [])
  // Uploaded photos live on the menu item, not on the order
  const photoFor = (item: CartItem) =>
    item.image || menu.find(m => m.id === (item.baseId ?? item.id.split('::')[0]))?.image || ''
  const [callState, setCallState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  // Sends a real "Call staff" request to the cashier screen (cooldown: 30s)
  const callStaff = async (tableNumber: number) => {
    if (callState === 'sending' || callState === 'sent') return
    setCallState('sending')
    try {
      await createServiceRequest(tableNumber)
      setCallState('sent')
      setTimeout(() => setCallState('idle'), 30_000)
    } catch {
      setCallState('error')
      setTimeout(() => setCallState('idle'), 4000)
    }
  }

  useEffect(() => {
    if (!orderId) return
    return listenToOrder(orderId, data => { setOrder(data); setLoaded(true) })
  }, [orderId])

  if (!loaded) return <LoadingScreen label="Finding your order" />
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

  const current = stepIndex(order.status)
  const step = STEPS[current]
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0)
  const isPaid = order.paymentStatus === 'paid'

  return (
    <div className="hp">
      <TopBar
        title="Your order"
        subtitle={`Table ${pad2(order.tableNumber)} · #${shortId(order.id)}`}
        left={
          <Link href={`/menu/${order.tableNumber}`} className="hp-icon-btn" aria-label="Back to menu">
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
        }
        right={<span className="hp-live"><i />Live</span>}
      />

      <main className="hp-container hp-stack" style={{ paddingBottom: 120 }}>
        {/* Hero */}
        <section className="hp-status-hero" aria-live="polite">
          <div className="hp-orb hp-fade-up"><span className="material-symbols-outlined">{step.icon}</span></div>
          <p className="hp-eyebrow hp-fade-up" style={delay(80)}>Step {current + 1} of {STEPS.length}</p>
          <h1 className="hp-display hp-display-sm hp-fade-up" style={delay(140)}>{step.headline}</h1>
          <p className="hp-muted hp-fade-up" style={{ ...delay(200), maxWidth: 360 }}>{step.desc}</p>
          {order.status === 'accepted' && (
            <Link href={`/checkout/${order.id}`} className="hp-btn hp-btn-primary hp-btn-lg hp-fade-up" style={delay(260)}>
              Pay now
              <span className="material-symbols-outlined">arrow_forward</span>
            </Link>
          )}
        </section>

        {/* Timeline */}
        <section className="hp-card hp-card-pad" aria-label="Order progress">
          <ol className="hp-timeline">
            {STEPS.map((s, idx) => {
              const state = idx < current ? ' is-done' : idx === current ? ' is-current' : ''
              return (
                <li key={s.key} className={`hp-step${state}`}>
                  <span className="hp-step-dot">
                    <span className="material-symbols-outlined">{idx < current ? 'check' : s.icon}</span>
                  </span>
                  <div>
                    <p className="hp-step-title">{s.title}</p>
                    {idx === current && <p className="hp-step-desc">{s.desc}</p>}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>

        {/* Items */}
        <section className="hp-card hp-card-pad">
          <div className="hp-card-head">
            <h2 className="hp-title-sm">Your items</h2>
            <span className="hp-label">{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
          </div>
          <div>
            {order.items.map(item => (
              <div key={item.id} className="hp-line">
                <DishImage src={photoFor(item)} alt={item.name} />
                <div className="hp-line-main">
                  <p className="hp-line-name">{item.name}</p>
                  <p className="hp-line-sub">{item.quantity} × {peso(item.price)}{item.variantName ? ` · ${item.variantName}` : ''}</p>
                </div>
                <span className="hp-line-price">{peso(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
          {order.specialInstructions && <p className="hp-note">&ldquo;{order.specialInstructions}&rdquo;</p>}
          <div className="hp-totals" style={{ marginTop: 16 }}>
            <div className="hp-total-row hp-total-grand">
              <span>{isPaid ? 'Paid' : 'Subtotal'}</span>
              <span>{peso(isPaid ? (order.grandTotal ?? order.total) : order.total)}</span>
            </div>
          </div>
        </section>

        <button
          type="button"
          onClick={() => callStaff(order.tableNumber)}
          disabled={callState === 'sending' || callState === 'sent'}
          className="hp-btn hp-btn-ghost hp-btn-block"
          aria-live="polite"
        >
          <span className={`material-symbols-outlined${callState === 'sending' ? ' hp-spin' : ''}`}>
            {callState === 'sent' ? 'check_circle' : callState === 'sending' ? 'progress_activity' : callState === 'error' ? 'error' : 'notifications'}
          </span>
          {callState === 'sent' ? 'Staff notified — someone is coming'
            : callState === 'sending' ? 'Calling…'
            : callState === 'error' ? 'Couldn’t reach staff — try again'
            : 'Call staff'}
        </button>

        {isPaid && (
          <Link href={`/confirmation/${order.id}`} className="hp-btn hp-btn-quiet hp-btn-block">
            View receipt
          </Link>
        )}
      </main>

      <BottomNav tableNumber={order.tableNumber} active="status" orderId={order.id} />
    </div>
  )
}

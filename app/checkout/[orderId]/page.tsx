'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { listenToOrder, listenToSettings, Order, AppSettings, DEFAULT_SETTINGS, listenToMenu, MenuItem, processPaymentAndActivateOrder, getTables } from '@/lib/data'

export default function CheckoutPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.orderId as string

  const [order, setOrder] = useState<Order | null>(null)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [tipPercent, setTipPercent] = useState<number>(18)
  const [paymentMethod, setPaymentMethod] = useState<'qrph' | 'card' | 'cash'>('qrph')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [orderItems, setOrderItems] = useState<any[]>([])
  const [cartExpiry, setCartExpiry] = useState<number | null>(null)
  const [cartRestored, setCartRestored] = useState(false)

  // Remove confirmation dialog state
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null)

  // Pre-payment summary modal state
  const [showSummaryModal, setShowSummaryModal] = useState(false)

  // Cart persistence - save to localStorage
  const saveCartToStorage = useCallback((items: any[], tableNumber: number) => {
    const cartData = {
      items,
      tableNumber,
      timestamp: Date.now(),
      orderId
    }
    localStorage.setItem(`cart_${tableNumber}`, JSON.stringify(cartData))
    setCartExpiry(Date.now() + 5 * 60 * 1000) // 5 minutes
  }, [orderId])

  // Load cart from localStorage
  const loadCartFromStorage = useCallback((tableNumber: number) => {
    try {
      const stored = localStorage.getItem(`cart_${tableNumber}`)
      if (stored) {
        const cartData = JSON.parse(stored)
        const age = Date.now() - cartData.timestamp
        if (age < 5 * 60 * 1000 && cartData.orderId === orderId) { // 5 minutes
          setOrderItems(cartData.items)
          setCartExpiry(cartData.timestamp + 5 * 60 * 1000)
          setCartRestored(true)
          // Auto-hide the restored message after 3 seconds
          setTimeout(() => setCartRestored(false), 3000)
          return true
        } else {
          // Expired cart, remove it
          localStorage.removeItem(`cart_${tableNumber}`)
        }
      }
    } catch (error) {
      console.error('Error loading cart from storage:', error)
    }
    return false
  }, [orderId])

  // Clear expired carts on component mount
  useEffect(() => {
    if (order?.tableNumber) {
      // Try to load existing cart first
      const loaded = loadCartFromStorage(order.tableNumber)
      if (!loaded && order.items) {
        // If no stored cart, use order items
        setOrderItems(order.items)
      }
    }
  }, [order?.tableNumber, order?.items, loadCartFromStorage])

  // Save cart whenever it changes
  useEffect(() => {
    if (order?.tableNumber && orderItems.length > 0) {
      saveCartToStorage(orderItems, order.tableNumber)
    }
  }, [orderItems, order?.tableNumber, saveCartToStorage])

  // Auto-clear expired cart
  useEffect(() => {
    if (cartExpiry) {
      const timeout = setTimeout(() => {
        if (order?.tableNumber) {
          localStorage.removeItem(`cart_${order.tableNumber}`)
          setCartExpiry(null)
        }
      }, Math.max(0, cartExpiry - Date.now()))
      return () => clearTimeout(timeout)
    }
  }, [cartExpiry, order?.tableNumber])

  useEffect(() => {
    const unsubSettings = listenToSettings(setSettings)
    const unsubMenu = listenToMenu(setMenuItems)
    const unsubOrder = listenToOrder(orderId, (data) => {
      setOrder(data)
      if (data) {
        setOrderItems(data.items)
      }
      setIsLoading(false)
    })

    return () => {
      unsubSettings()
      unsubMenu()
      unsubOrder()
    }
  }, [orderId])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#faf9f7] flex flex-col items-center justify-center p-6 text-center">
        <span className="material-symbols-outlined animate-spin text-primary text-5xl mb-4">progress_activity</span>
        <p className="text-zinc-400 text-sm font-medium">Loading your order…</p>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#faf9f7] flex flex-col items-center justify-center p-6 text-center">
        <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">error</span>
        <h1 className="text-xl font-bold mb-2">Order Not Found</h1>
        <Link href="/" className="text-primary font-bold">Return Home</Link>
      </div>
    )
  }

  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const taxRate = parseFloat(settings.taxRate) || 0
  const tax = subtotal * (taxRate / 100)
  const serviceFee = parseFloat(settings.serviceFee) || 0
  const tipAmount = (subtotal * tipPercent) / 100
  const grandTotal = subtotal + tax + serviceFee + tipAmount

  const addItem = (itemId: string) => {
    setOrderItems(prev =>
      prev.map(item =>
        item.id === itemId
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    )
  }

  // Instead of removing immediately, show confirm dialog
  const requestRemove = (itemId: string, itemName: string) => {
    if (orderItems.find(i => i.id === itemId)?.quantity === 1) {
      setRemoveTarget({ id: itemId, name: itemName })
    } else {
      setOrderItems(prev =>
        prev.map(item =>
          item.id === itemId && item.quantity > 1
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
      )
    }
  }

  const confirmRemove = () => {
    if (!removeTarget) return
    setOrderItems(prev => prev.filter(item => item.id !== removeTarget.id))
    setRemoveTarget(null)
  }

  const handlePay = async () => {
    setShowSummaryModal(false)
    if (order.paymentStatus === 'paid') {
      router.push(`/confirmation/${orderId}`)
      return
    }
    if (order.status !== 'accepted') {
      alert('Your order is still waiting for the cashier to accept it. Please try again in a moment.')
      return
    }
    if (orderItems.length === 0) {
      alert('Your order has no items.')
      return
    }
    setIsProcessing(true)
    try {
      // Simulate payment processing (replace with real gateway in production)
      await new Promise(r => setTimeout(r, 1500))

      // Look up the tableId stored when the order was created
      let tableId: string | undefined
      try {
        tableId = sessionStorage.getItem(`tableId_${orderId}`) ?? undefined
      } catch (_) {}

      // If not in sessionStorage, look it up from Firestore
      if (!tableId && order?.tableNumber) {
        const tables = await getTables()
        tableId = tables.find(t => t.tableNumber === order.tableNumber)?.id
      }

      // Atomically: mark payment paid + push order to kitchen + mark table occupied
      await processPaymentAndActivateOrder(
        orderId,
        paymentMethod,
        tipAmount,
        grandTotal,
        tableId,
        { items: orderItems, total: subtotal }
      )

      // Clean up session storage
      try { sessionStorage.removeItem(`tableId_${orderId}`) } catch (_) {}

      router.push(`/confirmation/${orderId}`)
    } catch {
      setIsProcessing(false)
      alert('Payment failed. Please try again.')
    }
  }

  const paymentMethodLabel = {
    qrph: 'QR PH',
    card: 'Debit / Credit Card',
    cash: 'Cash',
  }

  const paymentMethodIcon = {
    qrph: 'qr_code_scanner',
    card: 'credit_card',
    cash: 'payments',
  }

  return (
    <>
      <style jsx global>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.96); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .slide-up { animation: slideUp 0.32s cubic-bezier(0.34, 1.2, 0.64, 1) forwards; }
        .fade-in { animation: fadeIn 0.2s ease forwards; }
        .scale-in { animation: scaleIn 0.25s cubic-bezier(0.34, 1.2, 0.64, 1) forwards; }
        .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
        .item-row { transition: all 0.2s ease; }
        .item-row:hover { background: #fafafa; border-radius: 12px; }
        .qty-btn { transition: transform 0.1s ease, background 0.15s ease; }
        .qty-btn:active { transform: scale(0.88); }
      `}</style>

      <div className="bg-[#faf9f7] text-on-background min-h-screen pb-40">
        {/* Header */}
        <header className="bg-white/95 backdrop-blur-md border-b border-stone-100 shadow-sm sticky top-0 z-50 flex items-center justify-between px-4 h-16 w-full">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(`/menu/${order.tableNumber}`)}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-stone-100 active:scale-95 transition-all duration-150"
            >
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 22 }}>arrow_back</span>
            </button>
            <h1 className="font-['Plus_Jakarta_Sans'] text-lg font-bold text-zinc-900">Checkout</h1>
          </div>
          <div className="text-base font-black text-stone-900 tracking-tight">{settings.restaurantName}</div>
        </header>

        {/* Cart restored notification */}
        {cartRestored && (
          <div className="mx-4 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm animate-fade-in">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Cart restored from previous session
            </div>
          </div>
        )}

        <main className="max-w-xl mx-auto px-4 mt-4 space-y-4 pb-4">

          {/* Order Summary */}
          <section className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-zinc-900">Order Summary</h2>
              <span className="text-xs font-semibold text-zinc-400 bg-zinc-100 px-2.5 py-1 rounded-full">
                {orderItems.reduce((s, i) => s + i.quantity, 0)} item{orderItems.reduce((s, i) => s + i.quantity, 0) !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="space-y-1">
              {orderItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="item-row flex items-center gap-3 px-2 py-2.5"
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-100 shadow-sm">
                    {item.image ? (
                      <img alt={item.name} className="w-full h-full object-cover" src={item.image} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-300">
                        <span className="material-symbols-outlined text-xl">restaurant</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-grow min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="font-semibold text-zinc-900 text-sm truncate">{item.name}</h3>
                      <span className="font-bold text-primary text-sm flex-shrink-0">
                        ₱{(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                    {item.notes && (
                      <p className="text-zinc-400 text-xs mt-0.5 truncate italic">&ldquo;{item.notes}&rdquo;</p>
                    )}
                    <p className="text-zinc-400 text-xs mt-0.5">₱{item.price.toFixed(2)} each</p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => requestRemove(item.id, item.name)}
                      className="qty-btn w-7 h-7 rounded-full bg-red-50 hover:bg-red-100 border border-red-100 flex items-center justify-center"
                    >
                      <span className="material-symbols-outlined text-red-500" style={{ fontSize: 16 }}>remove</span>
                    </button>
                    <span className="font-bold text-zinc-900 text-sm min-w-[18px] text-center">{item.quantity}</span>
                    <button
                      onClick={() => addItem(item.id)}
                      className="qty-btn w-7 h-7 rounded-full bg-green-50 hover:bg-green-100 border border-green-100 flex items-center justify-center"
                    >
                      <span className="material-symbols-outlined text-green-600" style={{ fontSize: 16 }}>add</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="mt-4 pt-4 border-t border-dashed border-stone-200 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Subtotal</span>
                <span className="text-zinc-700 font-medium">₱{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Tax ({settings.taxRate}%)</span>
                <span className="text-zinc-700 font-medium">₱{tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Service Fee</span>
                <span className="text-zinc-700 font-medium">₱{serviceFee.toFixed(2)}</span>
              </div>
              {tipPercent > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Tip ({tipPercent}%)</span>
                  <span className="text-zinc-700 font-medium">₱{tipAmount.toFixed(2)}</span>
                </div>
              )}
            </div>
          </section>

          {/* Add-ons */}
          <section className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
            <h2 className="text-sm font-bold text-zinc-900 mb-3 uppercase tracking-wider">Add More Items</h2>
            <div className="overflow-x-auto -mx-1 px-1">
              <div className="flex gap-3 pb-1">
                {menuItems.slice(0, 6).map(item => (
                  <div key={item.id} className="flex-shrink-0 w-28">
                    <div className="bg-zinc-50 rounded-xl p-2.5 text-center hover:bg-orange-50 transition-colors duration-200 cursor-pointer border border-transparent hover:border-orange-100">
                      <div className="w-14 h-14 rounded-lg overflow-hidden mx-auto mb-2 bg-zinc-200 shadow-sm">
                        {item.image ? (
                          <img alt={item.name} className="w-full h-full object-cover" src={item.image} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-400">
                            <span className="material-symbols-outlined text-base">restaurant</span>
                          </div>
                        )}
                      </div>
                      <h3 className="font-semibold text-zinc-900 text-xs mb-0.5 truncate">{item.name}</h3>
                      <p className="text-primary font-bold text-xs">₱{item.price.toFixed(2)}</p>
                      <button
                        onClick={() => {
                          const existingItem = orderItems.find(oi => oi.baseId === item.id || oi.id === item.id)
                          if (existingItem) {
                            addItem(existingItem.id)
                          } else {
                            const newItem = {
                              id: `${item.id}_${Date.now()}`,
                              baseId: item.id,
                              name: item.name,
                              price: item.price,
                              quantity: 1,
                              image: item.image,
                            }
                            setOrderItems(prev => [...prev, newItem])
                          }
                        }}
                        className="w-full mt-2 py-1 px-2 bg-primary text-white text-xs rounded-lg hover:bg-primary/90 active:scale-95 transition-all duration-150 font-semibold"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Tip */}
          <section className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
            <h2 className="text-sm font-bold text-zinc-900 mb-3 uppercase tracking-wider">Add a Tip</h2>
            <div className="grid grid-cols-4 gap-2">
              {[15, 18, 20].map(pct => (
                <button
                  key={pct}
                  onClick={() => setTipPercent(pct)}
                  className={`py-3 rounded-xl flex flex-col items-center transition-all duration-200 border ${tipPercent === pct
                    ? 'bg-primary border-primary text-white shadow-md shadow-primary/20 scale-[1.03]'
                    : 'border-stone-200 text-zinc-900 hover:border-primary/30 hover:bg-orange-50'
                    }`}
                >
                  <span className="font-bold text-sm">{pct}%</span>
                  <span className={`text-xs mt-0.5 ${tipPercent === pct ? 'opacity-80 text-white' : 'text-zinc-400'}`}>
                    ₱{((subtotal * pct) / 100).toFixed(2)}
                  </span>
                </button>
              ))}
              <button
                onClick={() => setTipPercent(0)}
                className={`py-3 border rounded-xl flex flex-col items-center transition-all duration-200 ${tipPercent === 0
                  ? 'bg-primary border-primary text-white shadow-md shadow-primary/20 scale-[1.03]'
                  : 'border-stone-200 text-zinc-900 hover:border-primary/30 hover:bg-orange-50'
                  }`}
              >
                <span className="font-bold text-sm">None</span>
                <span className={`text-xs mt-0.5 ${tipPercent === 0 ? 'opacity-80 text-white' : 'text-zinc-400'}`}>₱0.00</span>
              </button>
            </div>
          </section>

          {/* Payment Methods */}
          <section className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
            <h2 className="text-sm font-bold text-zinc-900 mb-3 uppercase tracking-wider">Payment Method</h2>
            <div className="space-y-2">
              {[
                { key: 'qrph', label: 'QR PH', description: 'Scan to pay instantly with your banking app.', icon: 'qr_code_scanner' },
                { key: 'card', label: 'Debit / Credit Card', description: 'Pay securely with credit or debit card.', icon: 'credit_card' },
                { key: 'cash', label: 'Cash', description: 'Pay in cash at the counter now — order sent to kitchen after.', icon: 'payments' },
              ].map((method) => (
                <button
                  key={method.key}
                  type="button"
                  onClick={() => setPaymentMethod(method.key as 'qrph' | 'card' | 'cash')}
                  className={`w-full text-left rounded-2xl border px-4 py-3.5 flex items-center justify-between transition-all duration-200 ${paymentMethod === method.key
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors duration-200 ${paymentMethod === method.key ? 'bg-primary/10' : 'bg-zinc-100'}`}>
                      <span className={`material-symbols-outlined text-xl ${paymentMethod === method.key ? 'text-primary' : 'text-zinc-500'}`}>{method.icon}</span>
                    </div>
                    <div>
                      <div className={`font-semibold text-sm ${paymentMethod === method.key ? 'text-primary' : 'text-zinc-900'}`}>{method.label}</div>
                      <p className="text-xs text-zinc-400 mt-0.5">{method.description}</p>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${paymentMethod === method.key ? 'border-primary bg-primary' : 'border-stone-300'}`}>
                    {paymentMethod === method.key && (
                      <div className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Security badge */}
          <div className="flex items-center justify-center gap-1.5 text-zinc-400 py-2">
            <span className="material-symbols-outlined text-sm">lock</span>
            <span className="text-[10px] uppercase tracking-widest font-bold">Secure encrypted checkout</span>
          </div>
        </main>

        {/* Bottom Bar */}
        <div className="fixed bottom-0 w-full z-50 bg-white/95 backdrop-blur-md border-t border-stone-100 shadow-[0_-8px_30px_rgba(0,0,0,0.07)] px-4 pb-8 pt-4">
          <div className="max-w-xl mx-auto">
            <div className="flex justify-between items-end mb-3 px-1">
              <div>
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Total</span>
                <div className="text-3xl font-black text-primary leading-none mt-0.5">₱{grandTotal.toFixed(2)}</div>
              </div>
              <span className="text-zinc-400 text-xs mb-0.5 italic">
                Order sent to kitchen after payment
              </span>
            </div>
            <button
              onClick={() => setShowSummaryModal(true)}
              disabled={isProcessing || orderItems.length === 0}
              className="w-full h-14 bg-primary text-white rounded-2xl text-base font-bold flex items-center justify-center gap-2.5 shadow-lg shadow-primary/25 active:scale-[0.98] transition-all duration-150 disabled:opacity-60"
            >
              {isProcessing ? (
                <>
                  <span className="material-symbols-outlined animate-spin" style={{ fontSize: 20 }}>progress_activity</span>
                  Processing Payment…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>lock</span>
                  <span>{paymentMethod === 'qrph' ? 'Pay with QR PH' : paymentMethod === 'card' ? 'Pay with Card' : 'Pay with Cash'}</span>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_forward</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Remove Confirmation Dialog ─────────────────────── */}
      {removeTarget && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center fade-in">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setRemoveTarget(null)}
          />
          <div className="relative w-full max-w-xl mx-auto bg-white rounded-t-3xl p-6 pb-10 shadow-2xl slide-up">
            <div className="w-10 h-1 bg-stone-200 rounded-full mx-auto mb-5" />
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-red-500" style={{ fontSize: 26 }}>delete</span>
              </div>
              <div>
                <h3 className="font-bold text-zinc-900 text-base">Remove item?</h3>
                <p className="text-zinc-500 text-sm mt-0.5">
                  Remove <span className="font-semibold text-zinc-700">{removeTarget.name}</span> from your order?
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setRemoveTarget(null)}
                className="h-12 rounded-xl border border-stone-200 text-zinc-700 font-semibold text-sm hover:bg-stone-50 active:scale-[0.97] transition-all duration-150"
              >
                Keep it
              </button>
              <button
                onClick={confirmRemove}
                className="h-12 rounded-xl bg-red-500 text-white font-semibold text-sm hover:bg-red-600 active:scale-[0.97] transition-all duration-150 shadow-md shadow-red-200"
              >
                Yes, remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pre-Payment Summary Modal ──────────────────────── */}
      {showSummaryModal && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center fade-in">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowSummaryModal(false)}
          />
          <div className="relative w-full max-w-xl mx-auto bg-white rounded-t-3xl pt-5 pb-10 shadow-2xl slide-up max-h-[90vh] overflow-y-auto">
            {/* Handle */}
            <div className="w-10 h-1 bg-stone-200 rounded-full mx-auto mb-4" />

            <div className="px-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-black text-zinc-900">Order Review</h2>
                <button
                  onClick={() => setShowSummaryModal(false)}
                  className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center hover:bg-stone-200 active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-zinc-500" style={{ fontSize: 18 }}>close</span>
                </button>
              </div>

              {/* Items list */}
              <div className="space-y-3 mb-5">
                {orderItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-100">
                      {item.image ? (
                        <img alt={item.name} className="w-full h-full object-cover" src={item.image} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-300">
                          <span className="material-symbols-outlined text-base">restaurant</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-grow min-w-0">
                      <p className="font-semibold text-zinc-900 text-sm truncate">{item.name}</p>
                      <p className="text-zinc-400 text-xs">x{item.quantity}</p>
                    </div>
                    <span className="font-bold text-zinc-900 text-sm flex-shrink-0">₱{(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Divider */}
              <div className="border-t border-dashed border-stone-200 mb-4" />

              {/* Breakdown */}
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Subtotal</span>
                  <span className="font-medium text-zinc-700">₱{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Tax ({settings.taxRate}%)</span>
                  <span className="font-medium text-zinc-700">₱{tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Service Fee</span>
                  <span className="font-medium text-zinc-700">₱{serviceFee.toFixed(2)}</span>
                </div>
                {tipPercent > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Tip ({tipPercent}%)</span>
                    <span className="font-medium text-zinc-700">₱{tipAmount.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Grand total */}
              <div className="bg-primary/5 border border-primary/15 rounded-2xl px-4 py-3.5 flex justify-between items-center mb-4">
                <span className="font-bold text-zinc-900">Total</span>
                <span className="text-2xl font-black text-primary">₱{grandTotal.toFixed(2)}</span>
              </div>

              {/* Payment method summary */}
              <div className="flex items-center gap-3 bg-zinc-50 rounded-2xl px-4 py-3 mb-6 border border-zinc-100">
                <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>
                    {paymentMethodIcon[paymentMethod]}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-zinc-400 font-medium">Paying with</p>
                  <p className="text-sm font-bold text-zinc-900">{paymentMethodLabel[paymentMethod]}</p>
                </div>
              </div>

              {/* Confirm button */}
              <button
                onClick={handlePay}
                className="w-full h-14 bg-primary text-white rounded-2xl text-base font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/25 active:scale-[0.98] transition-all duration-150"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>check_circle</span>
                Confirm & Pay ₱{grandTotal.toFixed(2)}
              </button>
              <p className="text-center text-xs text-zinc-400 mt-3">By confirming, you agree to the charges above.</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
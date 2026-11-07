'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useCart, CartItem as CartItemType, Transaction } from '@/app/cashier/context/CartContext'
import { Table, addOrder, updateTableStatus } from '@/lib/data'

// Fallback only — the cashier page passes the tax rate from Settings
const DEFAULT_TAX_RATE = 8

// Quick cash amount presets (in PHP)
const QUICK_AMOUNTS = [100, 200, 500, 1000]

interface CartSummaryProps {
  taxRate?: number
  onComplete?: (transaction: Transaction) => void
  tables?: Table[]
  selectedTableId?: string | null
  onTableSelect?: (tableId: string | null) => void
}

export function CartSummary({ taxRate = DEFAULT_TAX_RATE, onComplete, tables = [], selectedTableId, onTableSelect }: CartSummaryProps) {
  const { items, getSubtotal, clearCart, customerInfo } = useCart()
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'digital'>('cash')
  const [paymentReceived, setPaymentReceived] = useState('')
  const [showReceipt, setShowReceipt] = useState(false)
  const [lastTransaction, setLastTransaction] = useState<Transaction | null>(null)

  const [orderType, setOrderType] = useState<'dine-in' | 'takeout'>('dine-in')
  const [takeoutReference, setTakeoutReference] = useState('')
  const [discountType, setDiscountType] = useState<'none' | 'senior' | 'pwd' | 'custom'>('none')
  const [promoCode, setPromoCode] = useState('')
  const [isPromoApplied, setIsPromoApplied] = useState(false)
  
  const [isConfirming, setIsConfirming] = useState(false)

  const subtotal = getSubtotal()
  
  let computedDiscount = 0
  if (discountType === 'senior' || discountType === 'pwd') {
    computedDiscount = subtotal * 0.20
  } else if (discountType === 'custom' && isPromoApplied && promoCode.toUpperCase() === 'PROMO10') {
    computedDiscount = subtotal * 0.10
  }

  const tax = (subtotal - computedDiscount) * (taxRate / 100)
  const total = subtotal - computedDiscount + tax
  const payment = parseFloat(paymentReceived) || 0
  const change = payment - total

  const changeDue = payment - total
  const hasCashInput = paymentReceived !== ''

  const cartEmpty = items.length === 0
  const cashInsufficient = paymentMethod === 'cash' && payment < total
  const requiresTable = orderType === 'dine-in'
  const isDisabled = cartEmpty || cashInsufficient || (requiresTable && !selectedTableId)

  const disabledHint = cartEmpty
    ? 'Add items to the cart first'
    : cashInsufficient
    ? 'Cash received is less than the total'
    : requiresTable && !selectedTableId
    ? 'Select a table for dine-in orders'
    : ''

  const selectedTable = selectedTableId ? tables.find(t => t.id === selectedTableId) : null
  const orderLabel = orderType === 'takeout'
    ? 'Takeout'
    : selectedTable
    ? `Table ${selectedTable.tableNumber}`
    : 'Dine In'

  const cartPanelRef = useRef<HTMLDivElement>(null)

  // ── Accumulator helper ────────────────────────────────────────────────────
  const addToPayment = useCallback((amount: number) => {
    setPaymentReceived(prev => {
      const current = parseFloat(prev) || 0
      return String(current + amount)
    })
  }, [])

  const handleCheckout = useCallback(async () => {
    if (cartEmpty) return
    if (paymentMethod === 'cash' && payment < total) return
    if (requiresTable && !selectedTableId) {
      alert('Please select a table before checkout')
      return
    }

    setIsConfirming(true)

    try {
      const selectedTable = selectedTableId ? tables.find(t => t.id === selectedTableId) : null
      if (requiresTable && !selectedTable) return

      const effectivePayment = paymentMethod === 'cash' ? payment : total
      const transactionCustomer =
        orderType === 'takeout' && takeoutReference
          ? { name: takeoutReference, phone: '', email: '' }
          : customerInfo.name
          ? customerInfo
          : undefined

      const transaction: Transaction = {
        id: `TXN-${Date.now()}`,
        items: [...items],
        subtotal,
        tax,
        discount: computedDiscount,
        total,
        paymentReceived: effectivePayment,
        change: paymentMethod === 'cash' && change > 0 ? change : 0,
        customer: transactionCustomer,
        orderType,
        reference: takeoutReference,
        timestamp: new Date(),
        paymentMethod
      }

      try {
        const orderId = await addOrder({
          tableNumber: orderType === 'takeout' ? 0 : selectedTable!.tableNumber,
          items: items.map(i => ({
            id: i.id,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            image: i.image || '',
            ...(i.variantName && { variantName: i.variantName }),
            ...(i.notes && { notes: i.notes })
          })),
          status: 'preparing',
          paymentStatus: 'paid',
          paymentMethod: paymentMethod === 'cash' ? 'cash' : 'card', // rough mapping for cashier
          total: subtotal - computedDiscount, // same meaning as QR orders: items before tax
          grandTotal: total,                  // what was actually charged
          tipAmount: 0,
          paidAt: Date.now(),
          orderType,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }, undefined, { preserveStatus: true })

        if (orderId && selectedTable) {
          await updateTableStatus(selectedTableId!, 'occupied', orderId)
        }

        setLastTransaction(transaction)
        setShowReceipt(true)
        onComplete?.(transaction)
        clearCart()
      } catch (err) {
        console.error('Checkout error:', err)
        alert('Checkout failed. Please try again.')
      }
    } finally {
      setIsConfirming(false)
    }
  }, [cartEmpty, payment, total, items, subtotal, tax, computedDiscount, customerInfo, paymentMethod, change, onComplete, orderType, takeoutReference, requiresTable, selectedTableId, tables, clearCart])

  const cancelConfirmation = useCallback(() => {
    setIsConfirming(false)
  }, [])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    if (paymentMethod !== 'cash') return

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const inPanel = cartPanelRef.current?.contains(target) ?? false
      const isBody = target === document.body || target.tagName === 'DIV'
      if (!inPanel && !isBody) return

      if (target.tagName === 'INPUT' && e.key !== 'Escape' && e.key !== 'Enter') return

      switch (e.key) {
        case '1': e.preventDefault(); addToPayment(QUICK_AMOUNTS[0]); break
        case '2': e.preventDefault(); addToPayment(QUICK_AMOUNTS[1]); break
        case '3': e.preventDefault(); addToPayment(QUICK_AMOUNTS[2]); break
        case '4': e.preventDefault(); addToPayment(QUICK_AMOUNTS[3]); break
        case 'Enter':
          e.preventDefault()
          if (!isDisabled) handleCheckout()
          break
        case 'Escape':
          e.preventDefault()
          setPaymentReceived('')
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod, isDisabled, addToPayment])

  const handleNewTransaction = useCallback(() => {
    setShowReceipt(false)
    setLastTransaction(null)
    setPaymentReceived('')
    setDiscountType('none')
    setPromoCode('')
    setIsPromoApplied(false)
    setOrderType('dine-in')
    setTakeoutReference('')
    clearCart()
    onTableSelect?.(null)
  }, [clearCart, onTableSelect])

  useEffect(() => {
    if (!showReceipt || !lastTransaction) return

    const timer = window.setTimeout(() => {
      handleNewTransaction()
    }, 4000)

    return () => window.clearTimeout(timer)
  }, [showReceipt, lastTransaction, handleNewTransaction])

  // ── Empty cart state ──────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-surface-container-low">
        <div className="text-center py-8">
          <span className="material-symbols-outlined text-on-surface-variant text-5xl mb-3">shopping_cart</span>
          <p className="text-on-surface-variant">Cart is empty</p>
          <p className="text-sm text-outline mt-1">Add items to start a sale</p>
        </div>
      </div>
    )
  }

  // ── Receipt view ──────────────────────────────────────────────────────────
  if (showReceipt && lastTransaction) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-surface-container-low overflow-hidden">
        <div className="bg-primary text-white p-4 text-center">
          <span className="material-symbols-outlined text-3xl mb-1">check_circle</span>
          <h3 className="font-bold text-lg">Transaction Complete</h3>
          <p className="text-sm opacity-90">{lastTransaction.id}</p>
        </div>

        <div className="p-4 space-y-3">
          <div className="text-center border-b border-outline-variant pb-3 mb-3">
            <p className="text-xs text-on-surface-variant">{lastTransaction.timestamp.toLocaleString()}</p>
          </div>

          <div className="flex justify-between items-center text-sm text-on-surface-variant mb-3">
            <span>{lastTransaction.orderType === 'takeout' ? 'Takeout Order' : 'Dine-in Order'}</span>
            {lastTransaction.reference && (
              <span className="font-medium text-on-surface">{lastTransaction.reference}</span>
            )}
          </div>

          <div className="space-y-2">
            {lastTransaction.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-on-surface">{item.quantity}x {item.name}</span>
                <span className="text-on-surface">₱{(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-outline-variant pt-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Subtotal</span>
              <span className="text-on-surface">₱{lastTransaction.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Tax ({taxRate}%)</span>
              <span className="text-on-surface">₱{lastTransaction.tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-outline-variant">
              <span className="text-on-surface">Total</span>
              <span className="text-primary">₱{lastTransaction.total.toFixed(2)}</span>
            </div>
          </div>

          <div className="bg-surface-container-low rounded-xl p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Payment Method</span>
              <span className="text-on-surface capitalize">{lastTransaction.paymentMethod}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Received</span>
              <span className="text-on-surface">₱{lastTransaction.paymentReceived.toFixed(2)}</span>
            </div>
            {lastTransaction.change > 0 && (
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-on-surface">Change</span>
                <span className="text-primary">₱{lastTransaction.change.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-surface-container-low">
          <button
            onClick={handleNewTransaction}
            className="w-full py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary-container transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined">add</span>
            New Transaction
          </button>
        </div>
      </div>
    )
  }

  // ── Main cart/payment view ────────────────────────────────────────────────
  return (
    <div ref={cartPanelRef} className="bg-white rounded-2xl shadow-sm border border-surface-container-low">
      {/* Order Type */}
      <div className="p-4 border-b border-surface-container-low space-y-4">
        <div>
          <p className="text-sm font-medium text-on-surface-variant mb-2">Customer Type</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setOrderType('dine-in')
                setTakeoutReference('')
              }}
              className={`py-3 rounded-xl text-sm font-semibold transition-colors ${orderType === 'dine-in'
                ? 'bg-primary text-white'
                : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
              }`}
            >
              Dine In
            </button>
            <button
              type="button"
              onClick={() => {
                setOrderType('takeout')
                onTableSelect?.(null)
              }}
              className={`py-3 rounded-xl text-sm font-semibold transition-colors ${orderType === 'takeout'
                ? 'bg-primary text-white'
                : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
              }`}
            >
              Takeout
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-on-surface-variant">
          <span>Order mode</span>
          <span className="font-semibold text-on-surface">{orderLabel}</span>
        </div>

        {orderType === 'takeout' && (
          <div>
            <label className="text-sm font-medium text-on-surface-variant block mb-2">
              Customer name or order number (optional)
            </label>
            <input
              type="text"
              value={takeoutReference}
              onChange={e => setTakeoutReference(e.target.value)}
              placeholder="Customer name or order number"
              className="w-full px-3 py-3 border border-surface-container-high rounded-xl bg-surface-container-low focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 text-sm"
            />
          </div>
        )}
      </div>

      {/* Cart Items */}
      <div className="p-4 border-b border-surface-container-low">
        <h3 className="font-semibold text-on-surface mb-3">Order Items ({items.length})</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {items.map(item => (
            <CartItemRow key={item.id} item={item} />
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-on-surface-variant">Subtotal</span>
          <span className="text-on-surface">₱{subtotal.toFixed(2)}</span>
        </div>
        
        {/* Discount Section */}
        <div className="space-y-2 pt-2 border-t border-surface-container-low">
          <div className="flex justify-between items-center">
            <span className="text-sm text-on-surface-variant">Discount</span>
            <select
              value={discountType}
              onChange={(e) => {
                setDiscountType(e.target.value as 'none' | 'senior' | 'pwd' | 'custom')
                setIsPromoApplied(false)
              }}
              className="px-2 py-1 bg-surface-container-low rounded border border-surface-container-high text-sm focus:outline-none focus:border-primary"
            >
              <option value="none">None</option>
              <option value="senior">Senior Citizen (20%)</option>
              <option value="pwd">PWD (20%)</option>
              <option value="custom">Promo Code</option>
            </select>
          </div>
          
          {discountType === 'custom' && (
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                placeholder="PROMO10"
                value={promoCode}
                onChange={e => {
                  setPromoCode(e.target.value)
                  setIsPromoApplied(false)
                }}
                className="flex-1 px-2 py-1 text-sm border border-surface-container-high rounded bg-surface-container-low focus:border-primary focus:outline-none uppercase"
              />
              <button
                onClick={() => setIsPromoApplied(true)}
                className="px-3 py-1 bg-surface-container-high hover:bg-surface-container-highest text-sm rounded font-medium transition-colors"
              >
                Apply
              </button>
            </div>
          )}
          
          {computedDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600 font-medium">
              <span>Discount Applied</span>
              <span>-₱{computedDiscount.toFixed(2)}</span>
            </div>
          )}
        </div>

        <div className="flex justify-between text-sm pt-2 border-t border-surface-container-low">
          <span className="text-on-surface-variant">Tax ({taxRate}%)</span>
          <span className="text-on-surface">₱{tax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-lg font-bold pt-2 border-t border-outline-variant">
          <span className="text-on-surface">Total</span>
          <span className="text-primary">₱{total.toFixed(2)}</span>
        </div>
      </div>

      {/* Payment Section */}
      <div className="p-4 border-t border-surface-container-low space-y-3">
        {orderType === 'dine-in' && (
        <div>
          <label className="text-sm font-medium text-on-surface-variant block mb-2">Assign to Table</label>
          <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1">
            {tables.map(table => (
              <button
                key={table.id}
                onClick={() => onTableSelect?.(table.id)}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border text-xs font-medium transition-all ${
                  selectedTableId === table.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : table.status === 'available'
                    ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                    : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 opacity-70'
                }`}
              >
                <span className="font-bold text-xs">Table {table.tableNumber}</span>
                <span className="text-[10px] opacity-80">{table.capacity} pax</span>
              </button>
            ))}
          </div>
          {selectedTableId && (
            <p className="text-xs text-primary mt-1">✓ Table selected</p>
          )}
        </div>
        )}

        {/* Payment Method */} 
        <div>
          <label className="text-sm font-medium text-on-surface-variant block mb-2">Payment Method</label>
          <div className="grid grid-cols-3 gap-2">
            {(['cash', 'card', 'digital'] as const).map(method => (
              <button
                key={method}
                onClick={() => setPaymentMethod(method)}
                className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors capitalize ${
                  paymentMethod === method
                    ? 'bg-primary text-white'
                    : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
                }`}
              >
                {method}
              </button>
            ))}
          </div>
        </div>

        {/* Cash Input */}
        {paymentMethod === 'cash' && (
          <div>
            <label className="text-sm font-medium text-on-surface-variant block mb-2">Cash Received</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant font-medium">₱</span>
              <input
                type="number"
                value={paymentReceived}
                onChange={e => setPaymentReceived(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-3 bg-surface-container-low rounded-xl border border-surface-container-high focus:border-primary focus:outline-none text-lg font-semibold"
              />
            </div>

            {/* Quick amounts — ₱100/₱200/₱500/₱1000 ACCUMULATE on each tap */}
            <div className="grid grid-cols-3 gap-2 mt-2">
              <button
                onClick={() => setPaymentReceived(String(total.toFixed(2)))}
                className="py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium hover:bg-primary/20 transition-colors"
              >
                Exact
              </button>
              <button
                onClick={() => setPaymentReceived(String(Math.ceil(total / 50) * 50))}
                className="py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium hover:bg-primary/20 transition-colors"
              >
                Round Up
              </button>
              {QUICK_AMOUNTS.map(amount => (
                <button
                  key={amount}
                  onClick={() => addToPayment(amount)}
                  className="py-2 bg-surface-container-high rounded-lg text-sm font-medium hover:bg-surface-container-highest transition-colors"
                >
                  +₱{amount}
                </button>
              ))}
              <button
  onClick={() => setPaymentReceived('')}
  className="py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors col-span-3"
>
  Clear
</button>
            </div>

            <p className="text-xs text-on-surface-variant text-center mt-1.5 opacity-70">
              Press 1–4 for quick amounts · Enter to complete · Esc to clear
            </p>

            {hasCashInput && (
              <div className={`mt-3 p-3 rounded-xl flex justify-between items-center ${
                changeDue >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
              }`}>
                <span className={`font-medium text-sm ${changeDue >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {changeDue >= 0 ? 'Change Due' : 'Insufficient Cash'}
                </span>
                <span className={`text-2xl font-bold ${changeDue >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {changeDue >= 0
                    ? `₱${changeDue.toFixed(2)}`
                    : `-₱${Math.abs(changeDue).toFixed(2)}`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Complete Sale or Confirming Toast */}
        <div>
          {!isConfirming ? (
            <>
              <button
                onClick={handleCheckout}
                disabled={isDisabled}
                style={isDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                className="w-full py-4 bg-primary text-white rounded-xl font-bold text-lg hover:bg-primary-container transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined">payments</span>
                Complete Sale
              </button>

              {isDisabled && disabledHint && (
                <p className="text-xs text-on-surface-variant text-center mt-2">{disabledHint}</p>
              )}
            </>
          ) : (
            <div className="w-full py-2 bg-green-500 rounded-xl overflow-hidden relative shadow-inner">
              <div 
                className="absolute top-0 left-0 bottom-0 bg-green-600 transition-all ease-linear"
                style={{ width: '100%', animation: 'shrink 5s linear forwards' }}
              />
              <div className="relative flex items-center justify-between px-4 z-10 text-white">
                <span className="font-medium text-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  Order sent to kitchen
                </span>
                <button
                  onClick={cancelConfirmation}
                  className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded text-sm font-bold transition-colors"
                >
                  Undo
                </button>
              </div>
              <style>{`
                @keyframes shrink {
                  from { width: 100%; }
                  to { width: 0%; }
                }
              `}</style>
            </div>
          )}
        </div>

        {/* Clear Cart */}
        <button
          onClick={clearCart}
          className="w-full py-2 text-error text-sm font-medium hover:bg-error-container rounded-lg transition-colors"
        >
          Clear Cart
        </button>
      </div>
    </div>
  )
}

// ── Inline CartItemRow ────────────────────────────────────────────────────────
function CartItemRow({ item }: { item: CartItemType }) {
  const { updateQuantity, removeItem, updateItemNote } = useCart()
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [noteInput, setNoteInput] = useState(item.notes || '')

  return (
    <div className="flex flex-col gap-1 py-2 border-b border-surface-container-low last:border-0">
      <div className="flex items-center gap-2">
        <button
          onClick={() => updateQuantity(item.id, item.quantity - 1)}
          aria-label="Decrease"
          className="w-6 h-6 rounded-full bg-surface-container-high hover:bg-surface-container-highest flex items-center justify-center transition-colors flex-shrink-0"
        >
          <span className="material-symbols-outlined text-on-surface" style={{ fontSize: '14px' }}>remove</span>
        </button>
        <span className="text-sm text-on-surface-variant w-5 text-center">{item.quantity}</span>
        <button
          onClick={() => updateQuantity(item.id, item.quantity + 1)}
          aria-label="Increase"
          className="w-6 h-6 rounded-full bg-primary text-white hover:bg-primary-container flex items-center justify-center transition-colors flex-shrink-0"
        >
          <span className="material-symbols-outlined text-on-primary" style={{ fontSize: '14px' }}>add</span>
        </button>

        <span className="flex-1 text-sm text-on-surface truncate">{item.name}</span>
        <span className="text-sm font-medium text-on-surface">₱{(item.price * item.quantity).toFixed(2)}</span>
        <button onClick={() => removeItem(item.id)} className="p-1 hover:bg-error-container rounded" aria-label="Remove">
          <span className="material-symbols-outlined text-error text-sm">close</span>
        </button>
      </div>

      {/* Item Notes */}
      <div className="pl-16 pr-8">
        {!isEditingNote ? (
          <div className="flex items-center gap-2">
            {item.notes ? (
              <span className="text-xs text-on-surface-variant italic">Note: {item.notes}</span>
            ) : null}
            <button
              onClick={() => setIsEditingNote(true)}
              className="text-xs text-primary hover:underline"
            >
              {item.notes ? 'Edit note' : '+ Add note'}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-1">
            <input
              type="text"
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  updateItemNote(item.id, noteInput)
                  setIsEditingNote(false)
                }
              }}
              autoFocus
              placeholder="e.g. no onions, extra spicy"
              className="flex-1 px-2 py-1 text-xs border border-surface-container-high rounded bg-surface-container-low focus:border-primary focus:outline-none"
            />
            <button
              onClick={() => {
                updateItemNote(item.id, noteInput)
                setIsEditingNote(false)
              }}
              className="text-xs text-primary font-medium"
            >
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
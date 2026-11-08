'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { signOut as nextAuthSignOut } from 'next-auth/react'
import { signOut as firebaseSignOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { CartProvider, useCart, Transaction } from '@/app/cashier/context/CartContext'
import { ProductCard } from '@/app/cashier/components/ProductCard'
import { CartSummary } from '@/app/cashier/components/CartSummary'
import { TransactionHistory } from '@/app/cashier/components/TransactionHistory'
import { NotificationsPanel } from '@/app/cashier/components/NotificationsPanel'
import { HistoryPanel } from '@/app/cashier/components/HistoryPanel'
import { SettingsPanel } from '@/app/cashier/components/SettingsPanel'
import { TableOrderHistoryModal } from '@/app/cashier/components/TableOrderHistoryModal'
import FloorPlanView from '@/app/components/floorplan/FloorPlanView'
import { AlertStack } from '@/app/cashier/components/AlertStack'
import { StaffGuide } from '@/app/components/StaffGuide'
import { stageOf, TONE_CLASSES } from '@/lib/orderFlow'
import { TableBadge } from '@/app/components/atoms/TableBadge'
import { tableColor } from '@/lib/tableColors'
import { orderTotals } from '@/lib/pricing'
import { listenToMenu, listenToTables, listenToOrders, MenuItem, CATEGORIES, Table, TableStatus, updateTableStatus, clearTableAfterPayment, Order, updateOrderStatus, processPaymentAndActivateOrder, listenToSettings, AppSettings, DEFAULT_SETTINGS, markOrderServed, listenToOpenServiceRequests, resolveServiceRequest, ServiceRequest } from '@/lib/data'

function CashierContent() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [activeTab, setActiveTab] = useState<'cart' | 'orders' | 'tables'>('cart')
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [tables, setTables] = useState<Table[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  useEffect(() => listenToSettings(setSettings), [])
  
  // Pay QR order state
  const [payingOrder, setPayingOrder] = useState<Order | null>(null)
  const [paymentReceivedStr, setPaymentReceivedStr] = useState('')
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [qrReceiptTransaction, setQrReceiptTransaction] = useState<Transaction | null>(null)

  // Header panel open/close state
  const [notifOpen, setNotifOpen]   = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  // FIX 1 & 3: Store only the selected table ID instead of the full object.
  // This prevents stale state — the UI always derives the current table from
  // the live `tables` array rather than a snapshot taken at click-time.
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)

  // FIX 4: Optimistic status map — keyed by tableId, holds the status that was
  // applied locally before Firebase confirms the write.  Merged during render so
  // the UI updates instantly and reverts automatically once real data arrives.
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, TableStatus>>({})
  // Served orders pile up during a shift — hide them by default (nothing is deleted)
  const [showServed, setShowServed] = useState(false)
  const [showTableHistory, setShowTableHistory] = useState<Table | null>(null)
  const [tableView, setTableView] = useState<'map' | 'list'>('map')
  // Left side shows either the menu grid or a large floor map
  const [leftView, setLeftView] = useState<'menu' | 'floor'>('menu')
  const [guideOpen, setGuideOpen] = useState(false)
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([])
  useEffect(() => listenToOpenServiceRequests(setServiceRequests), [])

  // QR Payment modal state
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'digital'>('cash')

  const { addTransaction, recentTransactions, items: cartItems } = useCart()
  // Amount due when the cashier takes payment for a QR order (same formula as customer checkout)
  const due = payingOrder ? orderTotals(payingOrder.total, settings) : null

  const getOrderStatusLabel = useCallback((order: Order) => stageOf(order.status).label, [])

  // Customer order prices come from their phone. Until orders are created
  // server-side, flag anything that doesn't match the live menu so the
  // cashier can catch tampering before accepting / taking payment.
  const menuPriceFor = useCallback((item: Order['items'][number]): number | null => {
    const menu = menuItems.find(m => m.id === (item.baseId ?? item.id.split('::')[0]))
    if (!menu) return null
    if (item.variantName) return menu.variants?.find(v => v.name === item.variantName)?.price ?? null
    return menu.price
  }, [menuItems])

  const checkOrderPrices = useCallback((order: Order) => {
    const itemsSum = order.items.reduce((s, i) => s + i.price * i.quantity, 0)
    const totalMismatch = Math.abs(itemsSum - order.total) > 0.009
    const priceMismatch = order.items.some(i => {
      const expected = menuPriceFor(i)
      return expected !== null && Math.abs(expected - i.price) > 0.009
    })
    return { totalMismatch, priceMismatch, hasIssue: totalMismatch || priceMismatch }
  }, [menuPriceFor])

  useEffect(() => {
    const unsubMenu = listenToMenu(setMenuItems)
    const unsubTables = listenToTables((incoming: Table[]) => {
      setTables(incoming)
      // FIX 5: When Firebase confirms a status, drop it from the optimistic map
      // so the confirmed value (same as the optimistic one) takes over cleanly —
      // zero flicker, no double-update visible to the user.
      setOptimisticStatuses(prev => {
        const next = { ...prev }
        let changed = false
        incoming.forEach(t => {
          if (next[t.id] !== undefined && next[t.id] === t.status) {
            delete next[t.id]
            changed = true
          }
        })
        return changed ? next : prev
      })
    })
    const unsubOrders = listenToOrders(setOrders)
    return () => { unsubMenu(); unsubTables(); unsubOrders() }
  }, [])

  // FIX 2: Derive the selected table via useMemo so it is always the freshest
  // version from the live `tables` array.  Merging optimisticStatuses here means
  // every re-render reflects both real-time Firebase data AND any in-flight
  // optimistic updates, keeping the detail panel perfectly in sync.
  const tablesWithOptimistic = useMemo<Table[]>(() => {
    if (Object.keys(optimisticStatuses).length === 0) return tables
    return tables.map(t =>
      optimisticStatuses[t.id] !== undefined
        ? { ...t, status: optimisticStatuses[t.id] }
        : t
    )
  }, [tables, optimisticStatuses])

  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])

  // Occupied tables whose orders (since they were seated) are all served & paid
  const readyToClear = useMemo(() => {
    const set = new Set<string>()
    for (const t of tablesWithOptimistic) {
      if (t.status !== 'occupied') continue
      const since = t.occupiedAt ?? 0
      const tableOrders = orders.filter(o => o.tableNumber === t.tableNumber && o.createdAt >= since)
      if (tableOrders.length && tableOrders.every(o => o.status === 'served' && o.paymentStatus === 'paid')) set.add(t.id)
    }
    return set
  }, [tablesWithOptimistic, orders])

  const selectedTable = useMemo<Table | null>(
    () => tablesWithOptimistic.find(t => t.id === selectedTableId) ?? null,
    [tablesWithOptimistic, selectedTableId]
  )

  // Filter products from Firebase
  // Fix #8: also exclude zero-price items from the grid (hidden entirely)
  const filteredProducts = useMemo(() => {
    return menuItems.filter(product => {
      const matchesSearch =
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory =
        selectedCategory === 'All' || product.category === selectedCategory
      // Keep available items and zero-price items (they'll show as "Unavailable" overlay)
      return matchesSearch && matchesCategory && product.available
    })
  }, [menuItems, searchQuery, selectedCategory])

  const handleTransactionComplete = (transaction: Transaction) => {
    addTransaction(transaction)
  }

  // FIX 4: Apply optimistic status immediately, then fire the async Firebase
  // write.  If Firebase fails the optimistic entry stays visible until the next
  // real update, keeping the UX snappy rather than frozen on a pending spinner.
  const handleTableStatusChange = useCallback(
    async (tableId: string, status: TableStatus) => {
      setOptimisticStatuses(prev => ({ ...prev, [tableId]: status }))
      try {
        if (status === 'available') {
          await clearTableAfterPayment(tableId)
        } else {
          await updateTableStatus(tableId, status)
        }
      } catch (err) {
        // On failure, remove the optimistic entry so Firebase's true value
        // is shown on the next listener callback.
        console.error('Failed to update table status:', err)
        setOptimisticStatuses(prev => {
          const next = { ...prev }
          delete next[tableId]
          return next
        })
      }
    },
    []
  )

  useEffect(() => {
    if (!qrReceiptTransaction) return

    const timer = window.setTimeout(() => {
      setPayingOrder(null)
      setQrReceiptTransaction(null)
      setPaymentReceivedStr('')
    }, 4000)

    return () => window.clearTimeout(timer)
  }, [qrReceiptTransaction])

  // Fix #5: pulse the cart icon for 400ms when a product is added
  const getStatusColor = (status: TableStatus) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-700 border-green-200'
      case 'occupied':  return 'bg-red-100 text-red-700 border-red-200'
      case 'reserved':  return 'bg-blue-100 text-blue-700 border-blue-200'
    }
  }

  const getStatusIcon = (status: TableStatus) => {
    switch (status) {
      case 'available': return 'check_circle'
      case 'occupied':  return 'restaurant'
      case 'reserved':  return 'event_seat'
    }
  }

  const tableStats = useMemo(() => ({
    available: tablesWithOptimistic.filter(t => t.status === 'available').length,
    occupied:  tablesWithOptimistic.filter(t => t.status === 'occupied').length,
    reserved:  tablesWithOptimistic.filter(t => t.status === 'reserved').length,
  }), [tablesWithOptimistic])

  // Fix #6: badge counts for tabs
  // Tables badge = occupied count; History badge = session transaction count
  const occupiedCount = tableStats.occupied
  const historyCount = recentTransactions.length

  // FIX 6: Guard against undefined — orders may not have loaded yet.
  const getOrderById = (orderId: string | undefined): Order | undefined => {
    if (!orderId) return undefined
    return orders.find(o => o.id === orderId)
  }

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-surface-container-low sticky top-0 z-40">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-white">point_of_sale</span>
            </div>
            <div>
              <h1 className="font-bold text-on-surface text-lg">Cashier POS</h1>
              <p className="text-xs text-on-surface-variant">{settings.restaurantName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* ? How it works */}
            <button
              onClick={() => setGuideOpen(true)}
              className="hidden sm:flex items-center gap-1.5 h-10 px-3 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
              aria-label="How it works"
            >
              <span className="material-symbols-outlined">help</span>How it works
            </button>

            {/* 🔔 Bell — Notifications */}
            <button
              onClick={() => { setNotifOpen(v => !v); setSettingsOpen(false); setHistoryOpen(false) }}
              className="relative p-2 hover:bg-surface-container-high rounded-xl transition-colors"
              aria-label="Notifications"
            >
              <span className="material-symbols-outlined text-on-surface-variant">notifications</span>
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/*  History */}
            <button
              onClick={() => { setHistoryOpen(v => !v); setNotifOpen(false); setSettingsOpen(false) }}
              className="relative p-2 hover:bg-surface-container-high rounded-xl transition-colors"
              aria-label="Transaction History"
            >
              <span className="material-symbols-outlined text-on-surface-variant">history</span>
              {historyCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {historyCount > 99 ? '99+' : historyCount}
                </span>
              )}
            </button>

            {/* ⚙️ Settings */}
            <button
              onClick={() => { setSettingsOpen(v => !v); setNotifOpen(false); setHistoryOpen(false) }}
              className="p-2 hover:bg-surface-container-high rounded-xl transition-colors"
              aria-label="Settings"
            >
              <span className="material-symbols-outlined text-on-surface-variant">settings</span>
            </button>

            {/* 🚪 Sign Out */}
            <button
              onClick={async () => {
                try { await firebaseSignOut(auth) } catch(e){}
                await nextAuthSignOut({ callbackUrl: '/login' })
              }}
              className="p-2 hover:bg-red-50 rounded-xl transition-colors group"
              aria-label="Sign Out"
              title="Sign Out"
            >
              <span className="material-symbols-outlined text-on-surface-variant group-hover:text-red-500 transition-colors">logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Inline styles for animations */}
      <style>{`
        @keyframes cartPulse {
          0%   { transform: scale(1); }
          30%  { transform: scale(1.4); }
          60%  { transform: scale(0.9); }
          100% { transform: scale(1); }
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fadeIn 0.15s ease-in; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>

      {/* ── Header Panels ───────────────────────────────────────────────── */}
      <AlertStack
        orders={orders}
        requests={serviceRequests}
        now={now}
        hasPriceIssue={o => checkOrderPrices(o).hasIssue}
        onAccept={o => updateOrderStatus(o.id, 'accepted')}
        onMarkServed={o => markOrderServed(o.id)}
        onResolveRequest={r => resolveServiceRequest(r.id)}
        onReview={() => setActiveTab('orders')}
      />
      <StaffGuide open={guideOpen} onClose={() => setGuideOpen(false)} role="cashier" />

      <NotificationsPanel
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        onUnreadChange={setUnreadCount}
      />
      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        recentTransactions={recentTransactions}
      />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        recentTransactions={recentTransactions}
      />

      {/* ── Two-column body ─────────────────────────────────────────────────
           flex-1 min-h-0 lets the row fill exactly the remaining viewport
           height after the header, without the body ever needing to scroll.
      ────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        {/* Left Panel — independently scrollable menu grid */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 lg:p-6">
          {/* Menu ⇄ Floor plan — the big map borrows the menu's space only when needed */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex bg-white rounded-xl p-1 border border-surface-container-high" role="tablist" aria-label="Left panel">
              {([['menu', 'restaurant_menu', 'Menu'], ['floor', 'floor', 'Floor plan']] as const).map(([key, icon, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={leftView === key}
                  onClick={() => setLeftView(key)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors ${leftView === key ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
                >
                  <span className="material-symbols-outlined text-[18px]">{icon}</span>{label}
                  {key === 'floor' && occupiedCount > 0 && (
                    <span className={`text-xs px-1.5 rounded-full ${leftView === key ? 'bg-white/25' : 'bg-amber-100 text-amber-800'}`}>{occupiedCount}</span>
                  )}
                </button>
              ))}
            </div>
            {leftView === 'floor' && (
              <p className="hidden md:block text-sm text-on-surface-variant">Tap a table to see its orders and actions on the right.</p>
            )}
          </div>

          {leftView === 'floor' ? (
            <FloorPlanView
              tables={tablesWithOptimistic}
              selectedTableId={selectedTableId}
              onSelectTable={id => { setSelectedTableId(id); setActiveTab('tables') }}
              now={now}
              readyToClear={readyToClear}
              onShowList={() => { setLeftView('menu'); setActiveTab('tables'); setTableView('list') }}
            />
          ) : (
          <>
          {/* Search & Filters */}
          <div className="mb-6 space-y-4">
            {/* Search */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-surface-container-high focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            {/* Category Filters */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
              {['All', ...CATEGORIES].map(category => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                    selectedCategory === category
                      ? 'bg-primary text-white shadow-md shadow-primary/30'
                      : 'bg-white text-on-surface-variant hover:bg-surface-container-high border border-surface-container-high'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
              />
            ))}
          </div>

          {/* Fix #7: No Results Empty State — replaces the plain empty message */}
          {filteredProducts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="material-symbols-outlined text-on-surface-variant mb-4" style={{ fontSize: '56px' }}>
                {searchQuery ? 'manage_search' : 'grid_off'}
              </span>
              <h2 className="text-lg font-semibold text-on-surface mb-1">No products found</h2>
              <p className="text-sm text-on-surface-variant mb-4">
                Try a different search term or clear the filter
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="px-5 py-2 bg-primary text-white rounded-full text-sm font-medium hover:bg-primary-container transition-colors"
                >
                  Clear search
                </button>
              )}
            </div>
          )}
          </>
          )}
        </div>

        {/* Right Panel — independently scrollable; flex-col so tabs stay
             pinned at top and content area takes the remaining height */}
        <div className="w-full lg:w-96 xl:w-[440px] bg-surface-container-low
                        lg:border-l border-surface-container-low
                        flex flex-col min-h-0">
          {/* Tabs — sticky at top of right panel, padding kept here */}
          <div className="flex gap-2 mb-0 p-4 lg:p-6 pb-4 shrink-0">
            <button
              onClick={() => setActiveTab('cart')}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                activeTab === 'cart'
                  ? 'bg-white text-primary shadow-sm'
                  : 'bg-transparent text-on-surface-variant hover:bg-white/50'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="material-symbols-outlined">shopping_cart</span>
                Cart
              </span>
            </button>

            <button
              onClick={() => setActiveTab('orders')}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all relative ${
                activeTab === 'orders'
                  ? 'bg-white text-primary shadow-sm'
                  : 'bg-transparent text-on-surface-variant hover:bg-white/50'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="material-symbols-outlined">qr_code</span>
                QR Orders
                {orders.filter(o => (o.status === 'preparing' || o.status === 'accepted') && o.paymentStatus !== 'paid').length > 0 && (
                  <span className="bg-blue-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                    {orders.filter(o => (o.status === 'preparing' || o.status === 'accepted') && o.paymentStatus !== 'paid').length}
                  </span>
                )}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('tables')}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all relative ${
                activeTab === 'tables'
                  ? 'bg-white text-primary shadow-sm'
                  : 'bg-transparent text-on-surface-variant hover:bg-white/50'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="material-symbols-outlined">table_restaurant</span>
                Tables
                {occupiedCount > 0 && (
                  <span className="bg-amber-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                    {occupiedCount}
                  </span>
                )}
              </span>
            </button>
          </div>

          {/* Tab content — flex-1 min-h-0 lets it fill the remaining right-panel
               height; overflow-y-auto + overscroll-contain keep scroll contained */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 lg:p-6 pt-0">
          {activeTab === 'cart' ? (
            <CartSummary
              taxRate={parseFloat(settings.taxRate) || 0}
              onComplete={handleTransactionComplete}
              tables={tablesWithOptimistic}
              selectedTableId={selectedTableId}
              onTableSelect={setSelectedTableId}
            />
          ) : activeTab === 'orders' ? (
            <div className="space-y-6">
              {/* Show / hide served orders (view only — nothing is deleted) */}
              {orders.length > 0 && (
                <div className="flex justify-between items-center">
                  <h2 className="font-bold text-lg text-on-surface">QR Orders</h2>
                  <button
                    onClick={() => setShowServed(v => !v)}
                    aria-pressed={showServed}
                    className="px-4 py-2 bg-white border border-outline-variant hover:bg-surface-container-high text-on-surface-variant text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">{showServed ? 'visibility_off' : 'visibility'}</span>
                    {showServed ? 'Hide served' : `Show served (${orders.filter(o => o.status === 'served').length})`}
                  </button>
                </div>
              )}
              {orders.length === 0 ? (
                <div className="text-center py-8">
                  <span className="material-symbols-outlined text-on-surface-variant text-4xl mb-2">
                    qr_code
                  </span>
                  <p className="text-on-surface-variant">No QR orders yet</p>
                  <p className="text-sm text-outline mt-1">Orders placed via QR codes will appear here</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Awaiting Acceptance Section */}
                  {orders.filter(o => o.status === 'pending').length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
                        New orders — tap Accept
                      </h3>
                      {orders.filter(o => o.status === 'pending').map(order => {
                        const table = tablesWithOptimistic.find(t => t.tableNumber === order.tableNumber)
                        const timeString = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        return (
                          <div key={order.id} className="bg-orange-50/50 rounded-xl p-4 border border-orange-100 shadow-sm" style={{ borderLeft: `6px solid ${tableColor(order.tableNumber).bg}` }}>
                            <div className="flex items-start justify-between mb-3">
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <TableBadge tableNumber={order.tableNumber} size="lg" />
                                  <span className="text-sm font-semibold text-zinc-700">{timeString}</span>
                                </div>
                                <p className="text-xs font-mono text-zinc-600">Order #{order.id.slice(0, 8)}</p>
                              </div>
                              <span className="text-sm font-mono text-orange-800 font-bold">₱{order.total.toFixed(2)}</span>
                            </div>
                            <div className="space-y-2 mb-4 bg-white/60 p-3 rounded-lg">
                              {(() => {
                                const check = checkOrderPrices(order)
                                return check.hasIssue && (
                                  <p className="text-xs font-bold text-red-600 flex items-center gap-1 pb-1">
                                    <span className="material-symbols-outlined text-sm">warning</span>
                                    {check.totalMismatch ? 'Total doesn’t add up' : 'Prices don’t match the menu'} — check before continuing
                                  </p>
                                )
                              })()}
                              {order.items.map((item, idx) => {
                                const expected = menuPriceFor(item)
                                const mismatch = expected !== null && Math.abs(expected - item.price) > 0.009
                                return (
                                  <div key={idx} className="flex justify-between text-sm">
                                    <span className="font-medium text-on-surface">{item.quantity}x {item.name}</span>
                                    <span
                                      className={mismatch ? 'text-red-600 font-bold' : 'text-on-surface-variant'}
                                      title={mismatch ? `Menu price is ₱${expected!.toFixed(2)}` : undefined}
                                    >
                                      {mismatch && `menu ₱${expected!.toFixed(2)} · `}₱{(item.price * item.quantity).toFixed(2)}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                            <button
                              onClick={async () => {
                                try {
                                  await updateOrderStatus(order.id, 'accepted')
                                } catch (error) {
                                  console.error('Error accepting order:', error)
                                  alert('Failed to accept order. Check console.')
                                }
                              }}
                              className="w-full py-3 px-4 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-bold transition-colors flex items-center justify-center gap-2 shadow-sm"
                            >
                              <span className="material-symbols-outlined">check_circle</span>
                              Accept Order
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Awaiting Payment Section */}
                  {orders.filter(o => o.status === 'accepted').length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                        Awaiting payment
                      </h3>
                      {orders.filter(o => o.status === 'accepted').map(order => {
                        const table = tablesWithOptimistic.find(t => t.tableNumber === order.tableNumber)
                        const timeString = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        return (
                          <div key={order.id} className="bg-blue-50/50 rounded-xl p-4 border border-blue-100 shadow-sm" style={{ borderLeft: `6px solid ${tableColor(order.tableNumber).bg}` }}>
                            <div className="flex items-start justify-between mb-3">
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <TableBadge tableNumber={order.tableNumber} size="lg" />
                                  <span className="text-sm font-semibold text-zinc-700">{timeString}</span>
                                </div>
                                <p className="text-xs font-mono text-zinc-600">Order #{order.id.slice(0, 8)}</p>
                                {order.paymentIssue && (
                                  <p className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1 flex items-start gap-1 max-w-[260px]">
                                    <span className="material-symbols-outlined text-sm">error</span>{order.paymentIssue}
                                  </p>
                                )}
                                {order.payAtCounter && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
                                    <span className="material-symbols-outlined text-[14px]">payments</span>Paying cash at the counter
                                  </span>
                                )}
                              </div>
                              <span className="text-right">
                                <span className="block text-sm font-mono text-blue-800 font-bold">₱{orderTotals(order.total, settings).total.toFixed(2)}</span>
                                <span className="block text-[10px] text-zinc-500">to collect · incl. tax &amp; fee</span>
                              </span>
                            </div>
                            <div className="space-y-2 mb-4 bg-white/60 p-3 rounded-lg">
                              {(() => {
                                const check = checkOrderPrices(order)
                                return check.hasIssue && (
                                  <p className="text-xs font-bold text-red-600 flex items-center gap-1 pb-1">
                                    <span className="material-symbols-outlined text-sm">warning</span>
                                    {check.totalMismatch ? 'Total doesn’t add up' : 'Prices don’t match the menu'} — check before continuing
                                  </p>
                                )
                              })()}
                              {order.items.map((item, idx) => {
                                const expected = menuPriceFor(item)
                                const mismatch = expected !== null && Math.abs(expected - item.price) > 0.009
                                return (
                                  <div key={idx} className="flex justify-between text-sm">
                                    <span className="font-medium text-on-surface">{item.quantity}x {item.name}</span>
                                    <span
                                      className={mismatch ? 'text-red-600 font-bold' : 'text-on-surface-variant'}
                                      title={mismatch ? `Menu price is ₱${expected!.toFixed(2)}` : undefined}
                                    >
                                      {mismatch && `menu ₱${expected!.toFixed(2)} · `}₱{(item.price * item.quantity).toFixed(2)}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                            <button
                              onClick={() => {
                                setPayingOrder(order)
                                setPaymentReceivedStr('')
                              }}
                              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors flex items-center justify-center gap-2 shadow-sm"
                            >
                              <span className="material-symbols-outlined">payments</span>
                              Process Payment
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Acknowledged Orders Section */}
                  {orders.filter(o => o.status !== 'pending' && o.status !== 'accepted' && (showServed || o.status !== 'served')).length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">
                        In the kitchen &amp; served
                      </h3>
                      {orders.filter(o => o.status !== 'pending' && o.status !== 'accepted' && (showServed || o.status !== 'served')).map(order => {
                        const table = tablesWithOptimistic.find(t => t.tableNumber === order.tableNumber)
                        const timeString = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        return (
                          <div key={order.id} className="bg-white rounded-xl p-4 border border-surface-container-low opacity-90 hover:opacity-100 transition-opacity" style={{ borderLeft: `6px solid ${tableColor(order.tableNumber).bg}` }}>
                            <div className="flex items-start justify-between mb-3">
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <TableBadge tableNumber={order.tableNumber} size="lg" />
                                  <span className="text-sm font-semibold text-zinc-700">{timeString}</span>
                                </div>
                                <p className="text-xs font-mono text-zinc-600">Order #{order.id.slice(0, 8)}</p>
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-mono text-primary block">₱{order.total.toFixed(2)}</span>
                                <span className={`inline-block mt-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${TONE_CLASSES[stageOf(order.status).tone].chip}`}>{getOrderStatusLabel(order)}</span>
                              </div>
                            </div>
                            <div className="space-y-1 mb-2">
                              {order.items.map((item, idx) => (
                                <div key={idx} className="flex justify-between text-xs text-on-surface-variant">
                                  <span>{item.quantity}x {item.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Table Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
                  <p className="text-2xl font-bold text-green-600">{tableStats.available}</p>
                  <p className="text-xs text-green-700">Available</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100">
                  <p className="text-2xl font-bold text-amber-600">{tableStats.occupied}</p>
                  <p className="text-xs text-amber-700">Occupied</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
                  <p className="text-2xl font-bold text-blue-600">{tableStats.reserved}</p>
                  <p className="text-xs text-blue-700">Reserved</p>
                </div>
              </div>

              {/* Map / list toggle */}
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-lg text-on-surface">Dining room</h2>
                <div className="flex bg-surface-container-low rounded-lg p-1" role="tablist" aria-label="Table view">
                  {(['map', 'list'] as const).map(v => (
                    <button
                      key={v}
                      role="tab"
                      aria-selected={tableView === v}
                      onClick={() => setTableView(v)}
                      className={`px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1 ${tableView === v ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant'}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">{v === 'map' ? 'floor' : 'view_list'}</span>
                      {v === 'map' ? 'Map' : 'List'}
                    </button>
                  ))}
                </div>
              </div>

              {tableView === 'map' ? (
                leftView === 'floor' ? (
                  <div className="rounded-xl border border-dashed border-outline-variant p-4 text-center text-sm text-on-surface-variant">
                    <span className="material-symbols-outlined block text-3xl mb-1">west</span>
                    The floor plan is open on the left.
                    <button onClick={() => setLeftView('menu')} className="block mx-auto mt-2 font-semibold text-primary">Back to menu</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <FloorPlanView
                      tables={tablesWithOptimistic}
                      selectedTableId={selectedTableId}
                      onSelectTable={setSelectedTableId}
                      now={now}
                      readyToClear={readyToClear}
                      onShowList={() => setTableView('list')}
                    />
                    <button
                      onClick={() => setLeftView('floor')}
                      className="w-full h-10 rounded-xl bg-white border border-outline-variant text-sm font-semibold text-on-surface flex items-center justify-center gap-2 hover:border-primary hover:text-primary"
                    >
                      <span className="material-symbols-outlined text-[18px]">open_in_full</span>Expand floor plan
                    </button>
                  </div>
                )
              ) : (
              <>
              {/* FIX 7: Responsive grid — 1 col on very small screens, 2 cols from
                  xs upward.  Uses min-w-0 so text truncates instead of overflowing
                  on narrow viewports. */}
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
                {tablesWithOptimistic.map(table => (
                  <button
                    key={table.id}
                    onClick={() => setSelectedTableId(table.id)}
                    className={`p-4 rounded-xl border-2 transition-all text-left min-w-0 ${
                      selectedTableId === table.id
                        ? 'border-primary bg-primary/5'
                        : 'border-transparent hover:bg-white/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0">
                        <TableBadge tableNumber={table.tableNumber} />
                        <p className="text-xs text-on-surface-variant">Capacity: {table.capacity}</p>
                      </div>
                      <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(table.status)}`}>
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">{getStatusIcon(table.status)}</span>
                          {table.status}
                        </span>
                      </span>
                    </div>
                    {table.status === 'occupied' && table.occupiedAt && (
                      <div className="mt-2 flex items-center gap-1 text-[10px] text-red-600 font-medium">
                        <span className="material-symbols-outlined text-xs">timer</span>
                        {(() => {
                          const mins = Math.floor((now - table.occupiedAt) / 60000)
                          return mins > 0 ? `${mins}m ago` : 'Just joined'
                        })()}
                      </div>
                    )}
                    {/* FIX 6: Guard currentOrderId before rendering */}
                    {table.currentOrderId && (
                      <div className="mt-2 pt-2 border-t border-outline-variant">
                        <p className="text-xs text-on-surface-variant truncate">
                          Order:{' '}
                          <span className="font-mono text-primary font-bold">
                            {table.currentOrderId.slice(0, 8)}
                          </span>
                        </p>
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {tablesWithOptimistic.length === 0 && (
                <div className="text-center py-8">
                  <span className="material-symbols-outlined text-on-surface-variant text-4xl mb-2">
                    table_restaurant
                  </span>
                  <p className="text-on-surface-variant">No tables configured</p>
                  <p className="text-sm text-outline mt-1">Add tables in the admin panel</p>
                </div>
              )}
              </>
              )}

              {/* Selected Table Actions — derived from live data, never stale */}
              {selectedTable && (
                <div className="bg-white rounded-xl p-4 border border-surface-container-low">
                  <div className="flex items-center justify-between mb-3">
                    <TableBadge tableNumber={selectedTable.tableNumber} size="lg" />
                    <button
                      onClick={() => setSelectedTableId(null)}
                      className="text-on-surface-variant hover:text-on-surface"
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>

                  {/* Table Info */}
                  <div className="mb-3 p-2 bg-slate-50 rounded-lg">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-on-surface-variant">Capacity</span>
                      <span className="font-medium">{selectedTable.capacity} guests</span>
                    </div>
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-on-surface-variant">QR Code</span>
                      <span className="font-mono text-xs truncate max-w-[140px]">
                        {selectedTable.qrCode}
                      </span>
                    </div>
                  </div>

                  {/* Active Orders for this Table — FIX 6: safe optional access */}
                  {selectedTable.currentOrderId && (() => {
                    const order = getOrderById(selectedTable.currentOrderId)
                    return (
                      <div className="mb-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                        <p className="text-sm font-semibold text-amber-800 mb-2">Active Order</p>
                        {order ? (
                          <div className="space-y-1">
                            <p className="text-xs text-amber-700">
                              <span className="font-mono">{order.id.slice(0, 8)}</span>
                              {' '}• {getOrderStatusLabel(order)}
                            </p>
                            {/* Currency: Philippine Peso */}
                            <p className="text-xs text-amber-600">
                              {order.items.length} items • ₱{order.total.toFixed(2)}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-amber-600">Loading order…</p>
                        )}
                      </div>
                    )
                  })()}

                  <div className="space-y-2">
                    {/* Table actions — each state only offers what makes sense next */}
                    {selectedTable.status === 'available' && (
                      <>
                      <button
                        onClick={() => handleTableStatusChange(selectedTable.id, 'occupied')}
                        className="w-full py-2 px-4 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined">restaurant</span>
                        Seat guests
                      </button>
                      <button
                        onClick={() => handleTableStatusChange(selectedTable.id, 'reserved')}
                        className="w-full py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined">event_seat</span>
                        Reserve
                      </button>
                      </>
                    )}
                    {selectedTable.status === 'occupied' && (
                      <>
                        {readyToClear.has(selectedTable.id) && (
                          <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                            Everything is served and paid — clear the table once the guests leave.
                          </p>
                        )}
                      <button
                        onClick={() => {
                            if (confirm(`Clear Table ${selectedTable.tableNumber}? Only do this after the guests have left.`)) {
                              handleTableStatusChange(selectedTable.id, 'available')
                            }
                          }}
                        className="w-full py-2 px-4 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined">cleaning_services</span>
                        Clear table (guests left)
                      </button>
                      </>
                    )}
                    {selectedTable.status === 'reserved' && (
                      <>
                      <button
                        onClick={() => handleTableStatusChange(selectedTable.id, 'occupied')}
                        className="w-full py-2 px-4 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined">restaurant</span>
                        Seat reserved guests
                      </button>
                      <button
                        onClick={() => handleTableStatusChange(selectedTable.id, 'available')}
                        className="w-full py-2 px-4 bg-zinc-500 hover:bg-zinc-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined">event_busy</span>
                        Cancel reservation
                      </button>
                      </>
                    )}

                    {/* View Order History Button */}
                    <button
                      onClick={() => setShowTableHistory(selectedTable)}
                      className="w-full py-2 px-4 bg-surface-container-high hover:bg-surface-container-highest text-on-surface rounded-lg font-medium transition-colors flex items-center justify-center gap-2 mt-2"
                    >
                      <span className="material-symbols-outlined">history</span>
                      View Order History
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>{/* end tab-content scroll wrapper */}
        </div>{/* end right panel */}
      </div>{/* end two-column body */}

      {/* Clear Orders Confirm Modal */}
      {/* Table Order History Modal */}
      {showTableHistory && (
        <TableOrderHistoryModal
          table={showTableHistory}
          isOpen={!!showTableHistory}
          onClose={() => setShowTableHistory(null)}
        />
      )}

      {/* Payment Modal for QR Orders */}
      {payingOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-outline-variant">
            {qrReceiptTransaction ? (
              /* Receipt View */
              <div className="flex flex-col h-full bg-white">
                <div className="bg-primary text-white p-4 text-center">
                  <span className="material-symbols-outlined text-3xl mb-1">check_circle</span>
                  <h3 className="font-bold text-lg">Transaction Complete</h3>
                  <p className="text-sm opacity-90">{qrReceiptTransaction.id.slice(0, 8)}</p>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  <div className="text-center border-b border-outline-variant pb-3 mb-3">
                    <p className="text-xs text-on-surface-variant">{qrReceiptTransaction.timestamp.toLocaleString()}</p>
                  </div>

                  <div className="flex justify-between items-center text-sm text-on-surface-variant mb-3">
                    <span>{qrReceiptTransaction.orderType === 'takeout' ? 'Takeout Order' : 'Dine-in Order'}</span>
                  </div>
                  <div className="space-y-3">
                    {qrReceiptTransaction.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-base">
                        <span className="text-on-surface font-medium">{item.quantity}x {item.name}</span>
                        <span className="text-on-surface">₱{(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-outline-variant pt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface-variant">Subtotal</span>
                      <span className="text-on-surface">₱{qrReceiptTransaction.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface-variant">Tax</span>
                      <span className="text-on-surface">₱{qrReceiptTransaction.tax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface-variant">Discount</span>
                      <span className="text-on-surface">₱{qrReceiptTransaction.discount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xl font-bold pt-3 border-t border-outline-variant">
                      <span className="text-on-surface">Total</span>
                      <span className="text-primary">₱{qrReceiptTransaction.total.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="bg-surface-container-low rounded-xl p-3 space-y-1 mt-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface-variant">Payment Method</span>
                      <span className="text-on-surface capitalize">{qrReceiptTransaction.paymentMethod}</span>
                    </div>
                    {qrReceiptTransaction.paymentMethod === 'cash' && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-on-surface-variant">Received</span>
                          <span className="text-on-surface">₱{qrReceiptTransaction.paymentReceived.toFixed(2)}</span>
                        </div>
                        {qrReceiptTransaction.change > 0 && (
                          <div className="flex justify-between text-sm font-semibold">
                            <span className="text-on-surface">Change</span>
                            <span className="text-primary">₱{qrReceiptTransaction.change.toFixed(2)}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="p-6 border-t border-outline-variant bg-surface">
                  <button
                    onClick={() => {
                      setPayingOrder(null)
                      setQrReceiptTransaction(null)
                    }}
                    className="w-full py-4 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold transition-colors shadow-sm active:scale-95"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* Payment Flow */
              <>
                <div className="bg-primary text-white p-6 flex justify-between items-start shrink-0">
                  <div>
                    <h2 className="text-2xl font-bold">Process Payment</h2>
                    <p className="text-primary-container text-sm">
                      {payingOrder.orderType === 'takeout' ? 'Takeout' : `Table ${payingOrder.tableNumber}`} • Order {payingOrder.id.slice(0, 8)}
                    </p>
                  </div>
                  <button 
                    onClick={() => setPayingOrder(null)}
                    className="p-2 hover:bg-white/20 rounded-full transition-colors"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto flex flex-col md:flex-row min-h-0 bg-surface">
                  {/* Left Column: Order Summary */}
                  <div className="flex-1 p-6 md:border-r border-outline-variant space-y-6 bg-surface-container-lowest">
                    <div>
                      <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-4">Order Summary</h3>

                      <div className="flex items-center justify-between text-sm text-on-surface-variant mb-4">
                        <span>Order mode</span>
                        <span className="font-semibold text-on-surface">{payingOrder.orderType === 'takeout' ? 'Takeout' : `Table ${payingOrder.tableNumber}`}</span>
                      </div>

                      <div className="space-y-3 mb-6">
                        {payingOrder.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-start">
                            <div className="pr-4">
                              <p className="font-medium text-on-surface">{item.quantity}x {item.name}</p>
                              {item.variantName && <p className="text-xs text-on-surface-variant">{item.variantName}</p>}
                            </div>
                            <span className="font-medium text-on-surface shrink-0">₱{(item.price * item.quantity).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      
                      {/* Totals — same formula as the customer's checkout (Settings tax % + service fee) */}
                      <div className="border-t border-outline-variant pt-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-on-surface-variant">Subtotal</span>
                          <span className="text-on-surface">₱{due!.subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-on-surface-variant">Tax ({due!.taxRate}%)</span>
                          <span className="text-on-surface">₱{due!.tax.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-on-surface-variant">Service fee</span>
                          <span className="text-on-surface">₱{due!.serviceFee.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-end pt-3 border-t border-outline-variant">
                          <span className="text-lg font-bold text-on-surface">Total Due</span>
                          <span className="text-3xl font-bold font-mono text-primary">₱{due!.total.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-2">Payment Method</p>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('cash')}
                          className={`py-3 rounded-xl text-sm font-semibold transition-colors ${paymentMethod === 'cash'
                            ? 'bg-primary text-white'
                            : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
                          }`}
                        >
                          Cash
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('card')}
                          className={`py-3 rounded-xl text-sm font-semibold transition-colors ${paymentMethod === 'card'
                            ? 'bg-primary text-white'
                            : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
                          }`}
                        >
                          Card
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('digital')}
                          className={`py-3 rounded-xl text-sm font-semibold transition-colors ${paymentMethod === 'digital'
                            ? 'bg-primary text-white'
                            : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
                          }`}
                        >
                          Digital
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Payment Input */}
                  <div className="flex-1 p-6 space-y-6 flex flex-col justify-between">
                    <div>
                      <label className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-2 block">
                        Amount Tendered (Cash)
                      </label>
                      <div className="relative mb-4">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant font-mono font-bold text-xl">
                          ₱
                        </span>
                        <input
                          type="number"
                          value={paymentReceivedStr}
                          onChange={(e) => setPaymentReceivedStr(e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-white border-2 border-outline-variant pl-10 pr-4 py-4 rounded-xl font-mono text-2xl font-bold focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                          autoFocus
                        />
                      </div>

                      <div className="grid grid-cols-4 gap-2 mb-6">
                        {[50, 100, 500, 1000].map(amount => (
                          <button
                            key={amount}
                            onClick={() => {
                              const current = parseFloat(paymentReceivedStr) || 0
                              setPaymentReceivedStr((current + amount).toString())
                            }}
                            className="py-3 bg-primary/5 hover:bg-primary/10 rounded-xl font-mono font-bold text-sm transition-colors text-primary border border-primary/20"
                          >
                            +₱{amount}
                          </button>
                        ))}
                        <button
                          onClick={() => setPaymentReceivedStr(due!.total.toFixed(2))}
                          className="col-span-4 py-3 border-2 border-primary text-primary hover:bg-primary/10 rounded-xl font-bold transition-colors"
                        >
                          Exact Amount
                        </button>
                      </div>

                      <div className="bg-surface-container-low p-5 rounded-2xl flex justify-between items-center border border-outline-variant">
                        <span className="font-bold text-on-surface-variant text-lg">Change:</span>
                        <span className={`text-3xl font-mono font-bold ${
                          (parseFloat(paymentReceivedStr) || 0) >= due!.total ? 'text-green-600' : 'text-red-500'
                        }`}>
                          ₱{Math.max(0, (parseFloat(paymentReceivedStr) || 0) - due!.total).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <button
                      disabled={isProcessingPayment || (paymentMethod === 'cash' && (parseFloat(paymentReceivedStr) || 0) < due!.total)}
                      onClick={async () => {
                        const amountDue = due!.total
                        const paymentReceived = paymentMethod === 'cash' ? (parseFloat(paymentReceivedStr) || 0) : amountDue
                        const change = paymentMethod === 'cash' ? Math.max(0, paymentReceived - amountDue) : 0
                        if (paymentMethod === 'cash' && paymentReceived < amountDue) return
                        setIsProcessingPayment(true)
                        try {
                          await processPaymentAndActivateOrder(
                            payingOrder.id,
                            paymentMethod === 'digital' ? 'qrph' : paymentMethod,
                            0,
                            amountDue
                          )
                          const transaction: Transaction = {
                            id: payingOrder.id,
                            items: payingOrder.items,
                            subtotal: due!.subtotal,
                            tax: due!.tax,
                            discount: 0,
                            total: amountDue,
                            paymentReceived,
                            change,
                            timestamp: new Date(),
                            paymentMethod,
                            orderType: payingOrder.orderType
                          }
                          addTransaction(transaction)
                          setQrReceiptTransaction(transaction)
                        } catch (error) {
                          console.error('Error processing QR payment:', error)
                          alert('Failed to process payment. Check console.')
                        } finally {
                          setIsProcessingPayment(false)
                        }
                      }}
                      className={`w-full py-5 rounded-2xl font-bold text-xl transition-all flex justify-center items-center gap-2 shadow-sm ${
                        isProcessingPayment || (paymentMethod === 'cash' && (parseFloat(paymentReceivedStr) || 0) < due!.total)
                          ? 'bg-surface-variant text-on-surface-variant cursor-not-allowed opacity-70'
                          : 'bg-primary text-white hover:bg-primary/90 active:scale-95 hover:shadow-lg hover:shadow-primary/20'
                      }`}
                    >
                      {isProcessingPayment ? (
                        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-2xl">check_circle</span>
                          Confirm Payment
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function CashierPage() {
  return (
    <CartProvider>
      <CashierContent />
    </CartProvider>
  )
}
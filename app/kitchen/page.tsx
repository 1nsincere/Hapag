'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useSession, signOut as nextAuthSignOut } from 'next-auth/react'
import { signOut as firebaseSignOut } from 'firebase/auth'
import { db, auth } from '@/lib/firebase'
import { playChime } from '@/lib/chime'
import { stageOf } from '@/lib/orderFlow'
import { StaffGuide } from '@/app/components/StaffGuide'
import { TableBadge } from '@/app/components/atoms/TableBadge'
import {
  collection, query, where, orderBy, limit,
  getDocs, startAfter, onSnapshot, QueryDocumentSnapshot
} from 'firebase/firestore'
import {
  listenToOrders,
  listenToSettings,
  listenToTables,
  updateOrderStatus,
  markOrderServed,
  Order,
  OrderStatus,
  AppSettings,
  DEFAULT_SETTINGS,
  Table,
  TableStatus,
} from '@/lib/data'

// --- Types --------------------------------------------------------------------
interface ToastItem {
  id: string
  message: string
  onUndo?: () => void
  duration?: number
}

// --- Constants ----------------------------------------------------------------
const LIVE_PAGE_SIZE = 9
const HISTORY_PAGE_SIZE = 20

const STATUS_COLORS: Record<OrderStatus, string> = {
  'pending': 'border-slate-200',
  'accepted': 'border-slate-200',
  'preparing': 'border-slate-200',
  'in-progress': 'border-blue-400',
  'ready': 'border-green-400',
  'served': 'border-slate-200 opacity-60',
}

const STATUS_HEADER: Record<OrderStatus, string> = {
  'pending': 'bg-slate-50',
  'accepted': 'bg-slate-50',
  'preparing': 'bg-slate-50',
  'in-progress': 'bg-blue-50',
  'ready': 'bg-green-50',
  'served': 'bg-slate-50',
}

const STATUS_BG: Record<OrderStatus, string> = {
  'pending': 'bg-white',
  'accepted': 'bg-white',
  'preparing': 'bg-white',
  'in-progress': 'bg-[#eff6ff]',
  'ready': 'bg-[#f0fdf4]',
  'served': 'bg-white',
}

// --- Helpers ------------------------------------------------------------------
type UrgencyLevel = 'all' | 'urgent' | 'warning' | 'normal'

function getUrgency(createdAt: number, targetMs: number): 'urgent' | 'warning' | 'normal' {
  const ms = Date.now() - createdAt
  if (ms > targetMs) return 'urgent'
  if (ms > targetMs * 0.75) return 'warning'
  return 'normal'
}

function TargetTimer({ createdAt, status, targetMs, isUrgent }: { createdAt: number; status: OrderStatus; targetMs: number; isUrgent: boolean }) {
  const [timeStr, setTimeStr] = useState('')
  useEffect(() => {
    if (status === 'served') return
    const update = () => {
      const elapsed = Date.now() - createdAt
      const left = targetMs - elapsed
      const absLeft = Math.abs(left)
      const m = Math.floor(absLeft / 60000).toString().padStart(2, '0')
      const s = Math.floor((absLeft % 60000) / 1000).toString().padStart(2, '0')
      setTimeStr(`${left < 0 ? '-' : ''}${m}:${s}`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [createdAt, status, targetMs])
  return <span className={isUrgent ? 'text-red-600 font-black' : ''}>{timeStr}</span>
}

function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map(t => (
        <UndoToast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function UndoToast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [progress, setProgress] = useState(100)
  const duration = toast.duration || 5000

  useEffect(() => {
    const start = Date.now()
    const id = setInterval(() => {
      const elapsed = Date.now() - start
      const pct = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(pct)
      if (pct <= 0) {
        clearInterval(id)
        onDismiss(toast.id)
      }
    }, 50)
    return () => clearInterval(id)
  }, [toast.id, duration, onDismiss])

  return (
    <div className="bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-4 min-w-[280px] animate-in fade-in slide-in-from-right-4 pointer-events-auto border border-white/10">
      <div className="flex-1">
        <p className="text-sm font-medium">{toast.message}</p>
        <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
          <div className="h-full bg-primary transition-all duration-75" style={{ width: `${progress}%` }} />
        </div>
      </div>
      {toast.onUndo && (
        <button
          onClick={() => {
            toast.onUndo?.()
            onDismiss(toast.id)
          }}
          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
        >
          Undo
        </button>
      )}
      <button onClick={() => onDismiss(toast.id)} className="text-white/40 hover:text-white transition-colors">
        <span className="material-symbols-outlined text-sm">close</span>
      </button>
    </div>
  )
}

// ─── Hold-to-confirm button ───────────────────────────────────────────────────
function HoldToConfirm({ onConfirm, label }: { onConfirm: () => void; label: string }) {
  const [holding, setHolding] = useState(false)
  const [progress, setProgress] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startRef = useRef<number>(0)
  const holdDuration = 1200

  const startHold = useCallback(() => {
    setHolding(true)
    startRef.current = Date.now()
    timerRef.current = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - startRef.current) / holdDuration) * 100)
      setProgress(pct)
      if (pct >= 100) {
        clearInterval(timerRef.current!)
        setHolding(false)
        setProgress(0)
        onConfirm()
      }
    }, 30)
  }, [onConfirm])

  const cancelHold = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    setHolding(false)
    setProgress(0)
  }, [])

  useEffect(() => {
    if (holding && 'vibrate' in navigator) {
      navigator.vibrate(50)
    }
  }, [holding])

  return (
    <div className="space-y-2">
      <button
        onMouseDown={startHold}
        onMouseUp={cancelHold}
        onMouseLeave={cancelHold}
        onTouchStart={(e) => { e.preventDefault(); startHold() }}
        onTouchEnd={(e) => { e.preventDefault(); cancelHold() }}
        onTouchCancel={cancelHold}
        className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg uppercase tracking-wider text-sm transition-all relative overflow-hidden select-none active:scale-[0.98]"
        style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
        aria-label={`Hold to confirm: ${label}`}
      >
        <div
          className="absolute inset-0 bg-green-400 origin-left transition-none"
          style={{ transform: `scaleX(${progress / 100})` }}
        />
        <span className="relative flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-sm">
            {holding ? 'radio_button_checked' : 'check_circle'}
          </span>
          {holding ? `Hold to confirm… (${Math.round(progress)}%)` : `${label} — Hold to confirm`}
        </span>
      </button>
      <p className="text-center text-[10px] text-slate-400 font-medium">
        Table stays occupied — customer still needs to pay
      </p>
    </div>
  )
}

// ─── Connection status banner ─────────────────────────────────────────────────
function OfflineBanner({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="fixed top-0 left-0 w-full z-50 bg-red-600 text-white text-sm font-semibold text-center py-2 flex items-center justify-center gap-2">
      <span className="material-symbols-outlined text-base">wifi_off</span>
      Connection lost — orders may be out of date. Reconnecting…
    </div>
  )
}

// ─── Live clock ───────────────────────────────────────────────────────────────
function LiveClock({ now }: { now: number }) {
  const d = new Date(now)
  return (
    <div className="text-right">
      {/* The clock ticks between server render and page load — that difference is expected */}
      <p className="text-primary leading-none text-2xl font-black" suppressHydrationWarning>
        {d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
      </p>
      <p className="text-sm text-slate-400" suppressHydrationWarning>
        {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>
    </div>
  )
}

// ─── KitchenView type — now includes 'tables' ────────────────────────────────
type KitchenView = 'live' | 'history' | 'tables'

// --- Page ---------------------------------------------------------------------
function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

// ─── Kitchen user info with sign-out ──────────────────────────────────────
function KitchenUserInfo() {
  const { data: session } = useSession()
  return (
    <div className="flex items-center gap-3 p-3 bg-slate-200/50 rounded-xl">
      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">
        {session?.user?.name?.[0]?.toUpperCase() || session?.user?.email?.[0]?.toUpperCase() || 'K'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-slate-900 truncate">{session?.user?.name || session?.user?.email || 'Kitchen'}</p>
        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{session?.user?.role || 'Staff'}</p>
        <button
          onClick={async () => {
            try { await firebaseSignOut(auth) } catch(e){}
            await nextAuthSignOut({ callbackUrl: '/login' })
          }}
          className="text-[10px] text-red-500 hover:text-red-700 font-medium"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}

export default function KitchenPage() {
  const now = useNow(1000)
  const [orders, setOrders] = useState<Order[]>([])
  const [view, setView] = useState<KitchenView>('live')
  const [guideOpen, setGuideOpen] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  // ── MIGRATED: Tables state ────────────────────────────────────────────────
  const [tables, setTables] = useState<Table[]>([])

  // Filtering & Sorting
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'all'>('all')
  const [sortBy, setSortBy] = useState<'time' | 'table' | 'urgent'>('time')
  const [tableFilter, setTableFilter] = useState('')
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyLevel>('all')

  // Toasts & Offline
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [offline, setOffline] = useState(false)

  const addToast = useCallback((message: string, onUndo?: () => void) => {
    const id = Math.random().toString(36).slice(2, 9)
    setToasts(prev => [...prev, { id, message, onUndo }])
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // History State
  const [historyOrders, setHistoryOrders] = useState<Order[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [hasMoreHistory, setHasMoreHistory] = useState(true)
  // lastDocRef / loadingRef / hasMoreRef are used only by the "load more" paginator
  const lastDocRef = useRef<QueryDocumentSnapshot | null>(null)
  const loadingRef = useRef(false)
  const hasMoreRef = useRef(true)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // Live Infinite Scroll State
  const [visibleCount, setVisibleCount] = useState(LIVE_PAGE_SIZE)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [newTicketCount, setNewTicketCount] = useState(0)
  const liveSentinelRef = useRef<HTMLDivElement | null>(null)
  const liveObserverRef = useRef<IntersectionObserver | null>(null)
  const gridContainerRef = useRef<HTMLDivElement | null>(null)
  const prevFilterKeyRef = useRef('')

  // UI States
  const [checkedItems, setCheckedItems] = useState<Record<string, Record<string, boolean>>>({})
  const [flashingOrders, setFlashingOrders] = useState<Set<string>>(new Set())
  const prevLiveIdsRef = useRef<Set<string>>(new Set())

  const targetPrepTimeMs = parseInt(settings.targetPrepTime || '15') * 60 * 1000

  // ── MIGRATED: Added listenToTables alongside existing listeners ───────────
  useEffect(() => {
    const unsubOrders = listenToOrders(setOrders)
    const unsubSettings = listenToSettings(setSettings)
    const unsubTables = listenToTables(setTables)
    return () => {
      unsubOrders()
      unsubSettings()
      unsubTables()
    }
  }, [])

  // --- Computed Orders --------------------------------------------------------
  const liveOrders = useMemo(() => {
    let filtered = orders.filter(o => o.status !== 'served' && o.status !== 'pending' && o.status !== 'accepted')

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(o =>
        o.id.toLowerCase().includes(q) ||
        o.tableNumber.toString().includes(q) ||
        o.items.some(i => i.name.toLowerCase().includes(q))
      )
    }

    if (tableFilter.trim() !== '') {
      filtered = filtered.filter(o => String(o.tableNumber) === tableFilter.trim())
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter(o => o.status === selectedStatus)
    }

    if (urgencyFilter !== 'all') {
      filtered = filtered.filter(o => getUrgency(o.createdAt, targetPrepTimeMs) === urgencyFilter)
    }

    filtered.sort((a, b) => {
      if (sortBy === 'urgent') {
        const aUrgent = now - a.createdAt > targetPrepTimeMs
        const bUrgent = now - b.createdAt > targetPrepTimeMs
        if (aUrgent && !bUrgent) return -1
        if (!aUrgent && bUrgent) return 1
      }
      if (sortBy === 'table') {
        return a.tableNumber - b.tableNumber
      }
      return a.createdAt - b.createdAt
    })

    return filtered
  }, [orders, searchQuery, selectedStatus, tableFilter, urgencyFilter, sortBy, now, targetPrepTimeMs])

  const filteredOrders = liveOrders

  const hasActiveFilter = searchQuery || tableFilter.trim() !== '' || selectedStatus !== 'all' || urgencyFilter !== 'all'

  const clearFilters = useCallback(() => {
    setSearchQuery('')
    setTableFilter('')
    setSelectedStatus('all')
    setUrgencyFilter('all')
  }, [])

  const visibleOrders = useMemo(() => liveOrders.slice(0, visibleCount), [liveOrders, visibleCount])
  const allLoaded = visibleCount >= liveOrders.length

  useEffect(() => {
    const key = `${tableFilter}|${selectedStatus}|${urgencyFilter}|${searchQuery}`
    if (key === prevFilterKeyRef.current) return
    prevFilterKeyRef.current = key
    setVisibleCount(LIVE_PAGE_SIZE)
    setNewTicketCount(0)
    gridContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [tableFilter, selectedStatus, urgencyFilter, searchQuery])

  useEffect(() => {
    const currentIds = new Set(orders.filter(o => o.status !== 'served').map(o => o.id))
    const newIds = orders.filter(o => o.status === 'preparing' && !prevLiveIdsRef.current.has(o.id) && prevLiveIdsRef.current.size > 0)

    if (newIds.length > 0) {
      playChime()
      setFlashingOrders(new Set(newIds.map(o => o.id)))
      setTimeout(() => setFlashingOrders(new Set()), 5000)

      const scrollTop = window.scrollY || document.documentElement.scrollTop
      if (scrollTop > 300) {
        setNewTicketCount(c => c + newIds.length)
      }
    }
    prevLiveIdsRef.current = currentIds
  }, [orders])

  useEffect(() => {
    if (view !== 'live') return
    liveObserverRef.current?.disconnect()

    if (allLoaded || isLoadingMore) {
      liveObserverRef.current = null
      return
    }

    liveObserverRef.current = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setIsLoadingMore(true)
        setTimeout(() => {
          setVisibleCount(c => c + LIVE_PAGE_SIZE)
          setIsLoadingMore(false)
        }, 400)
      },
      { root: null, rootMargin: '0px 0px 400px 0px', threshold: 0.01 }
    )

    if (liveSentinelRef.current) {
      liveObserverRef.current.observe(liveSentinelRef.current)
    }

    return () => liveObserverRef.current?.disconnect()
  }, [visibleCount, allLoaded, isLoadingMore, view])

  // ── Real-time listener for Order History ──────────────────────────────────
  // Seeds the initial list AND keeps it live — any order marked "served"
  // anywhere (kitchen, cashier) appears here instantly.
  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('status', '==', 'served'),
      orderBy('createdAt', 'desc'),
      limit(HISTORY_PAGE_SIZE)
    )

    setIsLoadingHistory(true)
    const unsub = onSnapshot(
      q,
      snap => {
        const incoming = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))
        // Store the last cursor so pagination can continue from here
        if (snap.docs.length > 0) lastDocRef.current = snap.docs[snap.docs.length - 1]
        setHistoryOrders(prev => {
          // Merge: keep any older pages the user already loaded, update/prepend new docs
          const existingIds = new Set(incoming.map(o => o.id))
          const olderPages = prev.filter(o => !existingIds.has(o.id))
          return [...incoming, ...olderPages]
        })
        setHasMoreHistory(snap.docs.length === HISTORY_PAGE_SIZE)
        hasMoreRef.current = snap.docs.length === HISTORY_PAGE_SIZE
        setIsLoadingHistory(false)
      },
      err => {
        console.error('[History] Real-time listener error:', err)
        setIsLoadingHistory(false)
      }
    )
    return () => unsub()
  }, []) // runs once on mount — listener stays alive for the page lifetime

  // ── "Load more" paginator — fetches pages older than the live window ───────
  const fetchHistoryOrders = useCallback(async (isNextPage: boolean) => {
    if (!isNextPage) return // first page is handled by the live listener above
    if (loadingRef.current || !hasMoreRef.current) return
    loadingRef.current = true
    setIsLoadingHistory(true)
    try {
      const constraints = [
        where('status', '==', 'served'),
        orderBy('createdAt', 'desc'),
        limit(HISTORY_PAGE_SIZE),
        ...(lastDocRef.current ? [startAfter(lastDocRef.current)] : []),
      ]
      const snap = await getDocs(query(collection(db, 'orders'), ...constraints))
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))
      const more = snap.docs.length === HISTORY_PAGE_SIZE
      hasMoreRef.current = more
      setHasMoreHistory(more)
      if (snap.docs.length > 0) lastDocRef.current = snap.docs[snap.docs.length - 1]
      setHistoryOrders(prev => [...prev, ...fetched])
    } catch (err) {
      console.error('[History] Fetch error:', err)
    } finally {
      loadingRef.current = false
      setIsLoadingHistory(false)
    }
  }, [])

  // ── History scroll sentinel — loads older pages when user scrolls down ──────
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect()

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMoreHistory && !isLoadingHistory) {
          fetchHistoryOrders(true)
        }
      },
      { root: null, rootMargin: '0px 0px 200px 0px', threshold: 0.01 }
    )

    // Observe the sentinel if it's already in the DOM
    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current)
    }

    return () => observerRef.current?.disconnect()
  }, [hasMoreHistory, isLoadingHistory, fetchHistoryOrders])

  const advance = useCallback(async (order: Order) => {
    const nextMap: Record<OrderStatus, OrderStatus> = {
      'pending': 'preparing',
      'accepted': 'preparing',
      'preparing': 'in-progress',
      'in-progress': 'ready',
      'ready': 'served',
      'served': 'served',
    }
    const nextStatus = nextMap[order.status]
    const prevStatus = order.status
    const statusLabels = Object.fromEntries(
      (['pending', 'accepted', 'preparing', 'in-progress', 'ready', 'served'] as OrderStatus[]).map(st => [st, stageOf(st).label])
    ) as Record<OrderStatus, string>

    try {
      if (nextStatus === 'served') {
        await markOrderServed(order.id)
      } else {
        await updateOrderStatus(order.id, nextStatus)
      }

      addToast(
        `Table ${order.tableNumber} → ${statusLabels[nextStatus]}`,
        async () => {
          await updateOrderStatus(order.id, prevStatus)
        }
      )
    } catch (err) {
      console.error('[Advance] Error:', err)
    }
  }, [addToast])

  const avgPrepMin = useMemo(() => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
    const recentServed = orders.filter(o => o.status === 'served' && (o as any).updatedAt > twoHoursAgo)
    if (recentServed.length === 0) return null
    return Math.round(
      recentServed.reduce((sum, o) => sum + ((o as any).updatedAt - o.createdAt), 0) / recentServed.length / 60000
    )
  }, [orders])

  // Only count tickets the kitchen can act on (paid: In queue / Cooking / Ready) — not new or unpaid orders
  const kitchenTickets = orders.filter(o => o.status === 'preparing' || o.status === 'in-progress' || o.status === 'ready')
  const activeCount = kitchenTickets.length
  const pendingItems = kitchenTickets.reduce((sum, o) => sum + o.items.reduce((n, i) => n + i.quantity, 0), 0)

  // --- Render -----------------------------------------------------------------
  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        .skeleton-shimmer {
          background: linear-gradient(90deg, #e8e8e8 25%, #f5f5f5 50%, #e8e8e8 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite linear;
          border-radius: 4px;
        }
      `}</style>

      <div className="bg-background min-h-screen font-sans">

        {/* ── MIGRATED: Sidebar — added Table Status nav item ──────────────── */}
        <aside className="hidden md:flex h-screen w-64 fixed left-0 top-0 bg-slate-50 border-r-2 border-slate-200 flex-col py-6 gap-2 z-40">
          <div className="px-6 mb-8">
            <h1 className="text-lg font-black text-slate-900">Kitchen KDS</h1>
            <p className="text-slate-500 text-xs uppercase tracking-widest font-bold">
              Station: {settings.stationName}
            </p>
          </div>
          <nav className="flex-1 space-y-1">
            {([
              { key: 'live',    icon: 'monitor_heart',    label: 'Live Feed' },
              { key: 'history', icon: 'history',           label: 'Order History' },
              { key: 'tables',  icon: 'table_restaurant',  label: 'Table Status' },
            ] as { key: KitchenView; icon: string; label: string }[]).map(item => (
              <button
                key={item.key}
                onClick={() => setView(item.key)}
                className={`flex items-center gap-3 w-full px-6 py-3 text-sm font-medium transition-all duration-200 ${
                  view === item.key
                    ? 'bg-white text-primary border-r-4 border-primary shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:pl-8'
                }`}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="px-6 mt-auto">
            <KitchenUserInfo />
          </div>
        </aside>

        {/* Top bar */}
        <header className="md:ml-64 sticky top-0 bg-white/90 backdrop-blur-md border-b border-slate-100 px-6 py-3 flex justify-between items-center z-30">
          <div className="flex items-center gap-4">
            <h2 className="text-primary font-extrabold tracking-tight text-xl">
              {settings.restaurantName}
            </h2>
            <div className="hidden sm:flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm text-slate-600 uppercase tracking-wide">Live</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setGuideOpen(true)}
              className="hidden sm:flex items-center gap-1.5 h-10 px-3 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              <span className="material-symbols-outlined">help</span>How it works
            </button>
            <LiveClock now={now} />
          </div>
        </header>
        <StaffGuide open={guideOpen} onClose={() => setGuideOpen(false)} role="kitchen" />

        <main className="md:ml-64 p-4 md:p-8">

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Active Tickets', value: activeCount, color: 'text-slate-900' },
              { label: 'Avg. Prep Time', value: avgPrepMin != null ? `${avgPrepMin}m` : '—', color: 'text-primary' },
              { label: 'Items Pending', value: pendingItems, color: 'text-slate-900' },
              { label: 'Station Status', value: 'Optimal', color: 'text-green-700', badge: true },
            ].map(stat => (
              <div key={stat.label} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <p className="text-xs text-slate-400 uppercase mb-1 tracking-wide">{stat.label}</p>
                {stat.badge
                  ? <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded uppercase font-bold">{stat.value}</span>
                  : <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                }
              </div>
            ))}
          </div>

          {/* ── Live Feed ─────────────────────────────────────────────────────── */}
          {view === 'live' && (
            <div ref={gridContainerRef} className="relative">

              <div className="mb-4 flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-blue-500 mt-0.5 flex-shrink-0">info</span>
                <p className="text-xs text-blue-700 font-medium leading-relaxed">
                  <strong>Kitchen flow:</strong> every ticket here is already paid.
                  Tap <strong>Start cooking</strong> → <strong>Mark ready</strong> when plated → <strong>Mark served</strong> once it reaches the table.
                  Mis-tapped? Use <strong>Undo</strong> on the message that pops up.
                </p>
              </div>

              <div className="sticky top-[61px] z-20 mb-6 flex flex-wrap items-center gap-2 p-3 bg-white border border-slate-200 rounded-xl shadow-md">

                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold select-none">
                    Table
                  </span>
                  <input
                    id="kitchen-table-filter"
                    type="text"
                    inputMode="numeric"
                    placeholder="#"
                    value={tableFilter}
                    onChange={e => setTableFilter(e.target.value.replace(/\D/g, ''))}
                    className="pl-12 pr-2 py-1.5 w-24 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                </div>

                <div className="h-7 w-px bg-slate-200" />

                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold mr-1">Status</span>
                  {(['all', 'preparing', 'in-progress', 'ready'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setSelectedStatus(s)}
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide transition-all ${selectedStatus === s
                          ? s === 'all' ? 'bg-slate-800 text-white'
                            : s === 'preparing' ? 'bg-orange-500 text-white'
                              : s === 'in-progress' ? 'bg-blue-600 text-white'
                                : 'bg-green-600 text-white'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                    >
                      {s === 'all' ? 'All' : stageOf(s).label}
                    </button>
                  ))}
                </div>

                <div className="h-7 w-px bg-slate-200" />

                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold mr-1">Urgency</span>
                  {(['all', 'urgent', 'warning', 'normal'] as const).map(u => (
                    <button
                      key={u}
                      onClick={() => setUrgencyFilter(u as UrgencyLevel)}
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide transition-all ${urgencyFilter === u
                          ? u === 'all' ? 'bg-slate-800 text-white'
                            : u === 'urgent' ? 'bg-red-500 text-white'
                              : u === 'warning' ? 'bg-amber-500 text-white'
                                : 'bg-slate-500 text-white'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                    >
                      {u === 'urgent' ? '🔴 Urgent' : u === 'warning' ? '🟡 Warning' : u === 'normal' ? '🟢 Normal' : 'All'}
                    </button>
                  ))}
                </div>

                {hasActiveFilter && (
                  <button
                    onClick={clearFilters}
                    className="ml-auto flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                    Clear all
                  </button>
                )}
              </div>

              {liveOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                  <span className="material-symbols-outlined text-6xl mb-4">restaurant</span>
                  <h3 className="text-2xl font-bold text-slate-700 mb-2">All caught up!</h3>
                  <p className="text-base">No active orders right now.</p>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                  <span className="material-symbols-outlined text-5xl mb-4">filter_list_off</span>
                  <p className="text-base font-medium text-slate-600">No orders match your filters.</p>
                  <button
                    onClick={clearFilters}
                    className="mt-3 text-sm text-primary hover:underline font-semibold"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {visibleOrders.map(order => {
                      const isUrgent = getUrgency(order.createdAt, targetPrepTimeMs) === 'urgent'
                      const isWarning = getUrgency(order.createdAt, targetPrepTimeMs) === 'warning'
                      const isInProg = order.status === 'in-progress'
                      const isReady = order.status === 'ready'
                      const isFlashing = flashingOrders.has(order.id)

                      const cardBorder = isUrgent ? 'border-red-500'
                        : isWarning ? 'border-amber-400'
                          : STATUS_COLORS[order.status]

                      const cardBg = isFlashing ? 'bg-orange-100 animate-pulse'
                        : isUrgent || isWarning ? 'bg-white' : STATUS_BG[order.status]

                      const headerBg = isFlashing ? 'bg-orange-200'
                        : isUrgent ? 'bg-red-50'
                          : isWarning ? 'bg-amber-50'
                            : STATUS_HEADER[order.status]

                      const statusBarColor = isUrgent ? 'bg-red-500 animate-pulse'
                        : isWarning ? 'bg-amber-400'
                          : isInProg ? 'bg-blue-400'
                            : isReady ? 'bg-green-400'
                              : 'bg-slate-200'

                      return (
                        <div
                          key={order.id}
                          className={`flex flex-col ${cardBg} rounded-lg border-2 ${cardBorder} overflow-hidden shadow-sm transition-all`}
                        >
                          <div className={`h-1.5 w-full ${statusBarColor}`} />

                          <div className={`p-3 border-b border-slate-100 flex justify-between items-start ${headerBg}`}>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <div className="flex items-center gap-1.5">
                                  <TableBadge tableNumber={order.tableNumber} size="lg" />
                                  {(() => {
                                    const table = tables.find(t => t.tableNumber === order.tableNumber)
                                    if (!table) return null
                                    return (
                                      <div 
                                        className={`w-2.5 h-2.5 rounded-full border border-white shadow-sm ${
                                          table.status === 'available' ? 'bg-emerald-500' : 
                                          table.status === 'occupied' ? 'bg-red-500 animate-pulse' : 
                                          'bg-blue-500'
                                        }`}
                                        title={`Table ${table.status}`}
                                      />
                                    )
                                  })()}
                                </div>
                                {isInProg && (
                                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-bold rounded uppercase tracking-wide">
                                    👨‍🍳 Prep
                                  </span>
                                )}
                                {isReady && (
                                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[9px] font-bold rounded uppercase tracking-wide">
                                    ✓ Ready
                                  </span>
                                )}
                              </div>
                              <p className={`text-[10px] uppercase font-semibold mt-1 tracking-wider ${isUrgent ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-slate-400'
                                }`}>
                                {isUrgent ? 'URGENT ' : isWarning ? 'LATE ' : ''}#{order.id.slice(0, 5)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-black text-xl tabular-nums leading-none mb-0.5">
                                <TargetTimer createdAt={order.createdAt} status={order.status} targetMs={targetPrepTimeMs} isUrgent={isUrgent} />
                              </p>
                              <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Remaining</p>
                            </div>
                          </div>

                          <div className="p-3 flex-1 space-y-2">
                            <ul className="space-y-1.5">
                              {order.items.map(item => {
                                const isChecked = checkedItems[order.id]?.[item.id] || false
                                return (
                                  <li
                                    key={item.id}
                                    className="flex gap-2 items-start cursor-pointer group"
                                    onClick={() => {
                                      setCheckedItems(prev => ({
                                        ...prev,
                                        [order.id]: {
                                          ...(prev[order.id] || {}),
                                          [item.id]: !isChecked
                                        }
                                      }))
                                    }}
                                  >
                                    <button className={`w-5 h-5 mt-0.5 flex items-center justify-center rounded transition-all flex-shrink-0 ${isChecked
                                        ? 'bg-green-500 text-white'
                                        : 'bg-slate-100 border border-slate-300 group-hover:border-slate-400'
                                      }`}>
                                      {isChecked && <span className="material-symbols-outlined text-[14px] font-bold">check</span>}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex gap-1.5 items-baseline">
                                        <span className={`font-bold text-sm ${isChecked ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                          {item.quantity}x
                                        </span>
                                        <span className={`font-semibold text-sm truncate ${isChecked ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                          {item.name}
                                        </span>
                                      </div>
                                      {item.variantName && (
                                        <span className={`block text-xs ${isChecked ? 'text-slate-300' : 'text-slate-500'}`}>
                                          ({item.variantName})
                                        </span>
                                      )}
                                    </div>
                                  </li>
                                )
                              })}
                            </ul>
                            {order.specialInstructions && (
                              <div className="bg-amber-50 p-2.5 rounded-lg border-l-4 border-amber-400 mt-3">
                                <p className="text-[10px] text-amber-700 uppercase mb-0.5 font-bold">Special Instructions</p>
                                <p className="text-xs text-amber-900 font-bold italic">
                                  &quot;{order.specialInstructions}&quot;
                                </p>
                              </div>
                            )}
                          </div>

                          <div className={`p-2 border-t border-slate-100 ${isInProg ? 'bg-blue-50' : isReady ? 'bg-green-50' : 'bg-slate-50'
                            }`}>
                            {(order.status === 'preparing' || (order.status as any) === 'new') && (
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => advance(order)}
                                  className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded uppercase tracking-wider text-[10px] active:scale-95 transition-all"
                                >
                                  Start cooking
                                </button>
                                {isUrgent && (
                                  <button
                                    onClick={async () => {
                                      try {
                                        await updateOrderStatus(order.id, 'ready')
                                        addToast(`Table ${order.tableNumber} → Ready (Rushed)`)
                                      } catch (err) {
                                        console.error('Rush failed:', err)
                                      }
                                    }}
                                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded uppercase tracking-wider text-[10px] active:scale-95 transition-all flex items-center justify-center gap-1"
                                    title="Rush to Ready"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">flash_on</span>
                                    Ready
                                  </button>
                                )}
                              </div>
                            )}
                            {order.status === 'in-progress' && (
                              <button
                                onClick={() => advance(order)}
                                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded uppercase tracking-wider text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5"
                              >
                                {isUrgent && <span className="material-symbols-outlined text-[14px]">priority_high</span>}
                                Mark ready
                              </button>
                            )}
                            {order.status === 'ready' && (
                              <button
                                onClick={() => advance(order)}
                                className="w-full py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded uppercase tracking-wider text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5"
                              >
                                <span className="material-symbols-outlined text-sm">check_circle</span>
                                Mark served
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {isLoadingMore && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mt-6">
                      {[0, 1, 2].map(i => (
                        <div
                          key={i}
                          className="flex flex-col bg-white rounded-xl border-2 border-slate-200 overflow-hidden shadow-sm"
                          style={{ minHeight: 280 }}
                        >
                          <div className="h-1.5 w-full skeleton-shimmer" />
                          <div className="p-4 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                            <div className="space-y-2 flex-1">
                              <div className="skeleton-shimmer h-5 w-2/5" />
                              <div className="skeleton-shimmer h-3 w-1/4" />
                            </div>
                            <div className="skeleton-shimmer h-8 w-1/5 ml-4" />
                          </div>
                          <div className="p-4 flex-1 space-y-3">
                            {[0, 1, 2].map(j => (
                              <div key={j} className="flex gap-3 items-center">
                                <div className="skeleton-shimmer w-7 h-7 flex-shrink-0 rounded-lg" />
                                <div className="skeleton-shimmer h-4 flex-1" style={{ width: `${60 + j * 10}%` }} />
                              </div>
                            ))}
                          </div>
                          <div className="p-3 bg-slate-50 border-t border-slate-100">
                            <div className="skeleton-shimmer h-11 w-full rounded-lg" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!allLoaded && !isLoadingMore && (
                    <div ref={liveSentinelRef} className="h-1 w-full" aria-hidden="true" />
                  )}

                  {allLoaded && filteredOrders.length > LIVE_PAGE_SIZE && (
                    <p className="text-center text-xs text-slate-400 py-6">
                      All active tickets loaded · {filteredOrders.length} total
                    </p>
                  )}
                </>
              )}

              {newTicketCount > 0 && (
                <button
                  onClick={() => {
                    setNewTicketCount(0)
                    setVisibleCount(LIVE_PAGE_SIZE)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="sticky bottom-6 mx-auto flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-full shadow-lg transition-all active:scale-95 z-20"
                  style={{ width: 'fit-content', display: 'flex' }}
                >
                  ↑ {newTicketCount} new ticket{newTicketCount !== 1 ? 's' : ''} — tap to go to top
                </button>
              )}

            </div>
          )}

          {/* ── Order History ──────────────────────────────────────────────────── */}
          {view === 'history' && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-slate-900">Order History</h2>

              <div className="overflow-y-scroll overscroll-contain max-h-[calc(100vh-280px)] min-h-0 space-y-3 pr-1">

                {historyOrders.length === 0 && isLoadingHistory && (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <span className="material-symbols-outlined text-4xl mb-3 animate-spin">progress_activity</span>
                    <p className="text-sm font-medium">Loading order history…</p>
                  </div>
                )}

                {historyOrders.length === 0 && !isLoadingHistory && (
                  <div className="text-center py-16 text-slate-400">
                    <span className="material-symbols-outlined text-5xl mb-3 block">history</span>
                    <p>No served orders yet.</p>
                  </div>
                )}

                {historyOrders.map(order => (
                  <div
                    key={order.id}
                    className="bg-white rounded-xl border border-slate-100 p-4 flex items-center justify-between shadow-sm"
                  >
                    <div>
                      <p className="font-bold text-slate-900 flex items-center gap-2">
                        <TableBadge tableNumber={order.tableNumber} size="sm" />
                        <span className="font-mono text-sm text-slate-600">#{order.id.slice(0, 6)}</span>
                      </p>
                      <p className="text-sm text-slate-500">
                        {order.items.length} items · ₱{order.total.toFixed(2)}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(order.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full uppercase block mb-1">
                        Food Delivered
                      </span>
                      <span className="text-[10px] text-slate-400">Awaiting payment</span>
                    </div>
                  </div>
                ))}

                <div
                  ref={el => {
                    sentinelRef.current = el
                    if (el && observerRef.current) observerRef.current.observe(el)
                  }}
                  className="flex items-center justify-center h-12"
                  aria-hidden="true"
                >
                  {isLoadingHistory && historyOrders.length > 0 && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                      <span className="text-sm">Loading more…</span>
                    </div>
                  )}
                  {!hasMoreHistory && historyOrders.length > 0 && (
                    <p className="text-xs text-slate-400">All orders loaded</p>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* ── MIGRATED: Table Status view ───────────────────────────────────── */}
          {view === 'tables' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">Table Status</h2>
                <div className="flex gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-emerald-500 rounded-full" />
                    <span className="text-slate-600">
                      Available ({tables.filter(t => t.status === 'available').length})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full" />
                    <span className="text-slate-600">
                      Occupied ({tables.filter(t => t.status === 'occupied').length})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full" />
                    <span className="text-slate-600">
                      Reserved ({tables.filter(t => t.status === 'reserved').length})
                    </span>
                  </div>
                </div>
              </div>

              {tables.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <span className="material-symbols-outlined text-5xl mb-3 block">table_restaurant</span>
                  <p>No tables configured yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  {tables.map(table => (
                    <div
                      key={table.id}
                      className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-bold text-slate-900">Table {table.tableNumber}</h3>
                          <p className="text-xs text-slate-500">{table.name}</p>
                        </div>
                        <div className="flex flex-col items-end">
                          <div className={`px-2 py-1 rounded-full text-[10px] font-black tracking-wider ${
                            table.status === 'available' ? 'bg-emerald-100 text-emerald-700' :
                            table.status === 'occupied'  ? 'bg-red-100 text-red-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {table.status.toUpperCase()}
                          </div>
                          {table.status === 'occupied' && table.occupiedAt && (
                            <span className="text-[10px] text-red-500 font-bold mt-1 flex items-center gap-0.5">
                              <span className="material-symbols-outlined text-[12px]">timer</span>
                              {Math.floor((now - table.occupiedAt) / 60000)}m
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-600">
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">group</span>
                          <span>{table.capacity}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">
                            {table.shape === 'round' ? 'circle' : 'square'}
                          </span>
                          <span className="capitalize">{table.shape ?? 'square'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </main>

        {/* Toasts */}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />

        {/* Offline Banner */}
        <OfflineBanner show={offline} />

        {/* ── MIGRATED: Mobile bottom nav — added 'tables' tab ─────────────── */}
        <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-100 flex justify-around items-center px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-50">
          {([
            { key: 'live',    icon: 'monitor_heart',   label: 'Live Feed' },
            { key: 'history', icon: 'history',          label: 'History' },
            { key: 'tables',  icon: 'table_restaurant', label: 'Tables' },
          ] as { key: KitchenView; icon: string; label: string }[]).map(item => (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={`flex flex-col items-center text-[11px] font-semibold transition-all active:scale-90 ${
                view === item.key
                  ? 'text-primary bg-orange-50 rounded-xl px-3 py-1'
                  : 'text-slate-400'
              }`}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

      </div>
    </>
  )
}
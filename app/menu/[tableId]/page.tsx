'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { listenToMenu, listenToSettings, listenToTables, MenuItem, CATEGORIES, CartItem, addOrder, AppSettings, DEFAULT_SETTINGS, Table } from '@/lib/data'
import { useState, useEffect, useCallback, useRef } from 'react'

// ─── Safe image fallback ─────────────────────────────────────────────────────────
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'
function safeOnError(e: React.SyntheticEvent<HTMLImageElement>) {
  const target = e.target as HTMLImageElement
  if (target.src !== FALLBACK_IMAGE) target.src = FALLBACK_IMAGE
}

// ─── Tag color function ──────────────────────────────────────────────────────────
const getTagStyle = (tag: string) => {
  const tagLower = tag.toLowerCase()
  if (tagLower.includes('spicy') || tagLower.includes('hot')) {
    return { background: 'linear-gradient(135deg,#dc2626 0%,#b91c1c 100%)', color: 'white' }
  }
  if (tagLower.includes('vegan') || tagLower.includes('vegetarian')) {
    return { background: 'linear-gradient(135deg,#059669 0%,#047857 100%)', color: 'white' }
  }
  if (tagLower.includes('bestseller') || tagLower.includes('popular')) {
    return { background: 'linear-gradient(135deg,#d97706 0%,#b45309 100%)', color: 'white' }
  }
  if (tagLower.includes('new')) {
    return { background: 'linear-gradient(135deg,#16a34a 0%,#15803d 100%)', color: 'white' }
  }
  if (tagLower.includes('recommended') || tagLower.includes('chef')) {
    return { background: 'linear-gradient(135deg,#7c3aed 0%,#6d28d9 100%)', color: 'white' }
  }
  if (tagLower.includes('gluten') || tagLower.includes('free')) {
    return { background: 'linear-gradient(135deg,#0891b2 0%,#0e7490 100%)', color: 'white' }
  }
  if (tagLower.includes('organic') || tagLower.includes('fresh')) {
    return { background: 'linear-gradient(135deg,#65a30d 0%,#4d7c0f 100%)', color: 'white' }
  }
  // Default fallback
  return { background: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)', color: 'white' }
}

// ─── Welcome Screen ──────────────────────────────────────────────────────────
function WelcomeScreen({ tableNumber, restaurantName, onStart }: { tableNumber: number; restaurantName: string; onStart: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const [time, setTime] = useState('...')

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setLeaving(true)
    setTimeout(onStart, 400)
  }

  useEffect(() => {
    setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  }, [])

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Outfit:wght@300;400;500;600&display=swap');
        .ww-root { min-height:100vh!important;height:100vh!important;background:#080808;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem 1.5rem;font-family:'Outfit',sans-serif;overflow:hidden;position:relative;touch-action:manipulation;-webkit-tap-highlight-color:transparent;will-change:opacity,transform; }
        .ww-root.leaving { opacity:0!important;transform:scale(1.02)!important;transition:all 0.4s cubic-bezier(0.16,1,0.3,1)!important; }
        .ww-noise { position:absolute;inset:0;z-index:0;opacity:0.03;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");background-size:200px 200px;pointer-events:none; }
        .ww-grid { position:absolute;inset:0;z-index:0;background-image:linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px);background-size:60px 60px;pointer-events:none; }
        .ww-orb { position:absolute;width:600px;height:600px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,0.04) 0%,transparent 65%);top:50%;left:50%;transform:translate(-50%,-50%);animation:orbPulse 8s ease-in-out infinite;z-index:0;pointer-events:none; }
        @keyframes orbPulse { 0%,100%{transform:translate(-50%,-50%) scale(1);opacity:0.5}50%{transform:translate(-50%,-50%) scale(1.15);opacity:1} }
        .ww-corner { position:absolute;z-index:0;width:80px;height:80px;pointer-events:none; }
        .ww-corner-tl { top:2rem;left:2rem;border-top:1px solid rgba(255,255,255,0.12);border-left:1px solid rgba(255,255,255,0.12); }
        .ww-corner-br { bottom:2rem;right:2rem;border-bottom:1px solid rgba(255,255,255,0.12);border-right:1px solid rgba(255,255,255,0.12); }
        .ww-content { position:relative;z-index:10;display:flex;flex-direction:column;align-items:center;text-align:center;max-width:420px;width:100%; }
        .ww-badge { display:inline-flex;align-items:center;gap:7px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:100px;padding:8px 18px;font-size:0.7rem;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.6);margin-bottom:2rem;animation:fadeInUp 0.6s ease 0.1s both; }
        .ww-badge-dot { width:6px;height:6px;border-radius:50%;background:#ffffff;animation:blink 2s ease-in-out infinite; }
        @keyframes blink { 0%,100%{opacity:1}50%{opacity:0.3} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)} }
        .ww-greeting { font-family:'Outfit',sans-serif;font-weight:300;font-size:0.8rem;color:rgba(255,255,255,0.4);letter-spacing:0.3em;text-transform:uppercase;margin-bottom:1.2rem;animation:fadeInUp 0.6s ease 0.2s both; }
        .ww-table { font-family:'Playfair Display',serif;font-weight:700;font-size:clamp(3.5rem,16vw,5.5rem);line-height:0.95;color:#ffffff;letter-spacing:-0.04em;margin-bottom:0.5rem;animation:fadeInUp 0.8s ease 0.3s both;text-shadow:0 2px 20px rgba(0,0,0,0.5); }
        .ww-table-label { font-family:'Outfit',sans-serif;font-size:0.7rem;letter-spacing:0.25em;text-transform:uppercase;color:rgba(255,255,255,0.25);margin-bottom:2.5rem;animation:fadeInUp 0.6s ease 0.4s both; }
        .ww-divider { display:flex;align-items:center;gap:12px;width:100%;max-width:280px;margin-bottom:3rem;animation:fadeInUp 0.6s ease 0.5s both; }
        .ww-divider-line { flex:1;height:1px;background:rgba(255,255,255,0.15); }
        .ww-divider-diamond { width:8px;height:8px;border:1px solid rgba(255,255,255,0.4);transform:rotate(45deg); }
        .ww-info { display:flex;gap:12px;margin-bottom:3rem;animation:fadeInUp 0.6s ease 0.6s both; }
        .ww-pill { background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.2);border-radius:100px;padding:12px 20px;font-size:0.8rem;color:rgba(255,255,255,0.65);letter-spacing:0.03em;display:flex;align-items:center;gap:8px;font-family:'Outfit',sans-serif;backdrop-filter:blur(10px); }
        .ww-pill-icon { font-size:16px;opacity:0.7; }
        .ww-btn { position:relative;display:inline-flex;align-items:center;justify-content:center;gap:12px;background:linear-gradient(135deg,#ffffff 0%,#f8f8f8 100%);color:#080808;border:2px solid rgba(255,255,255,0.3);border-radius:50px;padding:20px 56px;font-family:'Outfit',sans-serif;font-size:0.9rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.6);transition:all 0.25s cubic-bezier(0.16,1,0.3,1);touch-action:manipulation;-webkit-tap-highlight-color:transparent;min-height:64px;animation:fadeInUp 0.8s ease 0.7s both; }
        .ww-btn:active { transform:scale(0.96)!important;box-shadow:0 4px 16px rgba(0,0,0,0.4); }
        .ww-btn::before { content:'';position:absolute;inset:0;background:rgba(255,255,255,0.9);opacity:0;transition:opacity 0.3s ease;border-radius:50px; }
        .ww-btn:hover::before { opacity:1; }
        .ww-btn-text,.ww-btn-arrow { position:relative;z-index:2;font-weight:600; }
        .ww-btn-arrow { font-size:20px;transition:transform 0.3s cubic-bezier(0.16,1,0.3,1); }
        .ww-btn:hover .ww-btn-arrow { transform:translateX(6px); }
        .ww-footer { position:absolute;bottom:1.5rem;left:0;right:0;text-align:center;font-size:0.65rem;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.15);font-family:'Outfit',sans-serif;animation:fadeInUp 0.6s ease 0.9s both; }
        @media (hover:none) and (pointer:coarse) { .ww-btn { padding:24px 60px;font-size:1rem;min-height:72px; } }
      `}</style>

      <div className={`ww-root${leaving ? ' leaving' : ''}`} onTouchStart={e => e.stopPropagation()}>
        <div className="ww-noise" />
        <div className="ww-grid" />
        <div className="ww-orb" />
        <div className="ww-corner ww-corner-tl" />
        <div className="ww-corner ww-corner-br" />
        <div className="ww-content">
          <div className="ww-badge"><div className="ww-badge-dot" />Now Open</div>
          <p className="ww-greeting">welcome to</p>
          <h1 className="ww-table">{restaurantName || 'The Restaurant'}</h1>
          <p className="ww-table-label">Table Ordering · {time}</p>
          <div className="ww-divider">
            <div className="ww-divider-line" />
            <div className="ww-divider-diamond" />
            <div className="ww-divider-line" />
          </div>
          <div className="ww-info">
            <div className="ww-pill">
              <span className="material-symbols-outlined ww-pill-icon">table_restaurant</span>
              Table {tableNumber}
            </div>
          </div>
          <button className="ww-btn" onClick={handleStart} onTouchStart={handleStart} onTouchEnd={e => e.preventDefault()}>
            <span className="ww-btn-text">Start Ordering</span>
            <span className="material-symbols-outlined ww-btn-arrow">arrow_forward</span>
          </button>
        </div>
        <p className="ww-footer">{restaurantName} · Powered by Hapag</p>
      </div>
    </>
  )
}

// ─── Main Menu Page ──────────────────────────────────────────────────────────
export default function MenuPage() {
  const params = useParams()
  const router = useRouter()

  const rawId = params?.tableId
  const tableNumber = rawId ? Number(Array.isArray(rawId) ? rawId[0] : rawId) : 0

  const [showWelcome, setShowWelcome]   = useState(true)
  const [activeCategory, setActiveCategory] = useState<string>('All')
  const [cart, setCart]                 = useState<CartItem[]>([])
  const [selectedVariantIndex, setSelectedVariantIndex] = useState<Record<string, number>>({})
  const [searchQuery, setSearchQuery]   = useState('')
  const [showCart, setShowCart]         = useState(false)
  const [showConfirm, setShowConfirm]   = useState(false)  // ← NEW
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [isPlacing, setIsPlacing]       = useState(false)
  const [menuItems, setMenuItems]       = useState<MenuItem[]>([])
  const [settings, setSettings]         = useState<AppSettings>(DEFAULT_SETTINGS)
  const [lastOrderId, setLastOrderId]   = useState<string | null>(null)
  const [menuLoading, setMenuLoading]   = useState(true)
  const [table, setTable]               = useState<Table | null>(null)
  const [orderError, setOrderError]     = useState('')
  const cartBarRef                      = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsubMenu = listenToMenu(items => { setMenuItems(items); setMenuLoading(false) })
    const unsubSettings = listenToSettings(setSettings)
    try {
      const stored = sessionStorage.getItem('lastOrderId')
      if (stored) setLastOrderId(stored)
    } catch (_) {}
    return () => { unsubMenu(); unsubSettings() }
  }, [])

  useEffect(() => {
    const unsub = listenToTables(tables => {
      const found = tables.find(t => t.tableNumber === tableNumber)
      setTable(found ?? null)
      
      // Auto-occupy if available
      if (found && found.status === 'available') {
        import('@/lib/data').then(({ updateTableStatus }) => {
          updateTableStatus(found.id, 'occupied')
        })
      }
    })
    return () => unsub()
  }, [tableNumber])

  // ─── Cart helpers ──────────────────────────────────────────────────────────
  const addToCart = useCallback((item: MenuItem, variant?: { name: string; price: number }) => {
    const variantName = variant?.name
    const cartItemId  = variantName ? `${item.id}::${variantName}` : item.id
    const itemPrice   = variant?.price ?? item.price
    setCart(prev => {
      const existing = prev.find(c => c.id === cartItemId)
      if (existing) return prev.map(c => c.id === cartItemId ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, {
        id: cartItemId,
        baseId: item.id,
        name: item.name,
        price: itemPrice,
        quantity: 1,
        image: item.image ?? '',
        ...(variantName ? { variantName } : {})
      }]
    })
  }, [])

  const removeFromCart = useCallback((id: string) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === id)
      if (existing && existing.quantity > 1) return prev.map(c => c.id === id ? { ...c, quantity: c.quantity - 1 } : c)
      return prev.filter(c => c.id !== id)
    })
  }, [])

  const triggerCartBounce = useCallback(() => {
    const el = cartBarRef.current
    if (!el) return
    el.classList.add('cart-bar-bounce')
    setTimeout(() => el.classList.remove('cart-bar-bounce'), 350)
  }, [])

  const getCartQty = (id: string, variantName?: string) => {
    const cartItemId = variantName ? `${id}::${variantName}` : id
    return cart.find(c => c.id === cartItemId)?.quantity || 0
  }

  // ─── Place order (creates pending order → redirects to checkout) ──
  const placeOrder = async () => {
    if (cart.length === 0) return
    setIsPlacing(true)
    setOrderError('')
    try {
      const orderItems = cart.map(({ id, baseId, name, price, quantity, image, variantName }) => ({
        id,
        ...(baseId    ? { baseId }    : {}),
        ...(variantName ? { variantName } : {}),
        name, price, quantity, image: image ?? ''
      }))

      const orderId = await addOrder(
        {
          tableNumber,
          items: orderItems,
          status: 'preparing',           // addOrder overrides this to 'pending'
          paymentStatus: 'pending',
          specialInstructions,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          total: cartTotal,
          orderType: 'dine-in'
        },
        undefined  // Table is marked occupied at payment time, not here
      )

      if (orderId) {
        try {
          sessionStorage.setItem('lastOrderId', orderId)
          // Persist tableId so the checkout page can activate the table after payment
          if (table?.id) sessionStorage.setItem(`tableId_${orderId}`, table.id)
        } catch (_) {}
        setLastOrderId(orderId)
        setCart([])
        setSpecialInstructions('')
        setShowConfirm(false)
        router.push(`/status/${orderId}`)
      } else {
        setIsPlacing(false)
        setOrderError('Failed to place order. Please try again.')
      }
    } catch (error) {
      setIsPlacing(false)
      const message = error instanceof Error ? error.message : String(error)
      setOrderError(`Failed to place order. ${message}`)
      console.error('[placeOrder] error:', error)
    }
  }

  // ─── Guard: invalid table ──────────────────────────────────────────────────
  if (!tableNumber || tableNumber <= 0) {
    return (
      <div style={{ fontFamily: "'Outfit', sans-serif" }} className="min-h-screen bg-[#080808] flex flex-col items-center justify-center p-6 text-center">
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap');`}</style>
        <span className="material-symbols-outlined text-6xl text-neutral-700 mb-4">error</span>
        <h1 className="text-xl font-bold mb-2 text-white">Invalid Table</h1>
        <p className="text-neutral-500 mb-4">Please scan your table&apos;s QR code again.</p>
        <Link href="/" className="text-white font-bold border-b border-white/30 pb-0.5">Return Home</Link>
      </div>
    )
  }

  if (showWelcome) {
    return (
      <WelcomeScreen
        tableNumber={tableNumber}
        restaurantName={settings.restaurantName}
        onStart={() => setShowWelcome(false)}
      />
    )
  }

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0)

  const taxRate    = parseFloat(settings.taxRate    || '0') / 100
  const serviceFee = parseFloat(settings.serviceFee || '0')
  const tax        = cartTotal * taxRate
  const grandTotal = cartTotal + tax + serviceFee

  const filteredItems = menuItems.filter(item => {
    const matchCat    = activeCategory === 'All' || item.category === activeCategory
    const q           = searchQuery.toLowerCase()
    const matchSearch = !searchQuery ||
      item.name.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q) ||
      item.tags?.some(t => t.toLowerCase().includes(q)) ||
      item.badge?.toLowerCase().includes(q)
    return matchCat && matchSearch
  })

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Outfit:wght@300;400;500;600&display=swap');
        * { box-sizing:border-box; }
        .menu-root { background:#f5f4f0;min-height:100svh;padding-bottom:9rem;font-family:'Outfit',sans-serif; }
        .menu-header { background:rgba(255,255,255,0.95);backdrop-filter:blur(16px);border-bottom:0.5px solid rgba(0,0,0,0.08);position:sticky;top:0;z-index:50; }
        .menu-header-inner { display:flex;justify-content:space-between;align-items:center;padding:14px 20px;max-width:768px;margin:0 auto; }
        .menu-logo { display:flex;align-items:center;gap:10px; }
        .menu-logo-mark { width:34px;height:34px;background:#0a0a0a;border-radius:8px;display:flex;align-items:center;justify-content:center; }
        .menu-logo-mark .material-symbols-outlined { color:white;font-size:16px; }
        .menu-logo-name { font-family:'Playfair Display',serif;font-size:1.15rem;font-weight:700;color:#0a0a0a;letter-spacing:-0.01em; }
        .menu-cart-btn { position:relative;background:none;border:none;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background 0.15s ease; }
        .menu-cart-btn:hover { background:rgba(0,0,0,0.05); }
        .menu-cart-btn .material-symbols-outlined { color:#0a0a0a;font-size:20px; }
        .menu-cart-count { position:absolute;top:2px;right:2px;background:#0a0a0a;color:white;font-size:9px;font-weight:600;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:1.5px solid #f5f4f0; }
        .menu-main { max-width:768px;margin:0 auto;padding:24px 20px; }
        .menu-hero { margin-bottom:24px; }
        .menu-hero-top { display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap; }
        .menu-hero-label { font-size:0.68rem;letter-spacing:0.2em;text-transform:uppercase;color:rgba(0,0,0,0.35);font-weight:500;margin:0; }
        .menu-status-pill { font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:6px 12px;border-radius:999px;border:1px solid transparent; }
        .menu-status-pill.available { color:#047857;background:rgba(16,185,129,0.12);border-color:rgba(16,185,129,0.22); }
        .menu-status-pill.occupied  { color:#b91c1c;background:rgba(239,68,68,0.12);border-color:rgba(239,68,68,0.22); }
        .menu-status-pill.reserved  { color:#1d4ed8;background:rgba(59,130,246,0.12);border-color:rgba(59,130,246,0.22); }
        .menu-hero-title { font-family:'Playfair Display',serif;font-size:1.7rem;font-weight:700;color:#0a0a0a;letter-spacing:-0.02em;line-height:1.15;margin:0 0 4px; }
        .menu-hero-sub { font-size:0.85rem;color:rgba(0,0,0,0.4);font-weight:400;margin:0; }
        .menu-search-wrap { position:relative;margin-bottom:16px; }
        .menu-search-wrap .material-symbols-outlined { position:absolute;left:14px;top:50%;transform:translateY(-50%);color:rgba(0,0,0,0.3);font-size:18px;pointer-events:none; }
        .menu-search { width:100%;background:white;border:0.5px solid rgba(0,0,0,0.1);border-radius:12px;padding:12px 16px 12px 42px;font-size:0.875rem;font-family:'Outfit',sans-serif;color:#0a0a0a;outline:none;transition:border-color 0.2s ease,box-shadow 0.2s ease; }
        .menu-search::placeholder { color:rgba(0,0,0,0.3); }
        .menu-search:focus { border-color:rgba(0,0,0,0.3);box-shadow:0 0 0 3px rgba(0,0,0,0.05); }
        .menu-cats { display:flex;gap:6px;overflow-x:auto;-ms-overflow-style:none;scrollbar-width:none;-webkit-overflow-scrolling:touch;margin:0 -20px;padding:4px 20px 12px;position:sticky;top:63px;z-index:40;background:#f5f4f0; }
        .menu-cats::-webkit-scrollbar { display:none; }
        .menu-cat-btn { flex-shrink:0;padding:7px 16px;border-radius:100px;font-family:'Outfit',sans-serif;font-size:0.78rem;font-weight:500;border:0.5px solid transparent;cursor:pointer;transition:all 0.15s ease;white-space:nowrap; }
        .menu-cat-btn.inactive { background:white;border-color:rgba(0,0,0,0.08);color:rgba(0,0,0,0.55); }
        .menu-cat-btn.inactive:hover { border-color:rgba(0,0,0,0.2);color:#0a0a0a; }
        .menu-cat-btn.active { background:#0a0a0a;color:white; }
        .menu-section-heading { display:flex;align-items:baseline;gap:10px;margin-bottom:16px; }
        .menu-section-title { font-family:'Playfair Display',serif;font-size:1.25rem;font-weight:700;color:#0a0a0a;margin:0; }
        .menu-section-line { flex:1;height:0.5px;background:rgba(0,0,0,0.1); }
        .menu-grid { display:grid;grid-template-columns:repeat(2,1fr);gap:12px; }
        @media (max-width:480px) { .menu-grid { grid-template-columns:1fr; } }
        .menu-card { background:white;border-radius:16px;overflow:hidden;border:0.5px solid rgba(0,0,0,0.07);display:flex;flex-direction:column;transition:transform 0.2s ease,box-shadow 0.2s ease,border-color 0.2s ease; }
        .menu-card:hover { transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,0,0,0.08);border-color:rgba(0,0,0,0.12); }
        .menu-card-img-wrap { height:160px;overflow:hidden;position:relative;background:#ebebeb; }
        .menu-card-img { width:100%;height:100%;object-fit:cover;display:block;transition:transform 0.5s ease; }
        .menu-card:hover .menu-card-img { transform:scale(1.04); }
        .menu-card-badge { position:absolute;top:10px;right:10px;background:#0a0a0a;color:white;font-size:9px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;padding:4px 10px;border-radius:100px; }
        .menu-card-body { padding:14px;flex:1;display:flex;flex-direction:column;justify-content:space-between; }
        .menu-card-top { margin-bottom:10px; }
        .menu-card-name-row { display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;gap:8px; }
        .menu-card-name { font-size:0.95rem;font-weight:600;color:#0a0a0a;line-height:1.25;margin:0; }
        .menu-card-price { font-size:0.95rem;font-weight:600;color:#0a0a0a;flex-shrink:0;letter-spacing:-0.01em; }
        .menu-card-variant-label { font-size:0.78rem;color:rgba(0,0,0,0.45);margin-bottom:6px; }
        .menu-variant-row { display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px; }
        .menu-variant-btn { border:0.5px solid rgba(0,0,0,0.1);background:#f7f6f2;color:rgba(0,0,0,0.65);border-radius:10px;padding:6px 10px;font-size:0.72rem;font-weight:600;cursor:pointer;transition:all 0.15s ease; }
        .menu-variant-btn:hover { background:#ecebe4; }
        .menu-variant-btn.active { background:#0a0a0a;color:white;border-color:transparent; }
        .menu-card-desc { font-size:0.78rem;color:rgba(0,0,0,0.60);line-height:1.5;margin:0; }
        .menu-card-footer { display:flex;align-items:center;gap:6px; }
        .menu-tag { font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:3px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);box-shadow:0 2px 4px rgba(0,0,0,0.1); }
        .menu-card-actions { margin-left:auto;display:flex;align-items:center;gap:8px; }
        .menu-qty-btn { width:32px;height:32px;border-radius:50%;border:0.5px solid rgba(0,0,0,0.15);background:white;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.15s ease; }
        .menu-qty-btn:hover { background:#f0efe9;border-color:rgba(0,0,0,0.25); }
        .menu-qty-btn:active { transform:scale(0.9); }
        .menu-qty-btn .material-symbols-outlined { font-size:14px;color:#0a0a0a; }
        .menu-qty-num { font-size:0.88rem;font-weight:600;color:#0a0a0a;min-width:18px;text-align:center; }
        .menu-add-btn { width:36px;height:36px;border-radius:50%;background:#0a0a0a;color:white;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.15s ease;box-shadow:0 2px 10px rgba(0,0,0,0.25); }
        .menu-add-btn:hover { background:#2a2a2a;transform:scale(1.05); }
        .menu-add-btn:active { transform:scale(0.92); }
        .menu-add-btn .material-symbols-outlined { font-size:18px; }
        .menu-skeleton { grid-column:1/-1;display:grid;grid-template-columns:repeat(2,1fr);gap:12px; }
        @media (max-width:480px) { .menu-skeleton { grid-template-columns:1fr; } }
        .skeleton-card { background:white;border-radius:16px;overflow:hidden;border:0.5px solid rgba(0,0,0,0.07); }
        .skeleton-img { height:160px;background:#ebebeb;animation:shimmer 1.4s ease-in-out infinite; }
        .skeleton-body { padding:14px; }
        .skeleton-line { height:12px;border-radius:6px;background:#ebebeb;animation:shimmer 1.4s ease-in-out infinite;margin-bottom:8px; }
        .skeleton-line.short { width:60%; }
        .skeleton-line.medium { width:80%; }
        @keyframes shimmer { 0%,100%{opacity:1}50%{opacity:0.4} }
        .menu-empty { grid-column:1/-1;text-align:center;padding:64px 20px;color:rgba(0,0,0,0.3); }
        .menu-empty .material-symbols-outlined { font-size:48px;display:block;margin-bottom:12px; }
        .menu-empty p { font-size:0.95rem;font-weight:500;margin:0; }
        .menu-bottom-nav { position:fixed;bottom:0;left:0;width:100%;background:white;border-top:0.5px solid rgba(0,0,0,0.08);display:flex;justify-content:space-around;align-items:center;padding:10px 16px 18px;z-index:50; }
        .menu-nav-item { display:flex;flex-direction:column;align-items:center;gap:2px;font-size:10px;font-weight:500;letter-spacing:0.04em;text-transform:uppercase;padding:6px 16px;border-radius:10px;border:none;background:none;cursor:pointer;text-decoration:none;transition:all 0.15s ease;color:rgba(0,0,0,0.3); }
        .menu-nav-item:active { transform:scale(0.93); }
        .menu-nav-item.active { background:#0a0a0a;color:white; }
        .menu-nav-item .material-symbols-outlined { font-size:20px; }
        .menu-nav-item.disabled { opacity:0.25;pointer-events:none; }
        .menu-cart-bar { position:fixed;bottom:76px;left:50%;transform:translateX(-50%);width:calc(100% - 32px);max-width:720px;background:#0a0a0a;color:white;border-radius:16px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;z-index:45;cursor:pointer;transition:transform 0.2s ease,box-shadow 0.2s ease;box-shadow:0 4px 24px rgba(0,0,0,0.3); }
        .menu-cart-bar:hover { box-shadow:0 8px 32px rgba(0,0,0,0.4); }
        .menu-cart-bar:active { transform:translateX(-50%) scale(0.99); }
        .menu-cart-bar-left { display:flex;align-items:center;gap:12px; }
        .menu-cart-bar-icon { width:38px;height:38px;background:rgba(255,255,255,0.1);border-radius:10px;display:flex;align-items:center;justify-content:center; }
        .menu-cart-bar-icon .material-symbols-outlined { font-size:18px; }
        .menu-cart-bar-label { font-size:11px;color:rgba(255,255,255,0.5);letter-spacing:0.04em; }
        .menu-cart-bar-total { font-size:1.1rem;font-weight:600;letter-spacing:-0.01em; }
        .menu-cart-bar-cta { background:white;color:#0a0a0a;font-family:'Outfit',sans-serif;font-size:0.75rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;padding:9px 20px;border-radius:10px;border:none;cursor:pointer; }
        .cart-overlay { position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;justify-content:flex-end; }
        .cart-backdrop { position:absolute;inset:0;background:rgba(0,0,0,0.5); }
        .cart-sheet { position:relative;background:white;border-radius:24px 24px 0 0;padding:24px;max-height:88svh;display:flex;flex-direction:column;animation:slideUp 0.35s cubic-bezier(0.16,1,0.3,1); }
        @keyframes slideUp { from{transform:translateY(100%)}to{transform:translateY(0)} }
        .cart-handle { width:36px;height:4px;background:rgba(0,0,0,0.1);border-radius:2px;margin:-8px auto 20px; }
        .cart-header { display:flex;justify-content:space-between;align-items:center;margin-bottom:20px; }
        .cart-title { font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:700;color:#0a0a0a;margin:0; }
        .cart-close { width:32px;height:32px;background:rgba(0,0,0,0.05);border:none;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background 0.15s ease; }
        .cart-close:hover { background:rgba(0,0,0,0.1); }
        .cart-close .material-symbols-outlined { font-size:17px;color:#0a0a0a; }
        .cart-items { flex:1;overflow-y:auto;margin-bottom:16px;-ms-overflow-style:none;scrollbar-width:none; }
        .cart-items::-webkit-scrollbar { display:none; }
        .cart-empty { text-align:center;padding:40px 0;color:rgba(0,0,0,0.3); }
        .cart-empty .material-symbols-outlined { font-size:40px;display:block;margin-bottom:8px; }
        .cart-empty p { font-size:0.88rem;margin:0; }
        .cart-item { display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:0.5px solid rgba(0,0,0,0.06); }
        .cart-item:last-child { border-bottom:none; }
        .cart-item-img { width:60px;height:60px;border-radius:10px;object-fit:cover;display:block;background:#ebebeb;flex-shrink:0; }
        .cart-item-info { flex:1; }
        .cart-item-name { font-size:0.9rem;font-weight:600;color:#0a0a0a;margin:0 0 2px; }
        .cart-item-variant { font-size:0.78rem;color:rgba(0,0,0,0.55);margin:0 0 4px; }
        .cart-item-price { font-size:0.85rem;color:rgba(0,0,0,0.5);margin:0;font-weight:500; }
        .cart-item-controls { display:flex;align-items:center;gap:8px; }
        .cart-ctrl-btn { width:30px;height:30px;border-radius:50%;border:0.5px solid rgba(0,0,0,0.12);background:white;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.15s ease; }
        .cart-ctrl-btn:hover { background:#f0efe9; }
        .cart-ctrl-btn:active { transform:scale(0.9); }
        .cart-ctrl-btn .material-symbols-outlined { font-size:13px;color:#0a0a0a; }
        .cart-ctrl-qty { font-size:0.85rem;font-weight:600;color:#0a0a0a;min-width:16px;text-align:center; }
        .cart-ctrl-add { width:30px;height:30px;border-radius:50%;background:#0a0a0a;color:white;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.15s ease; }
        .cart-ctrl-add:hover { background:#2a2a2a; }
        .cart-ctrl-add:active { transform:scale(0.9); }
        .cart-ctrl-add .material-symbols-outlined { font-size:13px; }
        .cart-notes { width:100%;background:#f5f4f0;border:0.5px solid rgba(0,0,0,0.08);border-radius:12px;padding:12px;font-family:'Outfit',sans-serif;font-size:0.85rem;color:#0a0a0a;resize:none;outline:none;margin-bottom:16px;transition:border-color 0.2s ease; }
        .cart-notes::placeholder { color:rgba(0,0,0,0.3); }
        .cart-notes:focus { border-color:rgba(0,0,0,0.25); }
        .cart-total-row { display:flex;justify-content:space-between;align-items:center;padding:6px 0; }
        .cart-total-row.border-top { border-top:0.5px solid rgba(0,0,0,0.08);padding-top:12px;margin-top:4px; }
        .cart-total-label { font-size:0.8rem;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:rgba(0,0,0,0.4); }
        .cart-total-amount { font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:700;color:#0a0a0a;letter-spacing:-0.02em; }
        .cart-place-btn { width:100%;height:56px;background:#0a0a0a;color:white;border:none;border-radius:14px;font-family:'Outfit',sans-serif;font-size:0.9rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;transition:all 0.2s ease;box-shadow:0 4px 16px rgba(0,0,0,0.2); }
        .cart-place-btn:hover { background:#1a1a1a;box-shadow:0 6px 24px rgba(0,0,0,0.3); }
        .cart-place-btn:active { transform:scale(0.99); }
        .cart-place-btn:disabled { opacity:0.5;cursor:not-allowed; }
        .cart-place-btn .material-symbols-outlined { font-size:17px; }
        /* Confirm sheet */
        .confirm-overlay { position:fixed;inset:0;z-index:70;display:flex;flex-direction:column;justify-content:flex-end; }
        .confirm-backdrop { position:absolute;inset:0;background:rgba(0,0,0,0.6); }
        .confirm-sheet { position:relative;background:white;border-radius:24px 24px 0 0;padding:24px;max-height:88svh;display:flex;flex-direction:column;animation:slideUp 0.35s cubic-bezier(0.16,1,0.3,1); }
        .confirm-handle { width:36px;height:4px;background:rgba(0,0,0,0.1);border-radius:2px;margin:-8px auto 20px; }
        .confirm-icon { width:52px;height:52px;background:#f0efe9;border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 12px; }
        .confirm-icon .material-symbols-outlined { font-size:24px;color:#0a0a0a; }
        .confirm-title { font-family:'Playfair Display',serif;font-size:1.3rem;font-weight:700;color:#0a0a0a;text-align:center;margin:0 0 4px; }
        .confirm-subtitle { font-size:0.82rem;color:rgba(0,0,0,0.4);text-align:center;margin:0 0 20px; }
        .confirm-items { overflow-y:auto;max-height:200px;margin-bottom:16px;-ms-overflow-style:none;scrollbar-width:none; }
        .confirm-items::-webkit-scrollbar { display:none; }
        .confirm-item { display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:0.5px solid rgba(0,0,0,0.05); }
        .confirm-item:last-child { border-bottom:none; }
        .confirm-item-left { display:flex;align-items:center;gap:8px; }
        .confirm-item-qty { width:22px;height:22px;background:#0a0a0a;color:white;border-radius:6px;font-size:0.72rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
        .confirm-item-name { font-size:0.88rem;font-weight:500;color:#0a0a0a; }
        .confirm-item-variant { font-size:0.75rem;color:rgba(0,0,0,0.4); }
        .confirm-item-price { font-size:0.88rem;font-weight:600;color:#0a0a0a; }
        .confirm-totals { background:#f5f4f0;border-radius:14px;padding:14px;margin-bottom:20px; }
        .confirm-total-row { display:flex;justify-content:space-between;font-size:0.82rem;color:rgba(0,0,0,0.5);margin-bottom:6px; }
        .confirm-total-row:last-child { margin-bottom:0;border-top:0.5px solid rgba(0,0,0,0.1);padding-top:8px;margin-top:4px; }
        .confirm-total-row.grand { font-size:1rem;font-weight:700;color:#0a0a0a; }
        .confirm-btn-primary { width:100%;height:56px;background:#0a0a0a;color:white;border:none;border-radius:14px;font-family:'Outfit',sans-serif;font-size:0.9rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;transition:all 0.2s ease;box-shadow:0 4px 16px rgba(0,0,0,0.2);margin-bottom:10px; }
        .confirm-btn-primary:hover { background:#1a1a1a; }
        .confirm-btn-primary:active { transform:scale(0.99); }
        .confirm-btn-primary:disabled { opacity:0.5;cursor:not-allowed; }
        .confirm-btn-secondary { width:100%;height:44px;background:none;border:none;font-family:'Outfit',sans-serif;font-size:0.88rem;font-weight:500;color:rgba(0,0,0,0.4);cursor:pointer;transition:color 0.15s ease; }
        .confirm-btn-secondary:hover { color:#0a0a0a; }
        .confirm-notes-preview { font-size:0.78rem;color:rgba(0,0,0,0.4);font-style:italic;text-align:center;margin-bottom:12px; }
        .animate-spin { animation:spin 1s linear infinite; }
        @keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
        .hide-scrollbar { -ms-overflow-style:none;scrollbar-width:none; }
        .hide-scrollbar::-webkit-scrollbar { display:none; }
        .menu-sold-out-overlay { position:absolute;inset:0;background:rgba(0,0,0,0.42);display:flex;align-items:center;justify-content:center;z-index:5; }
        .menu-sold-out-badge { background:#ef4444;color:white;font-size:0.68rem;font-weight:800;padding:5px 14px;border-radius:6px;letter-spacing:0.1em;transform:rotate(-8deg);border:2px solid white;text-transform:uppercase; }
        .menu-card.unavailable { opacity:0.72; }
        .menu-cats-wrap { position:relative; }
        .menu-cats-wrap::after { content:'';position:absolute;right:0;top:0;bottom:12px;width:44px;background:linear-gradient(to right,transparent,#f5f4f0);pointer-events:none;z-index:2; }
        @keyframes cartBarBounce { 0%{transform:translateX(-50%) scale(1)} 35%{transform:translateX(-50%) scale(1.045)} 100%{transform:translateX(-50%) scale(1)} }
        .cart-bar-bounce { animation:cartBarBounce 0.35s ease; }
      `}</style>

      <div className="menu-root">
        {/* Header */}
        <header className="menu-header">
          <div className="menu-header-inner">
            <div className="menu-logo">
              <div className="menu-logo-mark">
                <span className="material-symbols-outlined">restaurant</span>
              </div>
              <span className="menu-logo-name">{settings.restaurantName}</span>
            </div>
            <button onClick={() => setShowCart(true)} className="menu-cart-btn">
              <span className="material-symbols-outlined">shopping_cart</span>
              {cartCount > 0 && <span className="menu-cart-count">{cartCount}</span>}
            </button>
          </div>
        </header>

        <main className="menu-main">
          {/* Hero */}
          <section className="menu-hero">
            <div className="menu-hero-top">
              <p className="menu-hero-label">Table {tableNumber}</p>
              {table?.status && (
                <span className={`menu-status-pill ${table.status}`}>
                  {table.status.toUpperCase()}
                </span>
              )}
            </div>
            <h1 className="menu-hero-title">What would you<br /><em>like today?</em></h1>
            <p className="menu-hero-sub">
              {table?.status === 'occupied'
                ? 'This table is currently occupied and your order has been registered.'
                : table?.status === 'reserved'
                  ? 'This table is reserved. You can still place an order from here.'
                  : 'Order directly from your phone — no waiting.'}
            </p>
          </section>

          {/* Search */}
          <div className="menu-search-wrap">
            <span className="material-symbols-outlined">search</span>
            <input
              type="text"
              placeholder="Search menu..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="menu-search"
            />
          </div>

          {/* Category nav */}
          <div className="menu-cats-wrap">
            <nav className="menu-cats hide-scrollbar">
              {['All', ...CATEGORIES].map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)} className={`menu-cat-btn ${activeCategory === cat ? 'active' : 'inactive'}`}>
                  {cat}
                </button>
              ))}
            </nav>
          </div>

          {/* Items */}
          <section>
            <div className="menu-section-heading">
              <h2 className="menu-section-title">{activeCategory}</h2>
              <div className="menu-section-line" />
            </div>
            <div className="menu-grid">
              {menuLoading ? (
                <div className="menu-skeleton">
                  {[1, 2, 3, 4].map(n => (
                    <div key={n} className="skeleton-card">
                      <div className="skeleton-img" />
                      <div className="skeleton-body">
                        <div className="skeleton-line medium" />
                        <div className="skeleton-line short" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="menu-empty">
                  <span className="material-symbols-outlined">search_off</span>
                  <p>{searchQuery ? 'No items match your search' : 'No items in this category yet'}</p>
                </div>
              ) : (
                filteredItems.map(item => {
                  const itemVariants    = item.variants ?? []
                  const selectedIndex   = selectedVariantIndex[item.id] ?? 0
                  const selectedVariant = itemVariants[selectedIndex]
                  const displayPrice    = selectedVariant?.price ?? item.price
                  const cartItemId      = selectedVariant?.name ? `${item.id}::${selectedVariant.name}` : item.id
                  const qty             = getCartQty(item.id, selectedVariant?.name)
                  return (
                    <div key={item.id} className={`menu-card${!item.available ? ' unavailable' : ''}`}>
                      <div className="menu-card-img-wrap">
                        <img key={item.image} src={item.image || FALLBACK_IMAGE} alt={item.name} className="menu-card-img" onError={safeOnError} />
                        {item.badge && <span className="menu-card-badge">{item.badge}</span>}
                        {!item.available && (
                          <div className="menu-sold-out-overlay">
                            <span className="menu-sold-out-badge">Sold Out</span>
                          </div>
                        )}
                      </div>
                      <div className="menu-card-body">
                        <div className="menu-card-top">
                          <div className="menu-card-name-row">
                            <h3 className="menu-card-name">{item.name}</h3>
                            <span className="menu-card-price">₱{displayPrice.toFixed(2)}</span>
                          </div>
                          {selectedVariant?.name && <div className="menu-card-variant-label">{selectedVariant.name}</div>}
                          {itemVariants.length > 0 && (
                            <div className="menu-variant-row">
                              {itemVariants.map((variant, idx) => (
                                <button
                                  key={variant.name}
                                  onClick={() => setSelectedVariantIndex(prev => ({ ...prev, [item.id]: idx }))}
                                  className={`menu-variant-btn ${selectedIndex === idx ? 'active' : 'inactive'}`}
                                  type="button"
                                >
                                  {variant.name}
                                </button>
                              ))}
                            </div>
                          )}
                          <p className="menu-card-desc">{item.description}</p>
                        </div>
                        <div className="menu-card-footer">
                          {item.tags?.map(tag => (
                            <span 
                              key={tag} 
                              className="menu-tag" 
                              style={getTagStyle(tag)}
                            >
                              {tag}
                            </span>
                          ))}
                          <div className="menu-card-actions">
                            {qty > 0 && (
                              <>
                                <button onClick={() => removeFromCart(cartItemId)} className="menu-qty-btn">
                                  <span className="material-symbols-outlined">remove</span>
                                </button>
                                <span className="menu-qty-num">{qty}</span>
                              </>
                            )}
                            <button
                              onClick={() => { if (!item.available) return; addToCart(item, selectedVariant); triggerCartBounce() }}
                              className="menu-add-btn"
                              disabled={!item.available}
                              style={!item.available ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
                            >
                              <span className="material-symbols-outlined">add</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </section>
        </main>

        {/* Bottom nav */}
        <nav className="menu-bottom-nav">
          <button className="menu-nav-item active">
            <span className="material-symbols-outlined">restaurant_menu</span>
            Menu
          </button>
          <button onClick={() => setShowCart(true)} className="menu-nav-item">
            <span className="material-symbols-outlined">receipt_long</span>
            Cart{cartCount > 0 ? ` (${cartCount})` : ''}
          </button>
          {lastOrderId ? (
            <Link href={`/status/${lastOrderId}`} className="menu-nav-item">
              <span className="material-symbols-outlined">delivery_dining</span>
              Order
            </Link>
          ) : (
            <div className="menu-nav-item disabled">
              <span className="material-symbols-outlined">delivery_dining</span>
              Order
            </div>
          )}
        </nav>

        {/* Sticky cart bar */}
        {cartCount > 0 && !showCart && (
          <div ref={cartBarRef} onClick={() => setShowCart(true)} className="menu-cart-bar">
            <div className="menu-cart-bar-left">
              <div className="menu-cart-bar-icon">
                <span className="material-symbols-outlined">shopping_cart</span>
              </div>
              <div>
                <p className="menu-cart-bar-label">{cartCount} Item{cartCount !== 1 ? 's' : ''} in Cart</p>
                <p className="menu-cart-bar-total">₱{cartTotal.toFixed(2)}</p>
              </div>
            </div>
            <button className="menu-cart-bar-cta">View Cart</button>
          </div>
        )}

        {/* ── Cart Drawer ─────────────────────────────────────────────────── */}
        {showCart && (
          <div className="cart-overlay">
            <div className="cart-backdrop" onClick={() => setShowCart(false)} />
            <div className="cart-sheet">
              <div className="cart-handle" />
              <div className="cart-header">
                <h2 className="cart-title">Your Cart — Table {tableNumber}</h2>
                <button onClick={() => setShowCart(false)} className="cart-close">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="cart-items">
                {cart.length === 0 ? (
                  <div className="cart-empty">
                    <span className="material-symbols-outlined">shopping_cart</span>
                    <p>Your cart is empty</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.id} className="cart-item">
                      <img key={item.image} src={item.image || FALLBACK_IMAGE} alt={item.name} className="cart-item-img" onError={safeOnError} />
                      <div className="cart-item-info">
                        <p className="cart-item-name">{item.name}</p>
                        {item.variantName && <p className="cart-item-variant">{item.variantName}</p>}
                        <p className="cart-item-price">₱{(item.price * item.quantity).toFixed(2)}</p>
                      </div>
                      <div className="cart-item-controls">
                        <button onClick={() => removeFromCart(item.id)} className="cart-ctrl-btn">
                          <span className="material-symbols-outlined">remove</span>
                        </button>
                        <span className="cart-ctrl-qty">{item.quantity}</span>
                        <button
                          onClick={() => {
                            const mi = menuItems.find(m => m.id === item.baseId)
                            if (mi) addToCart(mi, item.variantName ? { name: item.variantName, price: item.price } : undefined)
                          }}
                          className="cart-ctrl-add"
                        >
                          <span className="material-symbols-outlined">add</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {cart.length > 0 && (
                <>
                  <textarea
                    className="cart-notes"
                    rows={2}
                    placeholder="Special instructions, allergies..."
                    value={specialInstructions}
                    onChange={e => setSpecialInstructions(e.target.value)}
                  />
                  <div className="cart-total-row">
                    <span className="cart-total-label">Subtotal</span>
                    <span style={{fontSize:'0.9rem',fontWeight:500,color:'#0a0a0a'}}>₱{cartTotal.toFixed(2)}</span>
                  </div>
                  {tax > 0 && (
                    <div className="cart-total-row">
                      <span className="cart-total-label">Tax ({settings.taxRate}%)</span>
                      <span style={{fontSize:'0.9rem',fontWeight:500,color:'#0a0a0a'}}>₱{tax.toFixed(2)}</span>
                    </div>
                  )}
                  {serviceFee > 0 && (
                    <div className="cart-total-row">
                      <span className="cart-total-label">Service Fee</span>
                      <span style={{fontSize:'0.9rem',fontWeight:500,color:'#0a0a0a'}}>₱{serviceFee.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="cart-total-row border-top" style={{marginBottom:'16px'}}>
                    <span className="cart-total-label">Total</span>
                    <span className="cart-total-amount">₱{grandTotal.toFixed(2)}</span>
                  </div>

                  {/* ── PLACE ORDER → opens confirm sheet instead of firing directly ── */}
                  <button
                    onClick={() => { setShowCart(false); setShowConfirm(true) }}
                    className="cart-place-btn"
                  >
                    <>Place Order<span className="material-symbols-outlined">arrow_forward</span></>
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Order Confirmation Sheet ─────────────────────────────────────── */}
        {showConfirm && (
          <div className="confirm-overlay">
            <div className="confirm-backdrop" onClick={() => { if (!isPlacing) setShowConfirm(false) }} />
            <div className="confirm-sheet">
              <div className="confirm-handle" />

              {/* Icon + heading */}
              <div className="confirm-icon">
                <span className="material-symbols-outlined">payment</span>
              </div>
              <h2 className="confirm-title">Pay to Place Order</h2>
              <p className="confirm-subtitle">Table {tableNumber} · {cartCount} item{cartCount !== 1 ? 's' : ''} · Payment required</p>

              {/* Item list */}
              <div className="confirm-items">
                {cart.map(item => (
                  <div key={item.id} className="confirm-item">
                    <div className="confirm-item-left">
                      <span className="confirm-item-qty">{item.quantity}</span>
                      <div>
                        <p className="confirm-item-name">{item.name}</p>
                        {item.variantName && <p className="confirm-item-variant">{item.variantName}</p>}
                      </div>
                    </div>
                    <span className="confirm-item-price">₱{(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Special instructions preview */}
              {specialInstructions && (
                <p className="confirm-notes-preview">📝 "{specialInstructions}"</p>
              )}

              {/* Totals */}
              <div className="confirm-totals">
                <div className="confirm-total-row">
                  <span>Subtotal</span>
                  <span>₱{cartTotal.toFixed(2)}</span>
                </div>
                {tax > 0 && (
                  <div className="confirm-total-row">
                    <span>Tax ({settings.taxRate}%)</span>
                    <span>₱{tax.toFixed(2)}</span>
                  </div>
                )}
                {serviceFee > 0 && (
                  <div className="confirm-total-row">
                    <span>Service Fee</span>
                    <span>₱{serviceFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="confirm-total-row grand">
                  <span>Total</span>
                  <span>₱{grandTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Error */}
              {orderError && (
                <p style={{color:'#dc2626',fontSize:'0.82rem',fontWeight:500,textAlign:'center',marginBottom:'10px'}}>
                  {orderError}
                </p>
              )}

              {/* Actions */}
              <button onClick={placeOrder} disabled={isPlacing} className="confirm-btn-primary">
                {isPlacing
                  ? <><span className="material-symbols-outlined animate-spin">progress_activity</span>Preparing Checkout...</>
                  : <><span className="material-symbols-outlined">payment</span>Proceed to Payment</>
                }
              </button>
              <button
                onClick={() => { setShowConfirm(false); setShowCart(true) }}
                disabled={isPlacing}
                className="confirm-btn-secondary"
              >
                Go Back to Cart
              </button>
            </div>
          </div>
        )}

      </div>
    </>
  )
}
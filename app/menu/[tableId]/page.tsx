'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  listenToMenu, listenToSettings, listenToTables, updateTableStatus, addOrder,
  MenuItem, MenuItemVariant, CATEGORIES, CartItem, AppSettings, DEFAULT_SETTINGS, Table,
} from '@/lib/data'
import {
  peso, pad2, delay, tagTone, DishImage, Sheet, SheetHeader, Stepper, TopBar, BottomNav, PoweredBy, MessageScreen,
} from '@/app/components/customer/ui'

const welcomeKey = (table: number) => `hapag_welcomed_${table}`
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const fromPrice = (item: MenuItem) =>
  item.variants?.length ? Math.min(...item.variants.map(v => v.price)) : item.price

function greetingFor(hour: number) {
  if (hour < 5) return 'Good evening'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

// ─── Welcome screen ───────────────────────────────────────────────────────────
function WelcomeScreen({ tableNumber, restaurantName, onStart }: {
  tableNumber: number
  restaurantName: string
  onStart: () => void
}) {
  const [leaving, setLeaving] = useState(false)
  const [clock, setClock] = useState<{ time: string; greeting: string } | null>(null)

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setClock({
        time: now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        greeting: greetingFor(now.getHours()),
      })
    }
    const first = setTimeout(tick, 0)
    const interval = setInterval(tick, 30_000)
    return () => { clearTimeout(first); clearInterval(interval) }
  }, [])

  const start = () => {
    if (leaving) return
    setLeaving(true)
    setTimeout(onStart, 480)
  }

  return (
    <div className={`hp hp-welcome${leaving ? ' is-leaving' : ''}`}>
      <div className="hp-glow" aria-hidden="true" />
      <div className="hp-frame" aria-hidden="true" />

      <main className="hp-welcome-content">
        <p className="hp-eyebrow hp-fade-up" style={delay(100)}>{clock?.greeting ?? 'Welcome'}</p>
        <h1 className="hp-welcome-name hp-fade-up" style={delay(200)}>{restaurantName}</h1>
        <div className="hp-ornament hp-fade-up" style={delay(320)}><i /></div>

        <div className="hp-welcome-table hp-fade-up" style={delay(420)}>
          <span className="hp-label">Your table</span>
          <span className="hp-welcome-table-num">{pad2(tableNumber)}</span>
        </div>

        <button type="button" className="hp-btn hp-btn-primary hp-btn-lg hp-fade-up" style={delay(540)} onClick={start}>
          View the menu
          <span className="material-symbols-outlined">arrow_forward</span>
        </button>
        <p className="hp-welcome-hint hp-fade-up" style={delay(640)}>
          Order &amp; pay from your phone{clock ? ` · ${clock.time}` : ''}
        </p>
      </main>

      <PoweredBy inline={false} />
    </div>
  )
}

// ─── Menu page ────────────────────────────────────────────────────────────────
export default function MenuPage() {
  const params = useParams()
  const router = useRouter()

  const rawId = params?.tableId
  const tableNumber = rawId ? Number(Array.isArray(rawId) ? rawId[0] : rawId) : 0

  // null = not yet known (avoids flashing the welcome screen for returning guests)
  const [showWelcome, setShowWelcome] = useState<boolean | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('')
  const [showCart, setShowCart] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [isPlacing, setIsPlacing] = useState(false)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [lastOrderId, setLastOrderId] = useState<string | null>(null)
  const [menuLoading, setMenuLoading] = useState(true)
  const [table, setTable] = useState<Table | null>(null)
  const [orderError, setOrderError] = useState('')

  // Dish detail sheet
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null)
  const [detailVariant, setDetailVariant] = useState(0)
  const [detailQty, setDetailQty] = useState(1)

  const headerRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLElement>(null)
  const cartBarRef = useRef<HTMLButtonElement>(null)

  // ─── Data ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubMenu = listenToMenu(items => { setMenuItems(items); setMenuLoading(false) })
    const unsubSettings = listenToSettings(setSettings)
    try {
      const stored = sessionStorage.getItem('lastOrderId')
      if (stored) setLastOrderId(stored)
      setShowWelcome(!sessionStorage.getItem(welcomeKey(tableNumber)))
    } catch {
      setShowWelcome(true)
    }
    return () => { unsubMenu(); unsubSettings() }
  }, [tableNumber])

  useEffect(() => {
    const unsub = listenToTables(tables => {
      const found = tables.find(t => t.tableNumber === tableNumber)
      setTable(found ?? null)
      // Scanning the QR code seats the guest — auto-occupy an available table
      if (found && found.status === 'available') updateTableStatus(found.id, 'occupied')
    })
    return () => unsub()
  }, [tableNumber])

  // ─── Derived menu structure ───────────────────────────────────────────────
  const query = searchQuery.trim().toLowerCase()

  const sections = useMemo(() => {
    const known = CATEGORIES as readonly string[]
    const extra = Array.from(new Set(menuItems.map(i => i.category))).filter(c => !known.includes(c))
    return [...known, ...extra]
      .map(cat => ({
        cat,
        // Available dishes first, sold-out ones sink to the bottom of each section
        items: menuItems.filter(i => i.category === cat).sort((a, b) => Number(b.available) - Number(a.available)),
      }))
      .filter(s => s.items.length > 0)
  }, [menuItems])

  const featured = useMemo(() => menuItems.filter(i => i.badge && i.available).slice(0, 8), [menuItems])

  const searchResults = useMemo(() => {
    if (!query) return []
    return menuItems.filter(item =>
      item.name.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query) ||
      item.tags?.some(t => t.toLowerCase().includes(query)) ||
      item.badge?.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query)
    )
  }, [menuItems, query])

  const currentCategory = activeCategory || sections[0]?.cat || ''

  // ─── Scroll-spy: highlight the category tab for the section in view ───────
  useEffect(() => {
    if (showWelcome !== false || query) return
    const els = sections
      .map(s => document.getElementById(`cat-${slug(s.cat)}`))
      .filter((el): el is HTMLElement => !!el)
    if (els.length === 0) return
    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      const cat = visible[0]?.target.getAttribute('data-cat')
      if (cat) setActiveCategory(cat)
    }, { rootMargin: '-140px 0px -55% 0px' })
    els.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [sections, showWelcome, query])

  // Keep the active tab visible in the horizontal tab strip
  useEffect(() => {
    const strip = tabsRef.current
    const btn = strip?.querySelector<HTMLElement>(`[data-cat="${CSS.escape(currentCategory)}"]`)
    if (!strip || !btn) return
    strip.scrollTo({ left: btn.offsetLeft - strip.clientWidth / 2 + btn.clientWidth / 2, behavior: 'smooth' })
  }, [currentCategory])

  const jumpTo = (cat: string) => {
    const el = document.getElementById(`cat-${slug(cat)}`)
    if (!el) return
    const offset = (headerRef.current?.offsetHeight ?? 120) + 4
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' })
    setActiveCategory(cat)
  }

  // ─── Cart ─────────────────────────────────────────────────────────────────
  const addToCart = useCallback((item: MenuItem, variant?: MenuItemVariant, qty = 1) => {
    const variantName = variant?.name
    const cartItemId = variantName ? `${item.id}::${variantName}` : item.id
    const itemPrice = variant?.price ?? item.price
    setCart(prev => {
      const existing = prev.find(c => c.id === cartItemId)
      if (existing) return prev.map(c => c.id === cartItemId ? { ...c, quantity: c.quantity + qty } : c)
      return [...prev, {
        id: cartItemId,
        baseId: item.id,
        name: item.name,
        price: itemPrice,
        quantity: qty,
        image: item.image ?? '',
        ...(variantName ? { variantName } : {}),
      }]
    })
  }, [])

  const decrement = useCallback((id: string) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === id)
      if (existing && existing.quantity > 1) return prev.map(c => c.id === id ? { ...c, quantity: c.quantity - 1 } : c)
      return prev.filter(c => c.id !== id)
    })
  }, [])

  const increment = useCallback((id: string) => {
    setCart(prev => prev.map(c => c.id === id ? { ...c, quantity: c.quantity + 1 } : c))
  }, [])

  const bumpCartBar = useCallback(() => {
    const el = cartBarRef.current
    if (!el) return
    el.classList.remove('is-bump')
    void el.offsetWidth // restart the animation
    el.classList.add('is-bump')
  }, [])

  const qtyInCart = (itemId: string) =>
    cart.filter(c => (c.baseId ?? c.id.split('::')[0]) === itemId).reduce((s, c) => s + c.quantity, 0)

  const openDish = (item: MenuItem) => {
    setDetailItem(item)
    setDetailVariant(0)
    setDetailQty(1)
  }
  const closeDish = useCallback(() => setDetailItem(null), [])

  const quickAdd = (item: MenuItem) => {
    if (!item.available) return
    if (item.variants?.length) { openDish(item); return }
    addToCart(item)
    bumpCartBar()
  }

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0)
  const taxRate = parseFloat(settings.taxRate || '0') / 100
  const serviceFee = parseFloat(settings.serviceFee || '0')
  const tax = cartTotal * taxRate
  const grandTotal = cartTotal + tax + serviceFee

  // ─── Place order (pending → cashier confirms → guest pays) ────────────────
  const placeOrder = async () => {
    if (cart.length === 0) return
    setIsPlacing(true)
    setOrderError('')
    try {
      const orderItems = cart.map(({ id, baseId, name, price, quantity, image, variantName }) => ({
        id,
        ...(baseId ? { baseId } : {}),
        ...(variantName ? { variantName } : {}),
        name, price, quantity, image: image ?? '',
      }))

      const now = Date.now()
      const orderId = await addOrder(
        {
          tableNumber,
          items: orderItems,
          status: 'preparing', // addOrder overrides this to 'pending'
          paymentStatus: 'pending',
          specialInstructions,
          createdAt: now,
          updatedAt: now,
          total: cartTotal,
          orderType: 'dine-in',
        },
        undefined, // table occupancy is handled by the QR scan
      )

      if (orderId) {
        try {
          sessionStorage.setItem('lastOrderId', orderId)
          // Persist tableId so the checkout page can update the table after payment
          if (table?.id) sessionStorage.setItem(`tableId_${orderId}`, table.id)
        } catch { /* storage unavailable — non-critical */ }
        setLastOrderId(orderId)
        setCart([])
        setSpecialInstructions('')
        setShowConfirm(false)
        router.push(`/status/${orderId}`)
      } else {
        setIsPlacing(false)
        setOrderError('We couldn’t send your order. Please try again.')
      }
    } catch (error) {
      setIsPlacing(false)
      const message = error instanceof Error ? error.message : String(error)
      setOrderError(`We couldn’t send your order. ${message}`)
      console.error('[placeOrder] error:', error)
    }
  }

  // ─── Guards ───────────────────────────────────────────────────────────────
  if (!tableNumber || tableNumber <= 0) {
    return (
      <MessageScreen
        icon="qr_code_scanner"
        title="Table not found"
        body="Please scan the QR code on your table again."
        action={<Link href="/" className="hp-btn hp-btn-ghost">Return home</Link>}
      />
    )
  }

  if (showWelcome === null) return <div className="hp" />

  if (showWelcome) {
    return (
      <WelcomeScreen
        tableNumber={tableNumber}
        restaurantName={settings.restaurantName}
        onStart={() => {
          try { sessionStorage.setItem(welcomeKey(tableNumber), '1') } catch { /* non-critical */ }
          setShowWelcome(false)
          window.scrollTo(0, 0)
        }}
      />
    )
  }

  // ─── Dish row ─────────────────────────────────────────────────────────────
  const renderDish = (item: MenuItem) => {
    const qty = qtyInCart(item.id)
    const hasVariants = !!item.variants?.length
    return (
      <article
        key={item.id}
        className={`hp-dish${item.available ? '' : ' is-soldout'}`}
        onClick={() => item.available && openDish(item)}
        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && item.available) { e.preventDefault(); openDish(item) } }}
        role="button"
        tabIndex={item.available ? 0 : -1}
        aria-label={`${item.name}, ${peso(fromPrice(item))}${item.available ? '' : ', sold out'}`}
      >
        <div className="hp-dish-text">
          {item.badge && <span className="hp-badge">{item.badge}</span>}
          <h3 className="hp-dish-name">{item.name}</h3>
          {item.description && <p className="hp-dish-desc">{item.description}</p>}
          <div className="hp-dish-meta">
            <span className="hp-price">{hasVariants ? 'From ' : ''}{peso(fromPrice(item))}</span>
            {item.tags?.slice(0, 2).map(tag => <span key={tag} className="hp-tag" style={tagTone(tag)}>{tag}</span>)}
          </div>
        </div>
        <div className="hp-dish-media">
          <DishImage src={item.image} alt={item.name} />
          {!item.available ? (
            <span className="hp-soldout-tag">Sold out</span>
          ) : qty > 0 ? (
            <span className="hp-dish-qty" aria-label={`${qty} in your order`}>{qty}</span>
          ) : (
            <button
              type="button"
              className="hp-add"
              aria-label={hasVariants ? `Choose options for ${item.name}` : `Add ${item.name}`}
              onClick={e => { e.stopPropagation(); quickAdd(item) }}
            >
              <span className="material-symbols-outlined">add</span>
            </button>
          )}
        </div>
      </article>
    )
  }

  const detailVariants = detailItem?.variants ?? []
  const detailChosen = detailVariants[detailVariant]
  const detailUnit = detailChosen?.price ?? detailItem?.price ?? 0

  return (
    <div className="hp">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div ref={headerRef} className="hp-topbar-wrap" style={{ position: 'sticky', top: 0, zIndex: 40 }}>
        <TopBar
          title={settings.restaurantName}
          subtitle={`Table ${pad2(tableNumber)} · Dine-in`}
          right={
            <>
              <button
                type="button"
                className="hp-icon-btn"
                aria-label={searchOpen ? 'Close search' : 'Search the menu'}
                onClick={() => { if (searchOpen) setSearchQuery(''); setSearchOpen(o => !o) }}
              >
                <span className="material-symbols-outlined">{searchOpen ? 'close' : 'search'}</span>
              </button>
              <button type="button" className="hp-icon-btn" aria-label={`Your order, ${cartCount} items`} onClick={() => setShowCart(true)}>
                <span className="material-symbols-outlined">shopping_bag</span>
                {cartCount > 0 && <span className="hp-count">{cartCount}</span>}
              </button>
            </>
          }
        >
          {searchOpen && (
            <div className="hp-container" style={{ paddingBottom: 14 }}>
              <label className="hp-search">
                <span className="material-symbols-outlined">search</span>
                <input
                  autoFocus
                  type="search"
                  className="hp-input"
                  placeholder="Search dishes, drinks, ingredients…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  aria-label="Search the menu"
                />
              </label>
            </div>
          )}
          {!query && sections.length > 1 && (
            <nav ref={tabsRef} className="hp-tabs" aria-label="Menu categories">
              {sections.map(s => (
                <button
                  key={s.cat}
                  type="button"
                  data-cat={s.cat}
                  className={`hp-tab${currentCategory === s.cat ? ' is-active' : ''}`}
                  onClick={() => jumpTo(s.cat)}
                >
                  {s.cat}
                </button>
              ))}
            </nav>
          )}
        </TopBar>
      </div>

      <main className="hp-container" style={{ paddingBottom: cartCount > 0 ? 180 : 110 }}>
        {!query && (
          <section className="hp-hero">
            <p className="hp-eyebrow hp-fade-up">À la carte</p>
            <h1 className="hp-display hp-fade-up" style={delay(80)}>What will you<br /><em>have today?</em></h1>
            <p className="hp-muted hp-fade-up" style={delay(160)}>
              Order from your seat — we&apos;ll bring everything to Table {tableNumber}.
            </p>
          </section>
        )}

        {menuLoading ? (
          <section className="hp-section" aria-busy="true">
            {[0, 1, 2, 3].map(n => (
              <div key={n} className="hp-dish" style={{ cursor: 'default' }}>
                <div className="hp-dish-text">
                  <div className="hp-skel" style={{ height: 20, width: '60%' }} />
                  <div className="hp-skel" style={{ height: 12, width: '90%' }} />
                  <div className="hp-skel" style={{ height: 12, width: '40%' }} />
                </div>
                <div className="hp-skel" style={{ width: 112, height: 112, borderRadius: 16 }} />
              </div>
            ))}
          </section>
        ) : query ? (
          <section className="hp-section" style={{ paddingTop: 24 }}>
            <div className="hp-section-head">
              <h2 className="hp-section-title">Results</h2>
              <span className="hp-section-count">{searchResults.length}</span>
            </div>
            {searchResults.length === 0 ? (
              <div className="hp-empty">
                <span className="material-symbols-outlined">search_off</span>
                <p className="hp-title-sm">Nothing matches &ldquo;{searchQuery}&rdquo;</p>
                <p className="hp-muted">Try a different word, or browse the full menu.</p>
              </div>
            ) : (
              <div className="hp-dish-list">{searchResults.map(renderDish)}</div>
            )}
          </section>
        ) : menuItems.length === 0 ? (
          <div className="hp-empty">
            <span className="material-symbols-outlined">menu_book</span>
            <p className="hp-title-sm">The menu is being prepared</p>
            <p className="hp-muted">Please check back in a moment.</p>
          </div>
        ) : (
          <>
            {featured.length > 0 && (
              <section className="hp-section" aria-label="Chef's selection">
                <div className="hp-section-head">
                  <h2 className="hp-section-title">Chef&apos;s <em>selection</em></h2>
                </div>
                <div className="hp-featured">
                  {featured.map(item => (
                    <button key={item.id} type="button" className="hp-feature" onClick={() => openDish(item)}>
                      <DishImage src={item.image} alt={item.name} />
                      <div className="hp-feature-body">
                        <span className="hp-badge">{item.badge}</span>
                        <h3 className="hp-feature-name">{item.name}</h3>
                        <span className="hp-price">{item.variants?.length ? 'From ' : ''}{peso(fromPrice(item))}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {sections.map(s => (
              <section key={s.cat} id={`cat-${slug(s.cat)}`} data-cat={s.cat} className="hp-section">
                <div className="hp-section-head">
                  <h2 className="hp-section-title">{s.cat}</h2>
                  <span className="hp-section-count">{s.items.length}</span>
                </div>
                <div className="hp-dish-list">{s.items.map(renderDish)}</div>
              </section>
            ))}

            <PoweredBy />
          </>
        )}
      </main>

      {/* ─── Floating order bar ─────────────────────────────────────────── */}
      {cartCount > 0 && !showCart && !showConfirm && !detailItem && (
        <button ref={cartBarRef} type="button" className="hp-cartbar" onClick={() => setShowCart(true)}>
          <span className="hp-cartbar-count">{cartCount}</span>
          <span className="hp-cartbar-label">View order</span>
          <span className="hp-cartbar-total">{peso(cartTotal)}</span>
        </button>
      )}

      <BottomNav
        tableNumber={tableNumber}
        active="menu"
        cartCount={cartCount}
        onCart={() => setShowCart(true)}
        orderId={lastOrderId}
      />

      {/* ─── Dish detail ────────────────────────────────────────────────── */}
      <Sheet open={!!detailItem} onClose={closeDish} label={detailItem?.name ?? 'Dish'}>
        {detailItem && (
          <>
            <div className="hp-sheet-body hp-sheet-body-flush">
              <div className="hp-sheet-hero">
                <DishImage src={detailItem.image} alt={detailItem.name} eager />
                <button type="button" className="hp-icon-btn hp-sheet-close" onClick={closeDish} aria-label="Close">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="hp-sheet-content">
                {detailItem.badge && <span className="hp-badge">{detailItem.badge}</span>}
                <h2 className="hp-title" style={{ fontSize: '2rem' }}>{detailItem.name}</h2>
                <span className="hp-price" style={{ fontSize: '1.05rem' }}>{peso(detailUnit)}</span>
                {detailItem.description && <p className="hp-muted">{detailItem.description}</p>}
                {!!detailItem.tags?.length && (
                  <div className="hp-tags">
                    {detailItem.tags.map(tag => <span key={tag} className="hp-tag" style={tagTone(tag)}>{tag}</span>)}
                  </div>
                )}
                {detailVariants.length > 0 && (
                  <div className="hp-field" role="radiogroup" aria-label="Choose an option">
                    <p className="hp-label">Choose an option</p>
                    <div>
                      {detailVariants.map((v, i) => (
                        <button
                          key={v.name}
                          type="button"
                          role="radio"
                          aria-checked={i === detailVariant}
                          className={`hp-option${i === detailVariant ? ' is-selected' : ''}`}
                          onClick={() => setDetailVariant(i)}
                        >
                          <span className="hp-radio" />
                          <span className="hp-option-main"><span className="hp-option-title">{v.name}</span></span>
                          <span className="hp-num hp-small">{peso(v.price)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="hp-sheet-foot hp-sheet-foot-row">
              <Stepper
                value={detailQty}
                min={1}
                label={detailItem.name}
                onDecrement={() => setDetailQty(q => Math.max(1, q - 1))}
                onIncrement={() => setDetailQty(q => q + 1)}
              />
              <button
                type="button"
                className="hp-btn hp-btn-primary hp-btn-split"
                style={{ flex: 1 }}
                disabled={!detailItem.available}
                onClick={() => {
                  addToCart(detailItem, detailChosen, detailQty)
                  closeDish()
                  setTimeout(bumpCartBar, 80)
                }}
              >
                {detailItem.available ? (
                  <><span>Add</span><span className="hp-num">{peso(detailUnit * detailQty)}</span></>
                ) : 'Sold out'}
              </button>
            </div>
          </>
        )}
      </Sheet>

      {/* ─── Your order ─────────────────────────────────────────────────── */}
      <Sheet open={showCart} onClose={() => setShowCart(false)} label="Your order">
        <SheetHeader eyebrow={`Table ${pad2(tableNumber)}`} title="Your order" onClose={() => setShowCart(false)} />
        <div className="hp-sheet-body">
          {cart.length === 0 ? (
            <div className="hp-empty">
              <span className="material-symbols-outlined">shopping_bag</span>
              <p className="hp-title-sm">Nothing here yet</p>
              <p className="hp-muted">Browse the menu and tap + to add a dish.</p>
            </div>
          ) : (
            <>
              <div>
                {cart.map(item => (
                  <div key={item.id} className="hp-line">
                    <DishImage src={item.image} alt={item.name} />
                    <div className="hp-line-main">
                      <p className="hp-line-name">{item.name}</p>
                      <p className="hp-line-sub">
                        {item.variantName ? `${item.variantName} · ` : ''}<span className="hp-num">{peso(item.price * item.quantity)}</span>
                      </p>
                    </div>
                    <Stepper
                      small
                      value={item.quantity}
                      label={item.name}
                      onDecrement={() => decrement(item.id)}
                      onIncrement={() => increment(item.id)}
                    />
                  </div>
                ))}
              </div>

              <label className="hp-field">
                <span className="hp-label">Notes for the kitchen</span>
                <textarea
                  className="hp-input hp-textarea"
                  rows={2}
                  placeholder="Allergies, preferences, no onions…"
                  value={specialInstructions}
                  onChange={e => setSpecialInstructions(e.target.value)}
                />
              </label>

              <div className="hp-totals" style={{ marginTop: 22 }}>
                <div className="hp-total-row"><span>Subtotal</span><span>{peso(cartTotal)}</span></div>
                {tax > 0 && <div className="hp-total-row"><span>Tax ({settings.taxRate}%)</span><span>{peso(tax)}</span></div>}
                {serviceFee > 0 && <div className="hp-total-row"><span>Service fee</span><span>{peso(serviceFee)}</span></div>}
                <div className="hp-total-row hp-total-grand"><span>Total</span><span>{peso(grandTotal)}</span></div>
              </div>
            </>
          )}
        </div>
        {cart.length > 0 && (
          <div className="hp-sheet-foot">
            <button
              type="button"
              className="hp-btn hp-btn-primary hp-btn-lg hp-btn-block"
              onClick={() => { setShowCart(false); setShowConfirm(true) }}
            >
              Review order
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        )}
      </Sheet>

      {/* ─── Review & send ──────────────────────────────────────────────── */}
      <Sheet open={showConfirm} onClose={() => setShowConfirm(false)} dismissible={!isPlacing} label="Send your order">
        <SheetHeader eyebrow="Almost there" title={<>Send your <em>order?</em></>} onClose={isPlacing ? undefined : () => setShowConfirm(false)} />
        <div className="hp-sheet-body">
          <p className="hp-muted">The restaurant confirms your order first, then you pay right from your phone.</p>
          <div className="hp-flow" aria-label="How it works">
            <div className="hp-flow-step"><b>1</b>Send order</div>
            <div className="hp-flow-step"><b>2</b>Restaurant confirms</div>
            <div className="hp-flow-step"><b>3</b>Pay &amp; enjoy</div>
          </div>

          <div style={{ marginTop: 10 }}>
            {cart.map(item => (
              <div key={item.id} className="hp-line hp-line-compact">
                <span className="hp-qty-chip">{item.quantity}×</span>
                <div className="hp-line-main">
                  <p className="hp-line-name">{item.name}</p>
                  {item.variantName && <p className="hp-line-sub">{item.variantName}</p>}
                </div>
                <span className="hp-line-price">{peso(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>

          {specialInstructions && <p className="hp-note">&ldquo;{specialInstructions}&rdquo;</p>}

          <div className="hp-totals" style={{ marginTop: 20 }}>
            <div className="hp-total-row"><span>Subtotal</span><span>{peso(cartTotal)}</span></div>
            {tax > 0 && <div className="hp-total-row"><span>Tax ({settings.taxRate}%)</span><span>{peso(tax)}</span></div>}
            {serviceFee > 0 && <div className="hp-total-row"><span>Service fee</span><span>{peso(serviceFee)}</span></div>}
            <div className="hp-total-row hp-total-grand"><span>Total</span><span>{peso(grandTotal)}</span></div>
          </div>
        </div>
        <div className="hp-sheet-foot">
          {orderError && <p className="hp-error" role="alert">{orderError}</p>}
          <button type="button" className="hp-btn hp-btn-primary hp-btn-lg hp-btn-block" onClick={placeOrder} disabled={isPlacing}>
            {isPlacing
              ? <><span className="material-symbols-outlined hp-spin">progress_activity</span>Sending…</>
              : <>Send order<span className="material-symbols-outlined">send</span></>}
          </button>
          <button
            type="button"
            className="hp-btn hp-btn-quiet hp-btn-block"
            disabled={isPlacing}
            onClick={() => { setShowConfirm(false); setShowCart(true) }}
          >
            Back to order
          </button>
        </div>
      </Sheet>
    </div>
  )
}

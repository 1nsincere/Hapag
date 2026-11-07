'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useSession, signOut as nextAuthSignOut } from 'next-auth/react'
import { signOut as firebaseSignOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import FloorPlanEditor from './components/FloorPlanEditor'
import StaffManager from './components/StaffManager'
import { StaffGuide } from '@/app/components/StaffGuide'
import { compressMenuPhoto } from '@/lib/imageCompress'
import { useQrBaseUrl, cleanBaseUrl, type QrBaseSource } from '@/lib/useQrBaseUrl'
import {
  listenToOrders,
  listenToMenu,
  listenToSettings,
  listenToTables,
  saveMenuItem,
  deleteMenuItem,
  saveSettings,
  createTable,
  updateTableStatus,
  deleteTable,
  updateTable,
  listenToTableTokens,
  ensureTableTokens,
  regenerateTableToken,
  Order,
  MenuItem,
  Table,
  TableStatus,
  CATEGORIES,
  AppSettings,
  DEFAULT_SETTINGS
} from '@/lib/data'

// ─── Types ──────────────────────────────────────────────────────────────────────
export type MenuItemTag = 'bestseller' | 'new' | 'spicy' | 'recommended' | 'vegan'

export type MenuItemVariant = {
  name: string
  price: number
}

// ─── Category Default Variants ──────────────────────────────────────────────────
const CATEGORY_DEFAULT_VARIANTS: Partial<Record<typeof CATEGORIES[number], MenuItemVariant[]>> = {
  'Drinks': [
    { name: '16 oz', price: 0 },
    { name: '22 oz', price: 0 },
    { name: 'Pitcher', price: 0 },
  ],
  'Appetizers': [
    { name: 'Solo', price: 0 },
    { name: 'Sharing (2–3 pax)', price: 0 },
  ],
  'Desserts': [
    { name: 'Small', price: 0 },
    { name: 'Regular', price: 0 },
    { name: 'Large', price: 0 },
  ],
  'Snacks': [
    { name: 'Small', price: 0 },
    { name: 'Regular', price: 0 },
  ],
}

// ─── Tag config ─────────────────────────────────────────────────────────────────
const TAG_STYLES: Record<MenuItemTag, { active: string; dot: string; label: string }> = {
  bestseller: { active: 'bg-amber-100 border-amber-400 text-amber-800', dot: 'bg-amber-400', label: '🏆 Bestseller' },
  new:        { active: 'bg-green-100 border-green-400 text-green-800',   dot: 'bg-green-400',  label: '✨ New' },
  spicy:      { active: 'bg-red-100 border-red-400 text-red-800',         dot: 'bg-red-400',    label: '🌶 Spicy' },
  recommended:{ active: 'bg-violet-100 border-violet-400 text-violet-800',dot: 'bg-violet-400', label: '👌 Recommended' },
  vegan:      { active: 'bg-emerald-100 border-emerald-400 text-emerald-800', dot: 'bg-emerald-400', label: '🌱 Vegan' },
}

const TAG_CARD_STYLES: Record<MenuItemTag, string> = {
  bestseller: 'bg-amber-100 text-amber-800',
  new:        'bg-green-100 text-green-800',
  spicy:      'bg-red-100 text-red-800',
  recommended:'bg-violet-100 text-violet-800',
  vegan:      'bg-emerald-100 text-emerald-800',
}

type AdminView = 'insights' | 'menu' | 'qr' | 'floor' | 'staff' | 'settings'

// ─── QR code address (automatic, with optional override) ───────────────────────
const QR_SOURCE_TEXT: Record<QrBaseSource, string> = {
  manual: 'Using the address you entered.',
  invalid: 'That custom address isn’t a valid link (it must start with http:// or https://) — using the automatic address instead.',
  site: 'Automatic — using this website’s address.',
  lan: 'Automatic — using this computer’s Wi-Fi address so phones on the same network can open it.',
  detecting: 'Detecting this computer’s network address…',
  unavailable: 'Couldn’t detect a network address. Enter one below, or deploy the app online.',
}

function QrAddressCard({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { base, source, candidates } = useQrBaseUrl(value)
  const [override, setOverride] = useState(!!value)
  return (
    <div className="bg-white rounded-xl p-5 border border-zinc-100 shadow-sm">
      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">QR code address</label>
      <div className="flex items-center gap-4">
        {base ? (
          <div className="bg-white p-1.5 border border-zinc-200 rounded-lg shrink-0"><QRCodeSVG value={`${base}/menu/1`} size={72} /></div>
        ) : (
          <div className="w-[84px] h-[84px] rounded-lg bg-zinc-100 animate-pulse shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-xs font-mono text-zinc-800 break-all">{base ? `${base}/menu/1` : '…'}</p>
          <p className={`text-xs mt-1 ${source === 'unavailable' || source === 'invalid' ? 'text-amber-700' : 'text-emerald-700'}`}>{QR_SOURCE_TEXT[source]}</p>
          <p className="text-[11px] text-zinc-400 mt-1">Scan this sample (Table 1) with your phone to check it opens the menu.</p>
        </div>
      </div>
      {source === 'lan' && candidates.length > 1 && !override && (
        <p className="text-[11px] text-zinc-500 mt-3">Other addresses on this computer: {candidates.slice(1).join(', ')}</p>
      )}
      <label className="flex items-center gap-2 mt-4 text-sm text-zinc-700 cursor-pointer">
        <input
          type="checkbox"
          checked={override}
          onChange={e => { setOverride(e.target.checked); if (!e.target.checked) onChange('') }}
          className="accent-orange-700"
        />
        Use a custom address (e.g. your own domain)
      </label>
      {override && (
        <input
          value={value}
          placeholder="https://order.yourrestaurant.com"
          onChange={e => onChange(e.target.value)}
          className="mt-2 w-full bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2 text-zinc-900 font-medium focus:ring-2 focus:ring-primary outline-none text-sm"
        />
      )}
    </div>
  )
}

// ─── Settings View ───────────────────────────────────────────────────────────────
function SettingsView({ initialSettings }: { initialSettings: AppSettings }) {
  const [settings, setSettings] = useState<AppSettings>(initialSettings)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    try {
      // Old Cloudinary/imgbb fields are no longer used — drop them (settings are public)
      const { cloudinaryApiKey: _k, cloudinaryCloudName: _c, cloudinaryUploadPreset: _u, imgbbApiKey: _i, ...clean } = settings
      void _k; void _c; void _u; void _i
      await saveSettings({ ...clean, baseUrl: cleanBaseUrl(clean.baseUrl) } as AppSettings)
      setSaved(true)
      setError(null)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(`Failed to save: ${(err as Error).message}`)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-3xl font-bold text-zinc-900 mb-6">System Settings</h2>
      <div className="space-y-4">
        {[
          { label: 'Restaurant Name', key: 'restaurantName', type: 'text' },
          { label: 'Station Name',    key: 'stationName',    type: 'text' },
          { label: 'Tax Rate (%)',    key: 'taxRate',        type: 'text' },
          { label: 'Service Fee (₱)', key: 'serviceFee',    type: 'text' },
        ].map(({ label, key, type }) => (
          <div key={key} className="bg-white rounded-xl p-5 border border-zinc-100 shadow-sm">
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">{label}</label>
            <input
              type={type}
              value={(settings as Record<string, string>)[key] ?? ''}
              onChange={e => setSettings({ ...settings, [key]: e.target.value })}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2 text-zinc-900 font-medium focus:ring-2 focus:ring-primary outline-none text-sm"
            />
          </div>
        ))}

        <QrAddressCard
          value={settings.baseUrl ?? ''}
          onChange={v => setSettings({ ...settings, baseUrl: v })}
        />

        <div className="bg-white rounded-xl p-5 border border-zinc-100 shadow-sm flex gap-3">
          <span className="material-symbols-outlined text-emerald-600">photo_camera</span>
          <div>
            <p className="text-sm font-bold text-zinc-900">Menu photos need no setup</p>
            <p className="text-xs text-zinc-500 mt-1">
              Upload photos in Menu Manager — they&apos;re resized automatically and saved with each dish.
              No Cloudinary, imgbb or API keys required.
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="bg-primary text-white px-8 py-3 rounded-xl font-bold active:scale-95 transition-all shadow-md flex items-center gap-2"
        >
          {saved ? <><span className="material-symbols-outlined text-sm">check</span> Saved!</> : 'Save Changes'}
        </button>
        {error && <p className="text-red-600 text-sm font-medium mt-2">{error}</p>}
      </div>
    </div>
  )
}

// ─── Main AdminPage ───────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [view, setView] = useState<AdminView>('insights')
  const [guideOpen, setGuideOpen] = useState(false)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [tables, setTables] = useState<Table[]>([])
  const [showModal, setShowModal] = useState(false)
  const [showCreateTableModal, setShowCreateTableModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('All')
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null)
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)
  const [tableToDelete, setTableToDelete] = useState<string | null>(null)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const { base: qrBase, source: qrSource } = useQrBaseUrl(settings.baseUrl)

  // Secret per-table QR codes — generated automatically for any table without one
  const [tableTokens, setTableTokens] = useState<Record<number, string> | null>(null)
  useEffect(() => listenToTableTokens(setTableTokens), [])
  useEffect(() => {
    if (tableTokens && tables.length) {
      ensureTableTokens(tables.map(t => t.tableNumber), tableTokens).catch(err => console.error('[QR tokens]', err))
    }
  }, [tables, tableTokens])
  const tableUrl = (n: number) => `${qrBase}/menu/${n}${tableTokens?.[n] ? `?t=${tableTokens[n]}` : ''}`
  const [printTable, setPrintTable] = useState<number | null>(null)
  const [copies, setCopies] = useState(1)
  // Auth — handled by NextAuth middleware; useSession gives us the user info
  const { data: session } = useSession()
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const [imageUploadStatus, setImageUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [imageUploadMsg, setImageUploadMsg] = useState('')
  const [createTableError, setCreateTableError] = useState<string | null>(null)
  const [newTable, setNewTable] = useState({ tableNumber: 0, name: '', capacity: 4, shape: 'square' as 'square' | 'round' })
  // Save item feedback
  const [saveItemStatus, setSaveItemStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveItemError, setSaveItemError]   = useState('')
  // Bulk availability modal
  const [bulkTarget, setBulkTarget] = useState<{ category: string; available: boolean } | null>(null)

  // Helpers to read variants/tags off the editing item (stored as unknown extra fields)
  const editingVariants = (): MenuItemVariant[] => (editingItem as any)?.variants ?? []
  const editingTags = (): MenuItemTag[] => (editingItem as any)?.tags ?? []

  useEffect(() => {
    const unsubOrders = listenToOrders(setOrders)
    const unsubMenu = listenToMenu(setMenuItems)
    const unsubSettings = listenToSettings(setSettings)
    const unsubTables = listenToTables(setTables)
    return () => { unsubOrders(); unsubMenu(); unsubSettings(); unsubTables() }
  }, [])


  // ─── Computed stats ───────────────────────────────────────────────────────────
  const servedOrders = orders.filter(o => o.status === 'served')
  const totalRevenue = servedOrders.reduce((sum, o) => sum + o.total, 0)
  const avgOrderValue = servedOrders.length > 0 ? servedOrders.reduce((s, o) => s + o.total, 0) / servedOrders.length : 0
  const activeOrders = orders.filter(o => o.status !== 'served').length
  const topTable = orders.reduce((acc, o) => { acc[o.tableNumber] = (acc[o.tableNumber] || 0) + 1; return acc }, {} as Record<number, number>)
  const busiestTable = Object.entries(topTable).sort(([, a], [, b]) => b - a)[0]

  const weeklyData = Array(7).fill(0) as number[]
  servedOrders.forEach(o => { const day = new Date(o.createdAt).getDay(); weeklyData[(day + 6) % 7] += o.total })
  const weekDays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
  const maxVal = Math.max(...weeklyData, 1)

  // ─── Menu filtering ───────────────────────────────────────────────────────────
  const filteredMenu = menuItems.filter(item => {
    const matchSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchCat = activeCategory === 'All' || item.category === activeCategory
    return matchSearch && matchCat
  })

  const categoryCounts = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = menuItems.filter(i => i.category === cat).length
    return acc
  }, {} as Record<string, number>)

  // ─── Handlers ─────────────────────────────────────────────────────────────────
  // Optimistic toggle: flip immediately in state, then sync to Firebase
  const toggleAvailability = async (id: string) => {
    const item = menuItems.find(m => m.id === id)
    if (!item) return
    const next = !item.available
    setMenuItems(prev => prev.map(m => m.id === id ? { ...m, available: next } : m))
    try {
      await saveMenuItem({ ...item, available: next })
    } catch {
      // revert on failure
      setMenuItems(prev => prev.map(m => m.id === id ? { ...m, available: item.available } : m))
    }
  }

  // Bulk availability toggle for an entire category
  const toggleCategoryAvailability = async (category: string, available: boolean) => {
    const items = menuItems.filter(i => i.category === category)
    setMenuItems(prev => prev.map(m => m.category === category ? { ...m, available } : m))
    try {
      await Promise.all(items.map(i => saveMenuItem({ ...i, available })))
    } catch {
      // revert
      setMenuItems(prev => prev.map(m => m.category === category ? { ...m, available: !available } : m))
    }
    setBulkTarget(null)
  }

  const resetImageState = () => { setImageUploadStatus('idle'); setImageUploadMsg('') }

  const handleEdit = (item: MenuItem) => {
    setEditingItem({
      ...item,
      variants: (item as any).variants ?? [],
      tags: (item as any).tags ?? [],
    } as any)
    resetImageState()
    setShowModal(true)
  }

  const handleAdd = () => {
    const defaultCat = 'Appetizers'
    setEditingItem({
      name: '', price: 0, description: '',
      category: defaultCat,
      image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
      available: true,
      variants: CATEGORY_DEFAULT_VARIANTS[defaultCat]?.map(v => ({ ...v })) ?? [],
      tags: [],
    } as any)
    resetImageState()
    setShowModal(true)
  }

  // ── handleSaveItem with try/catch and success/error feedback ──
  const handleSaveItem = async () => {
    if (!editingItem) return
    setSaveItemStatus('saving')
    setSaveItemError('')
    try {
      await saveMenuItem(editingItem as MenuItem)
      setSaveItemStatus('saved')
      setTimeout(() => { setSaveItemStatus('idle'); setShowModal(false); setEditingItem(null) }, 900)
    } catch (err) {
      setSaveItemStatus('error')
      setSaveItemError(`Save failed: ${(err as Error).message}`)
    }
  }

  // ── Matches doc2's working deleteMenuItem pattern ──
  const handleDelete = (id: string) => setItemToDelete(id)

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setImageUploadStatus('uploading')
    setImageUploadMsg('Optimizing photo…')
    try {
      // Resized + compressed in the browser and saved with the dish — no API keys
      const photo = await compressMenuPhoto(file)
      setEditingItem(prev => (prev ? { ...prev, image: photo.dataUrl } : null))
      setImageUploadStatus('done')
      setImageUploadMsg(`Photo ready (${photo.width}×${photo.height}, ${Math.round(photo.bytes / 1024)} KB) — click Save to keep it`)
    } catch (err: unknown) {
      setImageUploadStatus('error')
      setImageUploadMsg((err as Error).message)
    }
  }

  const handleCreateTable = async () => {
    setCreateTableError(null)
    if (!newTable.tableNumber || newTable.tableNumber <= 0) { setCreateTableError('Please enter a valid table number.'); return }
    if (!newTable.name.trim()) { setCreateTableError('Please enter a table name.'); return }
    if (tables.some(t => t.tableNumber === newTable.tableNumber)) { setCreateTableError(`Table #${newTable.tableNumber} already exists.`); return }
    const tableId = await createTable({
      tableNumber: newTable.tableNumber, name: newTable.name.trim(), status: 'available' as TableStatus,
      qrCode: `table-${newTable.tableNumber}`, capacity: newTable.capacity,
      positionX: 0, positionY: 0, shape: newTable.shape,
    })
    if (tableId) { setShowCreateTableModal(false); setNewTable({ tableNumber: 0, name: '', capacity: 4, shape: 'square' }); setCreateTableError(null) }
    else setCreateTableError('Failed to create table. Please try again.')
  }

  // ── Matches doc2's named handler pattern ──
  const handleTableStatusChange = async (tableId: string, status: TableStatus) => {
    await updateTableStatus(tableId, status)
  }

  const handleDeleteTable = async (tableId: string) => {
    await deleteTable(tableId)
    setTableToDelete(null)
  }

  // Login is now handled by /login page — middleware redirects unauthenticated users

  // ─── Editing helpers ──────────────────────────────────────────────────────────
  const editVariant = (i: number, field: keyof MenuItemVariant, value: string | number) => {
    const next = [...editingVariants()]
    next[i] = { ...next[i], [field]: field === 'price' ? (parseFloat(value as string) || 0) : value }
    setEditingItem(prev => prev ? { ...prev, variants: next } as any : null)
  }

  const removeVariant = (i: number) => {
    setEditingItem(prev => prev ? { ...prev, variants: editingVariants().filter((_, j) => j !== i) } as any : null)
  }

  const addVariant = () => {
    setEditingItem(prev => prev ? { ...prev, variants: [...editingVariants(), { name: '', price: 0 }] } as any : null)
  }

  const toggleTag = (tag: MenuItemTag) => {
    const tags = editingTags()
    setEditingItem(prev => prev ? {
      ...prev, tags: tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag]
    } as any : null)
  }

  // Auth is handled by middleware — if we reach here, the user is authenticated

  // ─── Main UI ───────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="bg-background min-h-screen font-sans">
        {mobileSidebar && <div className="fixed inset-0 bg-black/40 z-[55] md:hidden" onClick={() => setMobileSidebar(false)} />}

        {/* Sidebar */}
        <aside className={`h-screen w-64 fixed left-0 top-0 border-r border-zinc-200 bg-zinc-50 flex flex-col py-6 z-[60] transition-transform duration-300 ${mobileSidebar ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
          <div className="px-6 mb-8">
            <h2 className="text-lg font-bold text-zinc-900">{settings.restaurantName}</h2>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Management Portal</p>
          </div>
          <nav className="flex-1 px-2 space-y-1">
            {([
              { key: 'insights', icon: 'analytics', label: 'Insights' },
              { key: 'menu', icon: 'restaurant_menu', label: 'Menu Manager' },
              { key: 'qr', icon: 'table_restaurant', label: 'Table Management' },
              { key: 'floor', icon: 'floor', label: 'Floor Plan' },
              { key: 'staff', icon: 'badge', label: 'Staff' },
              { key: 'settings', icon: 'settings', label: 'System Settings' },
            ] as { key: AdminView; icon: string; label: string }[]).map(item => (
              <button key={item.key} onClick={() => { setView(item.key); setMobileSidebar(false) }}
                className={`flex items-center gap-3 w-full px-4 py-3 text-sm font-medium transition-all rounded-lg ${view === item.key ? 'text-primary bg-orange-50' : 'text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900'}`}>
                <span className="material-symbols-outlined">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
            <button onClick={() => setGuideOpen(true)}
              className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium transition-all rounded-lg text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900">
              <span className="material-symbols-outlined">help</span>How it works
            </button>
          </nav>
          <StaffGuide open={guideOpen} onClose={() => setGuideOpen(false)} role="admin" />
          <div className="px-6 mt-auto">
            <div className="flex items-center gap-3 p-2 bg-white rounded-lg shadow-sm border border-zinc-100">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm">
                {session?.user?.email?.[0]?.toUpperCase() || 'A'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-zinc-900 truncate">{session?.user?.email}</p>
                <p className="text-[9px] text-zinc-400 uppercase tracking-widest font-bold">{session?.user?.role}</p>
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
          </div>
        </aside>

        <main className="md:ml-64 min-h-screen">
          {/* Header */}
          <header className="sticky top-0 z-50 flex justify-between items-center px-6 py-3 w-full bg-white border-b border-zinc-200 shadow-sm">
            <div className="flex items-center gap-4">
              <button onClick={() => setMobileSidebar(true)} className="md:hidden p-2 hover:bg-zinc-100 rounded-lg">
                <span className="material-symbols-outlined">menu</span>
              </button>
              <span className="text-xl font-extrabold tracking-tight text-primary">{settings.restaurantName} Admin</span>
              <div className="relative flex items-center ml-4">
                <span className="material-symbols-outlined absolute left-3 text-zinc-400 text-sm">search</span>
                <input
                  className="bg-zinc-50 border-none rounded-full py-2 pl-10 pr-4 text-sm w-64 focus:ring-2 focus:ring-primary transition-all outline-none"
                  placeholder="Search data, menu..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <span className="text-xs font-semibold text-zinc-500">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </span>
          </header>

          {/* ── Insights ── */}
          {view === 'insights' && (
            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                {[
                  { label: 'TOTAL REVENUE',   value: `₱${totalRevenue.toFixed(2)}`,   icon: 'payments',          trend: '+12.4%' },
                  { label: 'AVG ORDER VALUE', value: `₱${avgOrderValue.toFixed(2)}`,  icon: 'shopping_basket',   trend: '+3.1%' },
                  { label: 'ACTIVE ORDERS',   value: activeOrders,                    icon: 'receipt_long',      sub: 'right now' },
                  { label: 'BUSIEST TABLE',   value: busiestTable ? `Table ${busiestTable[0]}` : '—', icon: 'table_restaurant', sub: busiestTable ? `${busiestTable[1]} orders` : 'No data' },
                ].map(kpi => (
                  <div key={kpi.label} className="bg-white p-6 rounded-xl shadow-sm border border-zinc-100 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{kpi.label}</span>
                      <span className="material-symbols-outlined text-primary bg-orange-50 p-2 rounded-lg">{kpi.icon}</span>
                    </div>
                    <div className="mt-4">
                      <h3 className="text-2xl font-bold text-zinc-900">{kpi.value}</h3>
                      {kpi.trend && <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1 mt-1"><span className="material-symbols-outlined text-sm">trending_up</span>{kpi.trend} vs last week</p>}
                      {kpi.sub && <p className="text-xs text-zinc-500 mt-1">{kpi.sub}</p>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-6">
                <div className="col-span-3 bg-white p-6 rounded-xl shadow-sm border border-zinc-100">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-zinc-900">Revenue Trends</h2>
                      <p className="text-sm text-zinc-500">Weekly performance</p>
                    </div>
                  </div>
                  <div className="h-48 flex items-end gap-3">
                    {weeklyData.map((val, idx) => (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                        <div className={`w-full rounded-t-lg transition-all duration-500 ${idx === 5 ? 'bg-primary' : 'bg-primary/20'}`} style={{ height: `${(val / maxVal) * 160}px` }} />
                        <span className={`text-[10px] font-bold ${idx === 5 ? 'text-primary' : 'text-zinc-400'}`}>{weekDays[idx]}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-span-1 bg-white p-6 rounded-xl shadow-sm border border-zinc-100 flex flex-col">
                  <h2 className="text-xl font-bold text-zinc-900 mb-6">Recent Activity</h2>
                  <div className="space-y-4 flex-1">
                    {orders.slice(0, 5).length === 0 ? (
                      <p className="text-sm text-zinc-500">No orders yet.</p>
                    ) : orders.slice(0, 5).map(o => (
                      <div key={o.id} className="flex gap-3">
                        <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${o.status === 'served' ? 'bg-green-500' : o.status === 'ready' ? 'bg-blue-500' : 'bg-primary'}`} />
                        <div>
                          <p className="text-sm font-bold text-zinc-900">Order #{o.id} — Table {o.tableNumber}</p>
                          <p className="text-xs text-zinc-500">{o.items.length} items · ₱{o.total.toFixed(2)}</p>
                          <p className="text-[10px] text-zinc-400 mt-0.5">{new Date(o.createdAt).toLocaleTimeString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Menu Manager ── */}
          {view === 'menu' && (
            <div className="p-8">
              <div className="flex justify-between items-end mb-6">
                <div>
                  <h2 className="text-3xl font-bold text-zinc-900 mb-1">Menu Manager</h2>
                  <p className="text-sm text-zinc-500">Manage your dishes, availability and pricing.</p>
                </div>
                <button
                  onClick={handleAdd}
                  className="bg-primary hover:bg-orange-800 text-white px-6 py-3 rounded-xl flex items-center gap-2 font-bold transition-all shadow-lg active:scale-95"
                >
                  <span className="material-symbols-outlined">add</span>
                  ADD NEW ITEM
                </button>
              </div>

              {/* Category filter tabs & Bulk Action */}
              <div className="flex justify-between items-center mb-6">
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {['All', ...CATEGORIES].map(cat => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold border transition-all ${
                        activeCategory === cat
                          ? 'bg-primary text-white border-primary shadow-sm'
                          : 'bg-white text-zinc-600 border-zinc-200 hover:border-primary hover:text-primary'
                      }`}
                    >
                      {cat}
                      {cat !== 'All' && categoryCounts[cat] > 0 && (
                        <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] ${activeCategory === cat ? 'bg-white/30 text-white' : 'bg-zinc-100 text-zinc-500'}`}>
                          {categoryCounts[cat]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {activeCategory !== 'All' && categoryCounts[activeCategory] > 0 && (
                  <button
                    onClick={() => {
                      // Determine if all are available to toggle to unavailable, else make all available
                      const items = menuItems.filter(i => i.category === activeCategory)
                      const allAvailable = items.every(i => i.available)
                      setBulkTarget({ category: activeCategory, available: !allAvailable })
                    }}
                    className="flex-shrink-0 ml-4 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-bold text-zinc-500 hover:bg-zinc-100 transition-colors flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[14px]">toggle_on</span>
                    Bulk Toggle
                  </button>
                )}
              </div>

              {filteredMenu.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center border border-zinc-200">
                  <span className="material-symbols-outlined text-zinc-300 text-5xl mb-3">restaurant_menu</span>
                  <p className="text-zinc-500 font-medium">No items found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  {filteredMenu.map(item => {
                    const itemVariants: MenuItemVariant[] = (item as any).variants ?? []
                    const itemTags: MenuItemTag[] = (item as any).tags ?? []
                    return (
                      <div key={item.id} className={`bg-white rounded-2xl overflow-hidden border border-zinc-200 hover:shadow-xl transition-all group ${!item.available ? 'opacity-75' : ''}`}>
                        <div className="relative h-44 overflow-hidden">
                          <img
                            src={item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'}
                            alt={item.name}
                            className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${!item.available ? 'grayscale' : ''}`}
                            onError={e => {
                              const target = e.target as HTMLImageElement
                              const FALLBACK = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'
                              if (target.src !== FALLBACK) target.src = FALLBACK
                            }}
                          />
                          <div className="absolute top-3 left-3 flex gap-1 flex-wrap max-w-[80%]">
                            <span className="bg-white/90 backdrop-blur px-2.5 py-1 rounded-full text-[9px] font-bold text-primary shadow-sm uppercase tracking-wider">
                              {item.category}
                            </span>
                            {itemTags.map(tag => (
                              <span key={tag} className={`px-2.5 py-1 rounded-full text-[9px] font-bold capitalize ${TAG_CARD_STYLES[tag]}`}>
                                {tag}
                              </span>
                            ))}
                          </div>
                          {!item.available && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <span className="bg-red-600 text-white font-black px-4 py-1 rounded-md transform -rotate-12 border-2 border-white text-xs">SOLD OUT</span>
                            </div>
                          )}
                        </div>
                        <div className="p-4">
                          <div className="flex justify-between items-start mb-1">
                            <h3 className={`font-bold text-base leading-tight ${!item.available ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>{item.name}</h3>
                            {itemVariants.length === 0 && (
                              <span className={`font-bold text-sm flex-shrink-0 ml-2 ${!item.available ? 'text-zinc-400' : 'text-primary'}`}>₱{item.price.toFixed(2)}</span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-400 line-clamp-1 mb-2">{item.description}</p>

                          {/* Variant pills */}
                          {itemVariants.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-3">
                              {itemVariants.map((v, i) => (
                                <span key={i} className="bg-orange-50 border border-orange-100 text-orange-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  {v.name} · ₱{v.price}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold ${item.available ? 'text-zinc-500' : 'text-red-600'}`}>
                                {item.available ? 'AVAILABLE' : 'OFF MENU'}
                              </span>
                              <button
                                onClick={() => toggleAvailability(item.id)}
                                className={`w-9 h-5 rounded-full relative p-1 cursor-pointer transition-colors flex-shrink-0 ${item.available ? 'bg-emerald-500' : 'bg-zinc-300'}`}
                              >
                                <div className={`w-3 h-3 bg-white rounded-full transition-transform ${item.available ? 'translate-x-4' : 'translate-x-0'}`} />
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleDelete(item.id)} className="p-1.5 border border-red-100 text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                                <span className="material-symbols-outlined text-[15px]">delete</span>
                              </button>
                              <button onClick={() => handleEdit(item)} className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 rounded-lg text-xs font-bold hover:bg-zinc-50 transition-colors">
                                <span className="material-symbols-outlined text-[13px]">edit</span>
                                EDIT
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Table Management ── */}
          {view === 'qr' && (
            <div className="p-8 max-w-7xl">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
                <div>
                  <h2 className="text-3xl font-bold text-zinc-900 mb-2">Table Management</h2>
                  <p className="text-sm text-zinc-500">Create and manage restaurant tables with QR codes.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-white px-4 py-2 rounded-xl border border-zinc-200 shadow-sm">
                    <span className="text-sm font-bold text-zinc-600">Total Tables: </span>
                    <span className="text-lg font-black text-primary">{tables.length}</span>
                  </div>
                  <button onClick={() => { setCreateTableError(null); setShowCreateTableModal(true) }}
                    className="bg-primary hover:bg-orange-800 text-white px-6 py-3 rounded-xl flex items-center gap-2 font-bold transition-all shadow-lg active:scale-95">
                    <span className="material-symbols-outlined">add</span>
                    CREATE TABLE
                  </button>
                </div>
              </div>

              {qrSource === 'unavailable' && (
                <div className="mb-6 bg-amber-50 border border-amber-300 rounded-xl px-5 py-4 flex items-start gap-3">
                  <span className="material-symbols-outlined text-amber-500 mt-0.5">warning</span>
                  <div>
                    <p className="text-sm font-bold text-amber-800">Couldn&apos;t detect this computer&apos;s network address — QR codes may not open on phones</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Make sure this computer is on Wi-Fi, or open <button onClick={() => setView('settings')} className="underline font-semibold">System Settings</button> and
                      enter an address (e.g. <code className="font-mono bg-amber-100 px-1 rounded">http://192.168.1.42:3000</code>). Once the app is online this happens automatically.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                {[
                  { label: 'Available', value: tables.filter(t => t.status === 'available').length, icon: 'event_available', color: 'text-emerald-600' },
                  { label: 'Occupied', value: tables.filter(t => t.status === 'occupied').length, icon: 'event_busy', color: 'text-red-600' },
                  { label: 'Reserved', value: tables.filter(t => t.status === 'reserved').length, icon: 'event_note', color: 'text-blue-600' },
                  { label: 'Total Capacity', value: tables.reduce((sum, t) => sum + t.capacity, 0), icon: 'group', color: 'text-purple-600' },
                ].map(stat => (
                  <div key={stat.label} className="bg-white p-6 rounded-xl shadow-sm border border-zinc-100">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{stat.label}</span>
                      <span className={`material-symbols-outlined ${stat.color} bg-orange-50 p-2 rounded-lg`}>{stat.icon}</span>
                    </div>
                    <h3 className="text-2xl font-bold text-zinc-900 mt-4">{stat.value}</h3>
                  </div>
                ))}
              </div>

              {tables.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center border border-zinc-200 shadow-sm">
                  <span className="material-symbols-outlined text-zinc-300 text-6xl mb-4">table_restaurant</span>
                  <h3 className="text-xl font-bold text-zinc-900 mb-2">No Tables Created Yet</h3>
                  <p className="text-zinc-500 mb-6">Create your first table to start generating QR codes.</p>
                  <button onClick={() => { setCreateTableError(null); setShowCreateTableModal(true) }}
                    className="bg-primary hover:bg-orange-800 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg active:scale-95">
                    Create Your First Table
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {tables.map(table => {
                    const url = tableUrl(table.tableNumber)
                    const hasToken = !!tableTokens?.[table.tableNumber]
                    return (
                      <div key={table.id} className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden hover:shadow-xl transition-all">
                        <div className="p-6">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h3 className="text-xl font-bold text-zinc-900">Table {table.tableNumber}</h3>
                              <p className="text-sm text-zinc-500">{table.name}</p>
                            </div>
                            <div className={`px-3 py-1 rounded-full text-xs font-bold ${table.status === 'available' ? 'bg-emerald-100 text-emerald-700' : table.status === 'occupied' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                              {table.status.toUpperCase()}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 mb-4 text-sm text-zinc-600">
                            <div className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">group</span><span>{table.capacity} seats</span></div>
                            <div className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">{table.shape === 'round' ? 'circle' : 'square'}</span><span className="capitalize">{table.shape ?? 'square'}</span></div>
                          </div>
                          <div className="bg-zinc-50 p-3 rounded-xl mb-3 flex justify-center">
                            <div className="bg-white p-2 rounded-lg border border-zinc-100 inline-block">
                              <QRCodeSVG value={url} size={80} />
                            </div>
                          </div>
                          <p className="text-[10px] font-mono text-zinc-400 text-center mb-2 break-all leading-snug px-1">{url}</p>
                          <div className="flex items-center justify-center gap-3 mb-3 text-[11px] font-semibold">
                            <a href={url} target="_blank" rel="noreferrer" className={`flex items-center gap-1 text-primary hover:underline ${hasToken ? '' : 'pointer-events-none opacity-40'}`}>
                              <span className="material-symbols-outlined text-sm">open_in_new</span>Open as customer
                            </a>
                            <button
                              onClick={() => { if (confirm(`Issue a new QR code for Table ${table.tableNumber}? Printed codes for this table will stop working.`)) regenerateTableToken(table.tableNumber) }}
                              className="flex items-center gap-1 text-zinc-500 hover:text-zinc-800"
                              title="Use if a QR code was copied or photographed"
                            >
                              <span className="material-symbols-outlined text-sm">autorenew</span>New code
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setPrintTable(table.tableNumber)}
                              className="flex-1 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-lg transition-colors active:scale-95 flex items-center justify-center gap-1">
                              <span className="material-symbols-outlined text-sm">print</span>
                              Print QR
                            </button>
                            <select
                              value={table.status}
                              onChange={e => handleTableStatusChange(table.id, e.target.value as TableStatus)}
                              className="px-3 py-2 bg-zinc-100 border border-zinc-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-primary outline-none flex-1"
                            >
                              <option value="available">Available</option>
                              <option value="occupied">Occupied</option>
                              <option value="reserved">Reserved</option>
                            </select>
                            <button onClick={() => setTableToDelete(table.id)} className="p-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-colors">
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {view === 'floor' && <FloorPlanEditor tables={tables} />}

          {view === 'staff' && <StaffManager currentEmail={session?.user?.email ?? ''} currentName={session?.user?.name ?? ''} />}

          {view === 'settings' && <SettingsView initialSettings={settings} />}
        </main>

        {/* ══════════════════════════════════════════
            ADD / EDIT MENU ITEM MODAL
        ══════════════════════════════════════════ */}
        {showModal && editingItem && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <div className="relative bg-white rounded-3xl shadow-2xl overflow-hidden max-w-lg w-full flex flex-col max-h-[92vh]">

              {/* Modal header */}
              <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-100 flex-shrink-0">
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">
                    {menuItems.find(m => m.id === editingItem.id) ? 'Edit dish' : 'Add new dish'}
                  </h3>
                  <p className="text-xs text-zinc-400">{editingItem.category}</p>
                </div>
                <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 rounded-full transition-colors text-zinc-500 text-sm font-bold">✕</button>
              </div>

              {/* Modal body — scrollable */}
              <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

                {/* Name */}
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Dish name</label>
                  <input
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:ring-2 focus:ring-primary outline-none text-sm"
                    value={editingItem.name ?? ''}
                    onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                    placeholder="e.g. Iced Caramel Latte"
                  />
                </div>

                {/* Category + Base price */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Category</label>
                    <select
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:ring-2 focus:ring-primary outline-none text-sm"
                      value={editingItem.category ?? 'Appetizers'}
                      onChange={e => {
                        const cat = e.target.value as typeof CATEGORIES[number]
                        const defaults = CATEGORY_DEFAULT_VARIANTS[cat]
                        setEditingItem({
                          ...editingItem,
                          category: cat,
                          variants: defaults ? defaults.map(v => ({ ...v })) : [],
                        } as any)
                      }}
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Base price (₱)</label>
                    <input
                      type="number"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:ring-2 focus:ring-primary outline-none text-sm"
                      value={editingItem.price ?? 0}
                      onChange={e => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) || 0 })}
                    />
                    <p className="text-[10px] text-zinc-400 mt-1">
                      {editingVariants().length > 0 ? 'Overridden per variant below' : 'Shown to customers'}
                    </p>
                  </div>
                </div>

                {/* Variants section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                        {editingItem.category === 'Drinks' ? 'Size variants' : 'Variants'}
                      </span>
                      {editingVariants().length > 0 && (
                        <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {editingVariants().length} sizes
                        </span>
                      )}
                    </div>
                    <button
                      onClick={addVariant}
                      className="text-xs font-bold text-primary hover:text-orange-800 flex items-center gap-1 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[14px]">add_circle</span>
                      Add {editingItem.category === 'Drinks' ? 'size' : 'variant'}
                    </button>
                  </div>

                  {editingVariants().length > 0 ? (
                    <div className="border border-zinc-100 rounded-xl overflow-hidden">
                      <div className="grid grid-cols-[1fr_100px_36px] gap-2 px-3 py-2 bg-zinc-50 border-b border-zinc-100">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                          {editingItem.category === 'Drinks' ? 'Size' : 'Variant name'}
                        </span>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Price (₱)</span>
                        <span />
                      </div>
                      {editingVariants().map((v, i) => (
                        <div key={i} className="grid grid-cols-[1fr_100px_36px] gap-2 items-center px-3 py-2.5 border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 transition-colors">
                          <input
                            className="bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900 focus:ring-2 focus:ring-primary outline-none w-full"
                            placeholder={editingItem.category === 'Drinks' ? '16 oz, 22 oz…' : 'Variant name'}
                            value={v.name}
                            onChange={e => editVariant(i, 'name', e.target.value)}
                          />
                          <input
                            type="number"
                            className="bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900 focus:ring-2 focus:ring-primary outline-none w-full"
                            placeholder="0"
                            value={v.price || ''}
                            onChange={e => editVariant(i, 'price', e.target.value)}
                          />
                          <button
                            onClick={() => removeVariant(i)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 border border-red-100 transition-colors text-sm font-bold flex-shrink-0"
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <button
                      onClick={addVariant}
                      className="w-full py-3 rounded-xl border border-dashed border-zinc-200 text-zinc-400 text-xs font-bold hover:border-primary hover:text-primary hover:bg-orange-50 transition-all"
                    >
                      + No variants yet — click to add one
                    </button>
                  )}

                  {editingVariants().length > 0 && (
                    <p className="text-[10px] text-zinc-400 mt-1.5">
                      💡 When variants are set, customers choose a size before adding to cart.
                    </p>
                  )}
                </div>

                {/* Tags */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Tags</span>
                    <div className="flex-1 h-px bg-zinc-100" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(TAG_STYLES) as MenuItemTag[]).map(tag => {
                      const active = editingTags().includes(tag)
                      const style = TAG_STYLES[tag]
                      return (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold border capitalize transition-all ${
                            active ? style.active : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:border-zinc-300'
                          }`}
                        >
                          {style.label}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-1.5">Tags appear as badges on menu cards.</p>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Description</label>
                  <textarea
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:ring-2 focus:ring-primary outline-none resize-none text-sm"
                    rows={2}
                    placeholder="Short description shown to customers…"
                    value={editingItem.description ?? ''}
                    onChange={e => setEditingItem({ ...editingItem, description: e.target.value })}
                  />
                </div>

                {/* Image */}
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Food image</label>

                  {editingItem.image && (
                    <div className="mb-3 relative w-full h-32 rounded-xl overflow-hidden border border-zinc-200 bg-zinc-50">
                      <img
                        key={editingItem.image}
                        src={editingItem.image}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        onError={e => {
                          const target = e.target as HTMLImageElement
                          const FALLBACK = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'
                          if (target.src !== FALLBACK) target.src = FALLBACK
                        }}
                      />
                      {imageUploadStatus === 'uploading' && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2 text-white text-xs font-bold">
                          <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
                          Optimizing…
                        </div>
                      )}
                      {imageUploadStatus === 'done' && (
                        <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded-full">✓ Ready</div>
                      )}
                    </div>
                  )}

                  {imageUploadMsg && (
                    <p className={`text-[11px] mb-2 font-medium ${imageUploadStatus === 'done' ? 'text-emerald-600' : imageUploadStatus === 'error' ? 'text-red-500' : 'text-zinc-400'}`}>
                      {imageUploadMsg}
                    </p>
                  )}

                  <label className={`flex items-center gap-3 w-full bg-zinc-50 border-2 border-dashed rounded-xl px-4 py-3 cursor-pointer transition-colors group ${
                    imageUploadStatus === 'uploading' ? 'border-zinc-200 opacity-50 pointer-events-none' : 'border-zinc-200 hover:border-primary hover:bg-orange-50'
                  }`}>
                    <span className={`material-symbols-outlined text-[20px] transition-colors ${imageUploadStatus === 'uploading' ? 'text-zinc-300' : 'text-zinc-400 group-hover:text-primary'}`}>
                      {imageUploadStatus === 'uploading' ? 'hourglass_top' : 'add_photo_alternate'}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-zinc-700 group-hover:text-primary transition-colors">
                        {imageUploadStatus === 'uploading' ? 'Optimizing…' : 'Upload a photo'}
                      </p>
                      <p className="text-[10px] text-zinc-400">Any photo from your phone or computer · resized automatically</p>
                    </div>
                    <input type="file" accept="image/*" onChange={e => { resetImageState(); handleImageUpload(e) }} disabled={imageUploadStatus === 'uploading'} className="hidden" />
                  </label>

                  <div className="flex items-center gap-3 my-3">
                    <div className="flex-1 h-px bg-zinc-100" />
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">or paste URL</span>
                    <div className="flex-1 h-px bg-zinc-100" />
                  </div>
                  <input
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-zinc-900 focus:ring-2 focus:ring-primary outline-none text-xs"
                    value={editingItem.image?.startsWith('blob:') || editingItem.image?.startsWith('data:') ? '' : (editingItem.image || '')}
                    onChange={e => { setEditingItem({ ...editingItem, image: e.target.value }); resetImageState() }}
                    placeholder={editingItem.image?.startsWith('data:') ? 'Using your uploaded photo' : 'https://images.unsplash.com/…'}
                  />
                </div>
                  {/* Stock */}
<div>
  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
    Stock count
  </label>
  <div className="flex items-center gap-3">
    <input
      type="number"
      min={0}
      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:ring-2 focus:ring-primary outline-none text-sm"
      placeholder="Leave blank for unlimited"
      value={(editingItem as any).stock ?? ''}
      onChange={e => {
        const val = e.target.value
        setEditingItem({
          ...editingItem,
          stock: val === '' ? undefined : parseInt(val) || 0,
        } as any)
      }}
    />
    {(editingItem as any).stock !== undefined && (
      <button
        onClick={() => setEditingItem({ ...editingItem, stock: undefined } as any)}
        className="flex-shrink-0 px-3 py-3 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-500 hover:bg-zinc-100 transition-colors"
        title="Clear stock (unlimited)"
      >
        Clear
      </button>
    )}
  </div>
  <p className="text-[10px] text-zinc-400 mt-1.5">
    💡 This number shows as the <strong>86 badge</strong> on the cashier product card.
    Leave blank for unlimited stock.
  </p>
</div>
                {/* Availability toggle */}
                <div className="flex items-center justify-between bg-zinc-50 rounded-xl px-4 py-3 border border-zinc-100">
                  <div>
                    <p className="text-sm font-bold text-zinc-800">Available on menu</p>
                    <p className="text-xs text-zinc-500">Customers can see and order this item</p>
                  </div>
                  <button
                    onClick={() => setEditingItem({ ...editingItem, available: !editingItem.available })}
                    className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ${editingItem.available ? 'bg-emerald-500' : 'bg-zinc-300'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${editingItem.available ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

              </div>{/* end modal body */}

              {/* Modal footer */}
              <div className="px-6 py-4 border-t border-zinc-100 flex flex-col gap-3 flex-shrink-0">
                {saveItemError && (
                  <div className="text-red-600 text-sm font-semibold text-center bg-red-50 p-2 rounded-lg">
                    {saveItemError}
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowModal(false); setEditingItem(null) }}
                    className="flex-1 py-3 border border-zinc-200 rounded-xl text-sm font-bold text-zinc-600 hover:bg-zinc-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveItem}
                    disabled={imageUploadStatus === 'uploading' || saveItemStatus === 'saving' || saveItemStatus === 'saved'}
                    className={`flex-[2] py-3 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-md ${
                      saveItemStatus === 'saved' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-primary hover:bg-orange-800 text-white'
                    }`}
                  >
                    {imageUploadStatus === 'uploading'
                      ? <><span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> Optimizing photo…</>
                      : saveItemStatus === 'saving'
                      ? <><span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> Saving…</>
                      : saveItemStatus === 'saved'
                      ? <><span className="material-symbols-outlined text-sm">check</span> Saved!</>
                      : menuItems.find(m => m.id === editingItem.id) ? 'Update dish' : 'Add dish'
                    }
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Print Modal */}
        {printTable !== null && (
          <div className="fixed inset-0 bg-zinc-900/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-4xl h-[80vh] flex overflow-hidden shadow-2xl print-root">
              <div className="flex-1 bg-zinc-100 p-8 overflow-y-auto print:bg-white print:p-0 print:overflow-visible">
                <div className="max-w-[800px] mx-auto print:max-w-none print:w-full">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6 print:grid-cols-2 print:gap-8 print:p-8 items-start">
                    {Array.from({ length: copies }).map((_, i) => {
                      const url = tableUrl(printTable)
                      return (
                        <div key={i} className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-200 flex flex-col items-center text-center print:shadow-none print:border-2 print:border-zinc-800 print:break-inside-avoid">
                          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-6 print:bg-black">
                            <span className="material-symbols-outlined text-white text-3xl">restaurant</span>
                          </div>
                          <h2 className="text-xl font-bold text-zinc-900 mb-2 uppercase tracking-widest">{settings.restaurantName}</h2>
                          <h3 className="text-3xl font-black text-primary mb-8 print:text-black">TABLE {printTable}</h3>
                          <div className="bg-white p-3 rounded-2xl border-4 border-zinc-900 mb-6">
                            {url && <QRCodeSVG value={url} size={160} />}
                          </div>
                          <div className="flex items-center gap-2 text-zinc-900 font-bold mb-2">
                            <span className="material-symbols-outlined text-xl">qr_code_scanner</span>
                            <span>SCAN TO ORDER</span>
                          </div>
                          <p className="text-xs text-zinc-500 font-medium">No app download required</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
              <div className="w-80 bg-white border-l border-zinc-200 p-6 flex flex-col print-hide">
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Print setup</h3>
                    <p className="text-sm text-zinc-500">Table {printTable} QR Code</p>
                  </div>
                  <button onClick={() => setPrintTable(null)} className="w-8 h-8 flex items-center justify-center bg-zinc-100 rounded-full text-zinc-500 hover:bg-zinc-200 transition-colors">
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-bold text-zinc-700 mb-3">Number of Copies</label>
                  <div className="flex items-center bg-zinc-50 rounded-xl p-2 gap-4">
                    <button onClick={() => setCopies(Math.max(1, copies - 1))} className="w-10 h-10 bg-white rounded-lg shadow-sm flex items-center justify-center hover:bg-zinc-100 active:scale-95 transition-all">
                      <span className="material-symbols-outlined">remove</span>
                    </button>
                    <span className="flex-1 text-center font-black text-2xl">{copies.toString().padStart(2, '0')}</span>
                    <button onClick={() => setCopies(copies + 1)} className="w-10 h-10 bg-white rounded-lg shadow-sm flex items-center justify-center hover:bg-zinc-100 active:scale-95 transition-all">
                      <span className="material-symbols-outlined">add</span>
                    </button>
                  </div>
                </div>
                <div className="mt-auto pt-6 border-t border-zinc-100 grid grid-cols-2 gap-4">
                  <button onClick={() => setPrintTable(null)} className="py-3 px-4 border-2 border-zinc-200 font-bold text-sm rounded-xl hover:bg-zinc-50 transition-colors">Cancel</button>
                  <button onClick={() => window.print()} className="py-3 px-4 bg-primary text-white font-bold text-sm rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-orange-800">
                    <span className="material-symbols-outlined text-[18px]">print</span>
                    Print Now
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Menu Item Modal */}
        {itemToDelete && (
          <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-red-600 text-3xl">delete_forever</span>
              </div>
              <h3 className="text-xl font-bold text-zinc-900 mb-2">Delete Dish?</h3>
              <p className="text-sm text-zinc-500 mb-8">Are you sure? This action cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setItemToDelete(null)} className="flex-1 py-3 border-2 border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors rounded-xl font-bold">Cancel</button>
                <button
                  onClick={async () => { if (itemToDelete) { await deleteMenuItem(itemToDelete); setItemToDelete(null) } }}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 transition-colors text-white rounded-xl font-bold shadow-lg active:scale-95"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Toggle Modal */}
        {bulkTarget && (
          <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-6 text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-blue-600 text-3xl">toggle_on</span>
              </div>
              <h3 className="text-xl font-bold text-zinc-900 mb-2">Bulk Update {bulkTarget.category}?</h3>
              <p className="text-sm text-zinc-500 mb-8">
                Mark all items in <strong>{bulkTarget.category}</strong> as{' '}
                <strong className={bulkTarget.available ? 'text-green-600' : 'text-red-600'}>
                  {bulkTarget.available ? 'Available' : 'Unavailable'}
                </strong>?
              </p>
              <div className="flex gap-3">
                <button onClick={() => setBulkTarget(null)} className="flex-1 py-3 border-2 border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors rounded-xl font-bold">Cancel</button>
                <button
                  onClick={() => toggleCategoryAvailability(bulkTarget.category, bulkTarget.available)}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 transition-colors text-white rounded-xl font-bold shadow-lg active:scale-95"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Table Modal */}
        {tableToDelete && (
          <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-red-600 text-3xl">table_restaurant</span>
              </div>
              <h3 className="text-xl font-bold text-zinc-900 mb-2">Delete Table?</h3>
              <p className="text-sm text-zinc-500 mb-8">This will permanently remove the table and its QR code.</p>
              <div className="flex gap-3">
                <button onClick={() => setTableToDelete(null)} className="flex-1 py-3 border-2 border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors rounded-xl font-bold">Cancel</button>
                <button
                  onClick={async () => { if (tableToDelete) await handleDeleteTable(tableToDelete) }}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 transition-colors text-white rounded-xl font-bold shadow-lg active:scale-95"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Table Modal */}
        {showCreateTableModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateTableModal(false)} />
            <div className="relative bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-zinc-900">Create New Table</h3>
                <button onClick={() => setShowCreateTableModal(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Table #</label>
                    <input type="number" className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:ring-2 focus:ring-primary outline-none"
                      value={newTable.tableNumber} onChange={e => setNewTable({ ...newTable, tableNumber: parseInt(e.target.value) || 0 })} placeholder="1" min="1" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Capacity</label>
                    <input type="number" className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:ring-2 focus:ring-primary outline-none"
                      value={newTable.capacity} onChange={e => setNewTable({ ...newTable, capacity: parseInt(e.target.value) || 4 })} placeholder="4" min="1" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Table Name</label>
                  <input className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:ring-2 focus:ring-primary outline-none"
                    value={newTable.name} onChange={e => setNewTable({ ...newTable, name: e.target.value })} placeholder="e.g., Window Seat" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Shape</label>
                  <select className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:ring-2 focus:ring-primary outline-none"
                    value={newTable.shape} onChange={e => setNewTable({ ...newTable, shape: e.target.value as 'square' | 'round' })}>
                    <option value="square">Square</option>
                    <option value="round">Round</option>
                  </select>
                </div>
                {newTable.tableNumber > 0 && (
                  <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-100">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">QR will link to</p>
                    <p className="text-xs font-mono text-zinc-600 break-all">
                      {qrBase || '…'}/menu/{newTable.tableNumber}
                    </p>
                  </div>
                )}
                {createTableError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <p className="text-[11px] text-red-600 font-medium">{createTableError}</p>
                  </div>
                )}
                <button onClick={handleCreateTable} className="w-full bg-primary text-white py-4 rounded-2xl font-bold active:scale-95 transition-all shadow-lg hover:bg-orange-800">
                  Create Table
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  )
}
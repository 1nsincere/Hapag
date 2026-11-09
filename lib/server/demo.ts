/**
 * Server side of the public demo (see lib/demo.ts).
 *
 *  ensureDemoReady()  first visit to the landing page: creates the demo staff
 *                     accounts, and the demo restaurant if the database is empty
 *  resetDemo()        nightly (Vercel Cron → /api/demo/reset): removes everything
 *                     tagged demo: true and re-creates the demo restaurant
 *  demoSignInToken()  one-click "enter as Cashier" etc. — no passwords involved
 *
 * Only anything tagged demo: true is ever deleted.
 */
import { randomBytes } from 'crypto'
import type { DocumentReference, Firestore } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from './firebaseAdmin'
import { DEMO_ACCOUNTS, DEMO_MODE, type DemoRole } from '@/lib/demo'
import { DEFAULT_BRAND_COLOR } from '@/lib/theme'
import demoData from '@/lib/demo-data.json'

type MenuSeed = { name: string; price: number; variants?: { name: string; price: number }[]; stock?: number; available?: boolean; image?: string; [k: string]: unknown }
type TableSeed = { n: number; name: string; capacity: number; shape: string; floor: number; x: number; y: number; w: number; h: number; rotation?: number }
type FloorSeed = { name: string; width: number; height: number; elements: Record<string, unknown>[] }
type OrderSeed = { table: number; status: string; paid: boolean; ago: number; items: (string | number)[][]; note?: string; takeout?: boolean }

const MENU = demoData.menu as MenuSeed[]
const TABLES = demoData.tables as TableSeed[]
const FLOORS = demoData.floors as FloorSeed[]
const ORDERS = demoData.orders as OrderSeed[]
const GUEST_TABLE = 1

function assertDemo() {
  if (!DEMO_MODE) throw new Error('Demo mode is off (NEXT_PUBLIC_DEMO_MODE).')
}

/** Demo staff logins + profiles (demo: true → restricted by firestore.rules). Passwords are random and never used. */
async function ensureDemoAccounts(db: Firestore) {
  const auth = adminAuth()
  const now = Date.now()
  for (const [role, acc] of Object.entries(DEMO_ACCOUNTS) as [DemoRole, typeof DEMO_ACCOUNTS[DemoRole]][]) {
    try {
      await auth.getUser(acc.uid)
    } catch {
      await auth.createUser({ uid: acc.uid, email: acc.email, displayName: acc.name, password: randomBytes(24).toString('base64url') })
    }
    await db.collection('staff').doc(acc.uid).set(
      { name: acc.name, email: acc.email, role, active: true, demo: true, createdAt: now, updatedAt: now },
      { merge: true },
    )
  }
}

async function deleteTagged(db: Firestore, col: string) {
  const snap = await db.collection(col).where('demo', '==', true).get()
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch()
    snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
  return snap.size
}

/** Removes demo-tagged data and creates the demo restaurant (menu, floors, tables, sample orders). */
async function seedDemoRestaurant(db: Firestore) {
  for (const col of ['orders', 'serviceRequests', 'paymentSessions', 'menu', 'tables', 'floors']) await deleteTagged(db, col)
  const now = Date.now()

  // Menu
  const batch = db.batch()
  const menuByName: Record<string, MenuSeed & { id: string }> = {}
  for (const item of MENU) {
    const ref = db.collection('menu').doc()
    const data: Record<string, unknown> = { available: true, tags: [], ...item, demo: true }
    if (data.stock === undefined) delete data.stock
    batch.set(ref, data)
    menuByName[item.name] = { ...item, id: ref.id }
  }

  // Floors
  const floorIds = FLOORS.map((f, i) => {
    const ref = db.collection('floors').doc()
    batch.set(ref, {
      name: f.name, order: i, width: f.width, height: f.height,
      elements: f.elements.map((e, j) => ({ id: `demo-${i}-${j}`, rotation: 0, ...e })),
      createdAt: now, updatedAt: now, demo: true,
    })
    return ref.id
  })

  // Tables (skip numbers the owner created themselves)
  const existing = new Set((await db.collection('tables').get()).docs.map(d => d.get('tableNumber')))
  const tableRefs: Record<number, DocumentReference> = {}
  for (const t of TABLES) {
    if (existing.has(t.n)) continue
    const ref = db.collection('tables').doc()
    tableRefs[t.n] = ref
    batch.set(ref, {
      tableNumber: t.n, name: t.name, status: 'available', qrCode: `table-${t.n}`, capacity: t.capacity,
      shape: t.shape, floorId: floorIds[t.floor], positionX: t.x, positionY: t.y, width: t.w, height: t.h, rotation: t.rotation ?? 0,
      currentOrderId: null, occupiedAt: null, createdAt: now, updatedAt: now, demo: true,
    })
  }

  // Secret QR codes stay the same across resets (so shared demo links keep working)
  const secrets = await db.collection('tableSecrets').get()
  const have = new Set(secrets.docs.map(d => d.id))
  for (const t of TABLES) {
    if (!have.has(String(t.n))) batch.set(db.collection('tableSecrets').doc(String(t.n)), { token: randomBytes(10).toString('base64url').slice(0, 14), createdAt: now })
  }

  // Sample orders in every stage (table 1 left free for visitors)
  const taxRate = (parseFloat(String(demoData.settings.taxRate)) || 0) / 100
  for (const o of ORDERS) {
    const items = o.items.map(([name, quantity, variantName]) => {
      const m = menuByName[String(name)]
      const price = variantName ? m.variants!.find(v => v.name === variantName)!.price : m.price
      return {
        id: variantName ? `${m.id}::${variantName}` : m.id, baseId: m.id, name: String(name), price, quantity: Number(quantity),
        image: m.image ?? '', ...(variantName ? { variantName: String(variantName) } : {}),
      }
    })
    const total = items.reduce((s, i) => s + i.price * i.quantity, 0)
    const created = now - o.ago * 60_000
    const ref = db.collection('orders').doc()
    batch.set(ref, {
      tableNumber: o.table, items, total, status: o.status, orderType: o.takeout ? 'takeout' : 'dine-in',
      paymentStatus: o.paid ? 'paid' : 'pending', priceSource: 'server',
      ...(o.paid ? { paymentMethod: o.takeout ? 'cash' : 'qrph', tipAmount: 0, grandTotal: Math.round(total * (1 + taxRate) * 100) / 100, paidAt: created + 60_000 } : {}),
      ...(o.note ? { specialInstructions: o.note } : {}),
      createdAt: created, updatedAt: created + 120_000, demo: true,
    })
    const tableRef = tableRefs[o.table]
    if (o.table && tableRef && (o.status !== 'served' || o.ago < 60)) {
      batch.update(tableRef, { status: 'occupied', currentOrderId: ref.id, occupiedAt: created, updatedAt: created })
    }
  }
  await batch.commit()
}

async function resetSettings(db: Firestore, overwriteLook: boolean) {
  const ref = db.collection('settings').doc('general')
  const snap = await ref.get()
  if (!snap.exists) {
    await ref.set({ ...demoData.settings, baseUrl: '', brandColor: DEFAULT_BRAND_COLOR, themeMode: 'light' })
  } else if (overwriteLook) {
    // Visitors may change the brand colour during the day — put it back
    await ref.update({ brandColor: DEFAULT_BRAND_COLOR, themeMode: 'light' })
  }
}

/** Landing page calls this on every request; does real work only the first time. */
export async function ensureDemoReady() {
  if (!DEMO_MODE) return
  const db = adminDb()
  const [profile, anyMenu] = await Promise.all([
    db.collection('staff').doc(DEMO_ACCOUNTS.admin.uid).get(),
    db.collection('menu').limit(1).get(),
  ])
  if (profile.exists && !anyMenu.empty) return

  // Only one request does the setup
  const lock = db.collection('_system').doc('demoSetup')
  const claimed = await db.runTransaction(async tx => {
    const l = await tx.get(lock)
    if (l.exists && Date.now() - Number(l.get('at')) < 2 * 60_000) return false
    tx.set(lock, { at: Date.now() })
    return true
  })
  if (!claimed) return
  await ensureDemoAccounts(db)
  if (anyMenu.empty) await seedDemoRestaurant(db)
  await resetSettings(db, false)
}

/** Nightly: fresh demo restaurant, demo accounts repaired, brand colour back to default. */
export async function resetDemo() {
  assertDemo()
  const db = adminDb()
  await ensureDemoAccounts(db)
  await seedDemoRestaurant(db)
  await resetSettings(db, true)
  // Demo accounts get fresh random passwords (undoes any password a visitor set)
  const auth = adminAuth()
  await Promise.all(Object.values(DEMO_ACCOUNTS).map(a => auth.updateUser(a.uid, { password: randomBytes(24).toString('base64url') })))
}

/**
 * Keeps the sample orders looking current ("2 min ago", not "8h ago") between
 * nightly resets. Shifts only the demo's own sample orders (no customerUid),
 * keeping their spacing; visitors' orders are left alone. At most every 20 min.
 */
export async function refreshDemoClock() {
  if (!DEMO_MODE) return
  const db = adminDb()
  const marker = db.collection('_system').doc('demoClock')
  const now = Date.now()
  const go = await db.runTransaction(async tx => {
    const m = await tx.get(marker)
    if (m.exists && now - Number(m.get('at')) < 20 * 60_000) return false
    tx.set(marker, { at: now })
    return true
  })
  if (!go) return

  const snap = await db.collection('orders').where('demo', '==', true).get()
  const samples = snap.docs.filter(d => !d.get('customerUid'))
  if (!samples.length) return
  const newest = Math.max(...samples.map(d => Number(d.get('createdAt')) || 0))
  const shift = now - 2 * 60_000 - newest            // newest sample becomes "2 min ago"
  if (shift < 10 * 60_000) return                     // already fresh enough

  const batch = db.batch()
  for (const d of samples) {
    const patch: Record<string, number> = {}
    for (const f of ['createdAt', 'updatedAt', 'paidAt'] as const) {
      const v = Number(d.get(f))
      if (v) patch[f] = v + shift
    }
    batch.update(d.ref, patch)
  }
  // Tables seated by those sample orders
  const ids = new Set(samples.map(d => d.id))
  const tables = await db.collection('tables').where('demo', '==', true).get()
  for (const t of tables.docs) {
    const occ = Number(t.get('occupiedAt'))
    if (occ && ids.has(String(t.get('currentOrderId')))) batch.update(t.ref, { occupiedAt: occ + shift })
  }
  await batch.commit()
}

/** A short-lived Firebase sign-in token for a demo staff account. */
export async function demoSignInToken(role: DemoRole) {
  assertDemo()
  const acc = DEMO_ACCOUNTS[role]
  if (!acc) throw new Error('Unknown demo role')
  return adminAuth().createCustomToken(acc.uid)
}

/** What the landing page needs: the guest link for the free table, and the restaurant name. */
export async function demoInfo() {
  if (!DEMO_MODE) return null
  const db = adminDb()
  const [secret, settings] = await Promise.all([
    db.collection('tableSecrets').doc(String(GUEST_TABLE)).get(),
    db.collection('settings').doc('general').get(),
  ])
  const token = secret.get('token') as string | undefined
  // A demo site's QR address is always automatic. A saved home-network address
  // (e.g. http://192.168.x.x:3000 from local testing) would break every QR code.
  const baseUrl = String(settings.get('baseUrl') ?? '')
  if (/^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(baseUrl.replace(/\s+/g, ''))) {
    await db.collection('settings').doc('general').update({ baseUrl: '' }).catch(() => {})
  }
  return {
    guestPath: token ? `/menu/${GUEST_TABLE}?t=${encodeURIComponent(token)}` : `/menu/${GUEST_TABLE}`,
    restaurantName: String(settings.get('restaurantName') ?? demoData.settings.restaurantName),
  }
}

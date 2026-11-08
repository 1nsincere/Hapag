#!/usr/bin/env node
/**
 * Hapag demo data — fills Firestore with a realistic Filipino menu, tables and
 * orders in every stage so you can try the customer, cashier, kitchen and
 * admin screens right away (also handy for sales demos).
 *
 *   npm run seed:demo            replace demo data (menu, floors, tables, sample orders)
 *   npm run seed:demo -- --no-orders   menu + tables only
 *   npm run seed:demo:remove     delete ONLY demo data (anything tagged demo: true)
 *
 * Signs in as the admin account (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD,
 * defaulting to the built-in demo admin) so the normal security rules apply.
 * Your own menu items, tables and orders are never touched.
 */
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, query, where, writeBatch,
} from 'firebase/firestore'

const args = new Set(process.argv.slice(2))
const REMOVE_ONLY = args.has('--remove')
const WITH_ORDERS = !args.has('--no-orders')

// ── Firebase config from .env.local ────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const app = initializeApp({
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
})
const db = getFirestore(app)

// ── Demo content (shared with the live demo reset in lib/server/demo.ts) ──
const DEMO = JSON.parse(readFileSync(new URL('../lib/demo-data.json', import.meta.url), 'utf8'))
const MENU = DEMO.menu
const TABLES = DEMO.tables
const FLOORS = DEMO.floors
// Orders in every stage. Table 1 is left free for you to order from your phone.
const ORDERS = DEMO.orders
const DEFAULT_SETTINGS = { ...DEMO.settings, baseUrl: '' }

// ── Helpers ────────────────────────────────────────────────────────────────
async function removeDemo(col) {
  const snap = await getDocs(query(collection(db, col), where('demo', '==', true)))
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db)
    snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
  return snap.size
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@restaurant.com'
  const password = process.env.SEED_ADMIN_PASSWORD || 'admin123'
  // Retry briefly — sign-in occasionally fails on flaky connections
  for (let attempt = 1; ; attempt++) {
    try { await signInWithEmailAndPassword(getAuth(app), email, password); break }
    catch (e) {
      if (attempt >= 5 || e.code !== 'auth/network-request-failed') throw e
      await new Promise(r => setTimeout(r, 1500 * attempt))
    }
  }
  console.log(`Signed in as ${email} → project ${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}`)

  const removed = {
    orders: await removeDemo('orders'),
    menu: await removeDemo('menu'),
    tables: await removeDemo('tables'),
    floors: await removeDemo('floors'),
  }
  console.log(`Removed previous demo data: ${removed.menu} dishes, ${removed.tables} tables, ${removed.floors} floors, ${removed.orders} orders`)
  if (REMOVE_ONLY) return

  const now = Date.now()

  // Staff profiles for the built-in demo accounts (so they show up in Admin → Staff
  // and get their role from the staff list). Skips any account whose password was changed.
  const DEMO_STAFF = [
    { email: 'admin@restaurant.com', password: 'admin123', name: 'Owner (demo admin)', role: 'admin' },
    { email: 'cashier@restaurant.com', password: 'cashier123', name: 'Demo Cashier', role: 'cashier' },
    { email: 'kitchen@restaurant.com', password: 'kitchen123', name: 'Demo Kitchen', role: 'kitchen' },
  ]
  let profiles = 0
  for (const s of DEMO_STAFF) {
    const probe = initializeApp(app.options, `probe-${s.role}`)
    try {
      const cred = await signInWithEmailAndPassword(getAuth(probe), s.email, s.password)
      const ref = doc(db, 'staff', cred.user.uid)
      if (!(await getDoc(ref)).exists()) {
        await setDoc(ref, { name: s.name, email: s.email, role: s.role, active: true, createdAt: now, updatedAt: now })
        profiles++
      }
    } catch { /* password changed or account missing — leave it alone */ }
    finally { await deleteApp(probe) }
  }
  if (profiles) console.log(`Created ${profiles} demo staff profile(s)`)

  // Settings — only created if the restaurant hasn't saved its own yet
  const settingsRef = doc(db, 'settings', 'general')
  if (!(await getDoc(settingsRef)).exists()) {
    await setDoc(settingsRef, DEFAULT_SETTINGS)
    console.log(`Created settings (restaurant name "${DEFAULT_SETTINGS.restaurantName}", 12% VAT)`)
  } else {
    console.log('Settings already exist — left unchanged')
  }

  // Menu
  const menuBatch = writeBatch(db)
  const menuByName = {}
  for (const item of MENU) {
    const ref = doc(collection(db, 'menu'))
    const data = { available: true, tags: [], ...item, demo: true }
    if (data.stock === undefined) delete data.stock
    menuBatch.set(ref, data)
    menuByName[item.name] = { id: ref.id, ...data }
  }
  await menuBatch.commit()

  // Floors — demo floors go after any floors the restaurant already drew
  const existingFloors = (await getDocs(collection(db, 'floors'))).docs.map(d => d.data())
  // Put demo floors BEFORE the restaurant's own floors (orders may go negative)
  const minOrder = existingFloors.reduce((m, f) => Math.min(m, f.order ?? 0), 0)
  const startOrder = existingFloors.length ? minOrder - FLOORS.length : 0
  const floorIds = []
  const floorBatch = writeBatch(db)
  FLOORS.forEach((f, i) => {
    const ref = doc(collection(db, 'floors'))
    floorIds.push(ref.id)
    floorBatch.set(ref, {
      name: f.name, order: startOrder + i, width: f.width, height: f.height,
      elements: f.elements.map((e, j) => ({ id: `demo-${i}-${j}`, rotation: 0, ...e })),
      createdAt: now, updatedAt: now, demo: true,
    })
  })
  await floorBatch.commit()

  // Tables — skip numbers the restaurant already created itself
  const existing = new Set((await getDocs(collection(db, 'tables'))).docs.map(d => d.data().tableNumber))
  const tableIds = {}
  const tableBatch = writeBatch(db)
  let tablesAdded = 0
  TABLES.forEach(t => {
    if (existing.has(t.n)) return
    const ref = doc(collection(db, 'tables'))
    tableIds[t.n] = ref.id
    tableBatch.set(ref, {
      tableNumber: t.n, name: t.name, status: 'available', qrCode: `table-${t.n}`, capacity: t.capacity,
      shape: t.shape, floorId: floorIds[t.floor], positionX: t.x, positionY: t.y, width: t.w, height: t.h, rotation: t.rotation ?? 0,
      currentOrderId: null, occupiedAt: null, createdAt: now, updatedAt: now, demo: true,
    })
    tablesAdded++
  })
  await tableBatch.commit()

  // Secret QR codes — customers can only order with the table's code (?t=…)
  const secrets = Object.fromEntries((await getDocs(collection(db, 'tableSecrets'))).docs.map(d => [d.id, d.data().token]))
  const secretBatch = writeBatch(db)
  for (const t of TABLES) {
    if (!secrets[String(t.n)]) {
      secrets[String(t.n)] = randomBytes(10).toString('base64url').slice(0, 14)
      secretBatch.set(doc(db, 'tableSecrets', String(t.n)), { token: secrets[String(t.n)], createdAt: now })
    }
  }
  await secretBatch.commit()

  // Orders
  let ordersAdded = 0
  if (WITH_ORDERS) {
    const orderBatch = writeBatch(db)
    for (const o of ORDERS) {
      const items = o.items.map(([name, quantity, variantName]) => {
        const m = menuByName[name]
        const price = variantName ? m.variants.find(v => v.name === variantName).price : m.price
        const id = variantName ? `${m.id}::${variantName}` : m.id
        return { id, baseId: m.id, name, price, quantity, image: m.image, ...(variantName ? { variantName } : {}) }
      })
      const total = items.reduce((s, i) => s + i.price * i.quantity, 0)
      const created = now - o.ago * 60_000
      const grandTotal = Math.round(total * 1.12 * 100) / 100
      const ref = doc(collection(db, 'orders'))
      orderBatch.set(ref, {
        tableNumber: o.table, items, total, status: o.status, orderType: o.takeout ? 'takeout' : 'dine-in',
        paymentStatus: o.paid ? 'paid' : 'pending',
        ...(o.paid ? { paymentMethod: o.takeout ? 'cash' : 'qrph', tipAmount: 0, grandTotal, paidAt: created + 60_000 } : {}),
        ...(o.note ? { specialInstructions: o.note } : {}),
        createdAt: created, updatedAt: created + 120_000, demo: true,
      })
      // Seated guests occupy their table until the cashier clears it
      // Table 7 (served recently) stays occupied → shows "Ready to clear" on the map
      if (o.table && tableIds[o.table] && (o.status !== 'served' || o.ago < 60)) {
        orderBatch.update(doc(db, 'tables', tableIds[o.table]), {
          status: 'occupied', currentOrderId: ref.id, occupiedAt: created, updatedAt: created,
        })
      }
      ordersAdded++
    }
    await orderBatch.commit()
  }

  console.log(`Added ${MENU.length} dishes, ${FLOORS.length} floors, ${tablesAdded} tables, ${ordersAdded} orders (all tagged demo: true)`)
  console.log('\nCustomer links (what each table QR opens — table 1 is free to order from):')
  for (const t of TABLES) console.log(`  Table ${t.n}:  /menu/${t.n}?t=${secrets[String(t.n)]}`)
  console.log('\nStaff:  /cashier  ·  /kitchen  ·  /admin  (Admin → Table Management shows every QR code)')
}

main()
  .catch(e => { console.error('Seeding failed:', e.code || '', e.message); process.exitCode = 1 })
  .finally(() => deleteApp(app))

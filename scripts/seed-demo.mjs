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

// ── Demo content ───────────────────────────────────────────────────────────
const img = id => `https://images.unsplash.com/${id}?w=800&q=72&auto=format&fit=crop`

const MENU = [
  // Appetizers
  { name: 'Lumpiang Shanghai', category: 'Appetizers', price: 180, badge: 'Bestseller', tags: ['Good for sharing'],
    description: 'Crisp pork and vegetable spring rolls with sweet chili dip. 12 pieces.', image: img('photo-1606755962773-d324e0a13086') },
  { name: 'Sizzling Sisig', category: 'Appetizers', price: 320, badge: 'Signature', tags: ['Spicy', 'Bestseller'],
    description: 'Chopped pork face and ears on a hot plate with calamansi, chili and a raw egg.', image: img('photo-1504674900247-0877df9cc836') },
  { name: 'Bola-Bola', category: 'Appetizers', price: 220, tags: ['New'],
    description: 'Pork and shrimp meatballs with sweet-sour glaze.', image: img('photo-1529042410759-befb1204b468') },

  // Mains
  { name: 'Kare-Kare', category: 'Mains', price: 485, badge: "Chef's pick", tags: ['Bestseller'],
    description: 'Oxtail and tripe in a silky peanut sauce, with sautéed bagoong on the side.', image: img('photo-1631452180519-c014fe946bc7'),
    variants: [{ name: 'Solo', price: 485 }, { name: 'Good for 3–4', price: 1250 }] },
  { name: 'Crispy Pata', category: 'Mains', price: 695, tags: ['Good for sharing'], stock: 6,
    description: 'Slow-braised pork knuckle fried until glass-crisp. Soy-vinegar dip.', image: img('photo-1544025162-d76694265947') },
  { name: 'Chicken Inasal', category: 'Mains', price: 245, tags: ['Bestseller'],
    description: 'Bacolod-style grilled chicken leg quarter basted in annatto oil. With rice.', image: img('photo-1626645738196-c2a7c87a8f58') },
  { name: 'Sinigang na Baboy', category: 'Mains', price: 390, tags: ['Sour', 'Comfort food'],
    description: 'Pork belly in a bright tamarind broth with kangkong, radish and string beans.', image: img('photo-1547592180-85f173990554'),
    variants: [{ name: 'Solo', price: 390 }, { name: 'Good for 3–4', price: 980 }] },
  { name: 'Pork BBQ Skewers', category: 'Mains', price: 150, tags: ['Street food'],
    description: 'Three sweet-glazed pork skewers, charcoal grilled.', image: img('photo-1555939594-58d7cb561ad1') },
  { name: 'Beef Tapa', category: 'Mains', price: 260,
    description: 'Cured beef, garlic rice and a sunny-side-up egg. The classic tapsilog.', image: img('photo-1600891964092-4316c288032e') },
  { name: 'Beef Mami', category: 'Mains', price: 210, tags: ['Comfort food'],
    description: 'Egg noodles in rich beef broth with tender brisket and bok choy.', image: img('photo-1569718212165-3a8278d5f624') },

  // Sides
  { name: 'Garlic Rice', category: 'Sides', price: 60, tags: ['Vegetarian'],
    description: 'Fried rice with plenty of toasted garlic.', image: '' },
  { name: 'Bagoong Rice', category: 'Sides', price: 95,
    description: 'Shrimp-paste fried rice with green mango and egg.', image: img('photo-1603133872878-684f208fb84b') },
  { name: 'Pancit Canton', category: 'Mains', price: 230, tags: ['Good for sharing'],
    description: 'Stir-fried egg noodles with pork, shrimp and vegetables. Long noodles, long life.', image: img('photo-1585032226651-759b368d7246') },
  { name: 'Ensaladang Mangga', category: 'Sides', price: 120, tags: ['Vegan', 'Fresh'],
    description: 'Green mango, tomato and red onion with a calamansi dressing.', image: img('photo-1540189549336-e6e99c3679fe') },

  // Drinks
  { name: 'Mango Shake', category: 'Drinks', price: 140, badge: 'Bestseller',
    description: 'Ripe Guimaras mangoes blended with ice.', image: img('photo-1572490122747-3968b75cc699'),
    variants: [{ name: '12 oz', price: 140 }, { name: '16 oz', price: 175 }] },
  { name: 'Calamansi Juice', category: 'Drinks', price: 90, tags: ['Fresh'],
    description: 'Freshly squeezed calamansi, lightly sweetened.', image: img('photo-1556679343-c7306c1976bc') },
  { name: 'Iced Barako Coffee', category: 'Drinks', price: 120,
    description: 'Batangas barako cold brew over ice, with muscovado.', image: img('photo-1461023058943-07fcbe16d735') },
  { name: "Sago't Gulaman", category: 'Drinks', price: 85,
    description: 'Brown-sugar syrup, tapioca pearls and gulaman jelly.', image: img('photo-1544145945-f90425340c7e') },

  // Desserts
  { name: 'Halo-Halo', category: 'Desserts', price: 195, badge: 'Signature', tags: ['Bestseller'],
    description: 'Shaved ice, leche flan, ube halaya, sweet beans and evaporated milk.', image: img('photo-1563805042-7684c019e1cb') },
  { name: 'Leche Flan', category: 'Desserts', price: 120, tags: ['Vegetarian'],
    description: 'Silky egg custard with a burnt-caramel top.', image: img('photo-1488477181946-6428a0291777') },
  // Intentionally no photo — shows the elegant fallback tile
  { name: 'Turon à la Mode', category: 'Desserts', price: 150, tags: ['New'],
    description: 'Caramelised banana-jackfruit spring roll with vanilla ice cream.', image: '' },
  // Sold out — shows the sold-out state
  { name: 'Ube Ice Cream', category: 'Desserts', price: 110, available: false, stock: 0,
    description: 'House-churned purple yam ice cream.', image: img('photo-1505252585461-04db1eb84625') },
]

// floor: index into FLOORS · x/y/w/h in floor units (floors are 1200 × 800)
const TABLES = [
  { n: 1, name: 'Window 1', capacity: 2, shape: 'round',     floor: 0, x: 90,  y: 110, w: 80,  h: 80 },
  { n: 2, name: 'Window 2', capacity: 2, shape: 'round',     floor: 0, x: 250, y: 110, w: 80,  h: 80 },
  { n: 3, name: 'Main 3',   capacity: 4, shape: 'square',    floor: 0, x: 430, y: 100, w: 100, h: 100 },
  { n: 4, name: 'Main 4',   capacity: 4, shape: 'square',    floor: 0, x: 630, y: 100, w: 100, h: 100 },
  { n: 5, name: 'Main 5',   capacity: 4, shape: 'square',    floor: 0, x: 540, y: 340, w: 100, h: 100, rotation: 45 },
  { n: 6, name: 'Family 6', capacity: 6, shape: 'rectangle', floor: 0, x: 110, y: 350, w: 220, h: 90 },
  { n: 7, name: 'Family 7', capacity: 8, shape: 'rectangle', floor: 1, x: 120, y: 160, w: 280, h: 90 },
  { n: 8, name: 'Garden 8', capacity: 4, shape: 'round',     floor: 1, x: 500, y: 200, w: 100, h: 100 },
]

const W = 16 // wall thickness
const FLOORS = [
  {
    name: 'Ground Floor', width: 1200, height: 800,
    elements: [
      { type: 'wall', x: 0, y: 0, w: 1200, h: W },
      { type: 'wall', x: 0, y: 0, w: W, h: 800 },
      { type: 'wall', x: 1184, y: 0, w: W, h: 800 },
      { type: 'wall', x: 0, y: 784, w: 480, h: W },
      { type: 'wall', x: 640, y: 784, w: 560, h: W },
      { type: 'window', x: 80, y: 2, w: 280, h: 12 },
      { type: 'window', x: 420, y: 2, w: 320, h: 12 },
      { type: 'entrance', x: 500, y: 740, w: 120, h: 40, label: 'Entrance' },
      { type: 'kitchen', x: 880, y: W, w: 304, h: 230, label: 'Kitchen' },
      { type: 'wall', x: 880, y: 246, w: 220, h: W },
      { type: 'bar', x: 1090, y: 320, w: 80, h: 300, label: 'Bar' },
      { type: 'counter', x: 700, y: 690, w: 180, h: 70, label: 'Cashier' },
      { type: 'restroom', x: W, y: 640, w: 150, h: 144, label: 'CR' },
      { type: 'stairs', x: 200, y: 650, w: 110, h: 134, label: 'Up' },
      { type: 'plant', x: 30, y: 30, w: 46, h: 46 },
      { type: 'plant', x: 800, y: 30, w: 46, h: 46 },
      { type: 'plant', x: 380, y: 700, w: 46, h: 46 },
      { type: 'label', x: 360, y: 540, w: 260, h: 50, label: 'Main Dining' },
    ],
  },
  {
    name: 'Roof Deck', width: 1200, height: 800,
    elements: [
      { type: 'wall', x: 0, y: 0, w: 1200, h: 10 },
      { type: 'wall', x: 0, y: 0, w: 10, h: 800 },
      { type: 'wall', x: 1190, y: 0, w: 10, h: 800 },
      { type: 'wall', x: 0, y: 790, w: 1200, h: 10 },
      { type: 'zone', x: 60, y: 60, w: 720, h: 480, label: 'Garden seating' },
      { type: 'stairs', x: 60, y: 620, w: 120, h: 150, label: 'Down' },
      { type: 'bar', x: 840, y: 80, w: 300, h: 80, label: 'Drinks bar' },
      { type: 'plant', x: 840, y: 260, w: 60, h: 60 },
      { type: 'plant', x: 960, y: 260, w: 60, h: 60 },
      { type: 'plant', x: 1080, y: 260, w: 60, h: 60 },
      { type: 'plant', x: 700, y: 600, w: 60, h: 60 },
      { type: 'label', x: 860, y: 600, w: 260, h: 50, label: 'City view' },
    ],
  },
]

// Orders in every stage. Table 1 is left free for you to order from your phone.
const ORDERS = [
  { table: 2, status: 'pending',     paid: false, ago: 2,  items: [['Sizzling Sisig', 1], ['Garlic Rice', 2], ['Calamansi Juice', 2]], note: 'Less spicy please' },
  { table: 3, status: 'accepted',    paid: false, ago: 5,  items: [['Kare-Kare', 1, 'Good for 3–4'], ['Garlic Rice', 3], ['Mango Shake', 3, '16 oz']] },
  { table: 4, status: 'preparing',   paid: true,  ago: 8,  items: [['Chicken Inasal', 2], ['Halo-Halo', 2]] },
  { table: 5, status: 'in-progress', paid: true,  ago: 14, items: [['Crispy Pata', 1], ['Lumpiang Shanghai', 1], ['Bagoong Rice', 2]], note: 'Extra dipping sauce' },
  { table: 6, status: 'ready',       paid: true,  ago: 22, items: [['Sinigang na Baboy', 1, 'Good for 3–4'], ['Pork BBQ Skewers', 2], ["Sago't Gulaman", 4]] },
  { table: 7, status: 'served',      paid: true,  ago: 55, items: [['Beef Tapa', 2], ['Iced Barako Coffee', 2]] },
  { table: 8, status: 'served',      paid: true,  ago: 80, items: [['Beef Mami', 1], ['Leche Flan', 1]] },
  { table: 0, status: 'in-progress', paid: true,  ago: 6,  items: [['Pork BBQ Skewers', 3], ['Garlic Rice', 3]], takeout: true },
]

const DEFAULT_SETTINGS = {
  restaurantName: "Wawo's House",
  stationName: 'Main Line',
  taxRate: '12',
  serviceFee: '0',
  baseUrl: '',
  imgbbApiKey: '',
  cloudinaryCloudName: '',
  cloudinaryUploadPreset: '',
  cloudinaryApiKey: '',
}

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
  const startOrder = existingFloors.reduce((m, f) => Math.max(m, (f.order ?? 0) + 1), 0)
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
      // Seated guests with an active (unserved) order occupy their table
      if (o.table && tableIds[o.table] && o.status !== 'served') {
        orderBatch.update(doc(db, 'tables', tableIds[o.table]), {
          status: 'occupied', currentOrderId: ref.id, occupiedAt: created, updatedAt: created,
        })
      }
      ordersAdded++
    }
    await orderBatch.commit()
  }

  console.log(`Added ${MENU.length} dishes, ${FLOORS.length} floors, ${tablesAdded} tables, ${ordersAdded} orders (all tagged demo: true)`)
  console.log('\nTry it:  /menu/1 (free table)  ·  /cashier  ·  /kitchen  ·  /admin')
}

main()
  .catch(e => { console.error('Seeding failed:', e.code || '', e.message); process.exitCode = 1 })
  .finally(() => deleteApp(app))

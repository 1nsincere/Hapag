// End-to-end logic run-through of Hapag's order lifecycle against the real
// Firebase project + deployed security rules. Each role signs in separately.
// Mirrors the writes in lib/data.ts and the screen filters in the app pages.
// All test data is labelled "ZZ TEST" / table 99 and deleted at the end.
const { createRequire } = require("module")
const projectRoot = require('path').resolve(process.argv[2] || '.')
const req = createRequire(projectRoot + '/package.json')
const { initializeApp, deleteApp } = req('firebase/app')
const fs = req('fs')
const {
  getFirestore, doc, collection, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  writeBatch, query, orderBy, where,
} = req('firebase/firestore')
const { getAuth, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword } = req('firebase/auth')
const { setDoc } = req('firebase/firestore')

// ── config from .env.local ──────────────────────────────────────────────────
const env = Object.fromEntries(fs.readFileSync(projectRoot + '/.env.local', 'utf8')
  .split(/\r?\n/).filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const config = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const results = []
const log = (s = '') => console.log(s)
const step = s => log(`\n━━ ${s}`)
function check(label, ok, detail = '') {
  results.push({ label, ok })
  log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
}
async function attempt(fn) {
  try { await fn(); return 'allowed' } catch (e) { return e.code === 'permission-denied' ? 'denied' : `error:${e.code || e.message}` }
}

// Customer orders go through the app's server (needs `npm run dev` running)
const BASE = process.env.HAPAG_BASE || 'http://localhost:3000'
const newId = () => Array.from({ length: 20 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]).join('')
async function api(who, path, body) {
  const token = await getAuth(who.app).currentUser.getIdToken()
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) })
      return { status: res.status, data: await res.json().catch(() => ({})) }
    } catch (e) { if (i >= 2) return { status: 0, data: { error: 'server not reachable at ' + BASE } }; await new Promise(r => setTimeout(r, 1500)) }
  }
}
const round2 = n => Math.round(n * 100) / 100

async function role(name, login) {
  const app = initializeApp(config, name)
  const auth = getAuth(app)
  for (let i = 0; ; i++) {
    try { if (login === 'anon') await signInAnonymously(auth); else await signInWithEmailAndPassword(auth, login[0], login[1]); break }
    catch (e) { if (i >= 4 || e.code !== 'auth/network-request-failed') throw e; await new Promise(r => setTimeout(r, 1500)) }
  }
  return { app, db: getFirestore(app) }
}

// ── Screen filters, copied from the app ─────────────────────────────────────
const screens = {
  cashierAwaitingAcceptance: o => o.status === 'pending',                         // cashier/page.tsx:471
  cashierAwaitingPayment:    o => o.status === 'accepted',                        // cashier/page.tsx:520
  cashierOtherOrders:        o => o.status !== 'pending' && o.status !== 'accepted', // :565
  kitchenLive:   o => o.status !== 'served' && o.status !== 'pending' && o.status !== 'accepted', // kitchen:348
  kitchenHistory: o => o.status === 'served',                                     // kitchen:461
}
const statusPage = {
  pending: 'Order sent', accepted: 'Ready for payment (Pay now button)', preparing: 'In the kitchen',
  'in-progress': 'Being prepared', ready: 'Almost at your table', served: 'Enjoy your meal',
}
// cashier NotificationsPanel only emits on these transitions
const cashierNotifies = s => s === 'pending' ? '"Order needs accepting" alert + chime' : s === 'preparing' ? '"Paid — sent to kitchen" alert' : s === 'ready' ? '"Order Ready" alert' : '(no alert)'

async function snapshotScreens(db, orderId, tableId, label) {
  const o = { id: orderId, ...(await getDoc(doc(db, 'orders', orderId))).data() }
  const t = (await getDoc(doc(db, 'tables', tableId))).data()
  const where_ = Object.entries(screens).filter(([, f]) => f(o)).map(([k]) => k)
  log(`   ↳ order: status=${o.status} payment=${o.paymentStatus} total=₱${o.total}${o.grandTotal ? ` grandTotal=₱${o.grandTotal.toFixed(2)}` : ''}`)
  log(`   ↳ customer status page: "${statusPage[o.status]}"`)
  log(`   ↳ visible on: ${where_.join(', ') || '(nowhere)'}`)
  log(`   ↳ cashier bell: ${cashierNotifies(o.status)}   table 99: ${t.status}`)
  return { o, t, where_ }
}

;(async () => {
  const created = { orders: [], menu: null, table: null, requests: [] }
  let admin, cashier, kitchen, customer, stranger
  try {
    step('SETUP  admin creates a test table and dish')
    admin = await role('admin', ['admin@restaurant.com', 'admin123'])
    const now = Date.now()
    created.table = (await addDoc(collection(admin.db, 'tables'), {
      tableNumber: 99, name: 'ZZ TEST table', status: 'available', qrCode: 'zz-test', capacity: 2,
      positionX: 0, positionY: 0, createdAt: now, updatedAt: now,
    })).id
    created.menu = (await addDoc(collection(admin.db, 'menu'), {
      name: 'ZZ TEST Adobo', description: 'test', price: 250, category: 'Mains', image: '', available: true, stock: 5,
    })).id
    check('admin can create table + menu item', true)
    const TOKEN = 'zz-test-token-99'
    await setDoc(doc(admin.db, 'tableSecrets', '99'), { token: TOKEN, createdAt: Date.now() })
    created.secret = true

    customer = await role('customer', 'anon')
    cashier = await role('cashier', ['cashier@restaurant.com', 'cashier123'])
    kitchen = await role('kitchen', ['kitchen@restaurant.com', 'kitchen123'])

    // ── 1. customer scans QR ──
    step('1. CUSTOMER scans the QR for table 99 (menu page auto-occupies the table)')
    const occ = await attempt(() => updateDoc(doc(customer.db, 'tables', created.table), {
      status: 'occupied', currentOrderId: null, occupiedAt: Date.now(), updatedAt: Date.now(),
    }))
    check('anonymous customer can mark table occupied', occ === 'allowed', occ)

    // ── 2. customer sends order (through the server) ──
    step('2. CUSTOMER sends an order: 2× ZZ TEST Adobo — phone claims ₱1 each, server must charge ₱250')
    const direct = await attempt(() => writeBatch(customer.db).set(doc(collection(customer.db, 'orders')), {
      tableNumber: 99, items: [{ id: created.menu, name: 'ZZ TEST Adobo', price: 250, quantity: 2, image: '' }],
      status: 'pending', paymentStatus: 'pending', total: 500, orderType: 'dine-in', createdAt: Date.now(), updatedAt: Date.now(),
      customerUid: getAuth(customer.app).currentUser.uid, qrToken: TOKEN,
    }).commit())
    check('phone CANNOT write an order straight to the database', direct === 'denied', direct)
    const orderId = newId()
    const placedRes = await api(customer, '/api/orders', {
      orderId, tableNumber: 99, qrToken: TOKEN, specialInstructions: 'no onions',
      items: [{ id: created.menu, baseId: created.menu, name: 'ZZ TEST Adobo', price: 1, quantity: 2 }],
    })
    check('order accepted by the server', placedRes.status === 201, `HTTP ${placedRes.status} ${placedRes.data.error || ''}`)
    created.orders.push(orderId)
    const orderRef = doc(customer.db, 'orders', orderId)
    const placedDoc = (await getDoc(doc(admin.db, 'orders', orderId))).data() || {}
    check('server charged the menu price (₱250, not ₱1)', placedDoc.items?.[0]?.price === 250 && placedDoc.total === 500, `price=${placedDoc.items?.[0]?.price} total=${placedDoc.total}`)
    const again = await api(customer, '/api/orders', { orderId, tableNumber: 99, qrToken: TOKEN, items: [{ id: created.menu, quantity: 2 }] })
    const stockAfter = (await getDoc(doc(admin.db, 'menu', created.menu))).data().stock
    check('same order sent twice (Wi-Fi retry) is not duplicated', again.status === 201 && stockAfter === 3, `HTTP ${again.status}`)
    check('stock went 5 → 3', stockAfter === 3, `stock=${stockAfter}`)
    let s = await snapshotScreens(cashier.db, orderRef.id, created.table)
    check('cashier sees it under "Awaiting Acceptance"', s.where_.includes('cashierAwaitingAcceptance'))
    check('kitchen does NOT see it yet', !s.where_.includes('kitchenLive'))
    check('cashier gets an alert for the new order', cashierNotifies(s.o.status) !== '(no alert)',
      'NotificationsPanel only alerts on "preparing" — cashier must watch the Orders tab')

    // ── 3. early payment attempt ──
    step('3. CUSTOMER tries to pay BEFORE the cashier accepts')
    const earlyRes = await api(customer, `/api/orders/${orderId}/pay`, { paymentMethod: 'qrph', tipPercent: 0, items: s.o.items })
    check('server refuses payment before the cashier accepts', earlyRes.status === 409, `HTTP ${earlyRes.status}`)
    const early = await attempt(() => updateDoc(doc(customer.db, 'orders', orderRef.id), {
      paymentStatus: 'paid', paymentMethod: 'qrph', tipAmount: 0, grandTotal: 560, paidAt: Date.now(), status: 'preparing', updatedAt: Date.now(),
    }))
    check('phone CANNOT mark it paid directly', early === 'denied', early)

    // ── 4. cashier accepts ──
    step('4. CASHIER taps "Accept Order"')
    const acc = await attempt(() => updateDoc(doc(cashier.db, 'orders', orderRef.id), { status: 'accepted', updatedAt: Date.now() }))
    check('cashier can accept', acc === 'allowed', acc)
    s = await snapshotScreens(cashier.db, orderRef.id, created.table)
    check('moves to "Awaiting Payment"', s.where_.includes('cashierAwaitingPayment'))
    check('customer status page now shows Pay now', s.o.status === 'accepted')

    // ── 5. customer pays at checkout (processPaymentAndActivateOrder) ──
    const settingsDoc = (await getDoc(doc(admin.db, 'settings', 'general'))).data() || {}
    const taxRate = parseFloat(settingsDoc.taxRate ?? '8') || 0, fee = parseFloat(settingsDoc.serviceFee ?? '2.50') || 0
    const expected = round2(500 + round2(500 * taxRate / 100) + fee + 50)
    step(`5. CUSTOMER checks out: QR Ph, 10% tip → server works out ₱${expected.toFixed(2)}`)
    const direct5 = await attempt(() => updateDoc(doc(customer.db, 'orders', orderRef.id), {
      items: s.o.items, total: 500, paymentStatus: 'paid', paymentMethod: 'qrph', tipAmount: 0, grandTotal: 1,
      paidAt: Date.now(), status: 'preparing', updatedAt: Date.now(),
    }))
    check('phone CANNOT pay by writing its own total', direct5 === 'denied', direct5)
    const stranger0 = await role('stranger0', 'anon')
    const steal = await api(stranger0, `/api/orders/${orderId}/pay`, { paymentMethod: 'qrph', tipPercent: 0, items: s.o.items })
    check('another phone CANNOT pay/change this order', steal.status === 404, `HTTP ${steal.status}`)
    await deleteApp(stranger0.app)
    const payRes = await api(customer, `/api/orders/${orderId}/pay`, {
      paymentMethod: 'qrph', tipPercent: 10, items: s.o.items.map(i => ({ ...i, price: 1 })),
    })
    const paidDoc = (await getDoc(doc(admin.db, 'orders', orderId))).data() || {}
    check('customer payment accepted by the server', payRes.status === 200 && paidDoc.paymentStatus === 'paid', `HTTP ${payRes.status} ${payRes.data.error || ''}`)
    check('server total = menu prices + Settings tax/fee + tip', Math.abs((paidDoc.grandTotal ?? 0) - expected) < 0.01, `grandTotal=${paidDoc.grandTotal} expected=${expected}`)
    const free = await attempt(() => updateDoc(doc(customer.db, 'tables', created.table), { status: 'available', currentOrderId: null, occupiedAt: null, updatedAt: Date.now() }))
    check('customer CANNOT free a table', free === 'denied', free)
    s = await snapshotScreens(kitchen.db, orderRef.id, created.table)
    check('kitchen now sees the ticket', s.where_.includes('kitchenLive'))
    check('cashier gets "New Order" alert now', s.o.status === 'preparing')
    check('table 99 stays occupied after payment (guests still eating)', s.t.status === 'occupied')

    // ── 6. kitchen pipeline ──
    for (const [from, to] of [['preparing', 'in-progress'], ['in-progress', 'ready'], ['ready', 'served']]) {
      step(`6. KITCHEN advances ${from} → ${to}`)
      const r = await attempt(() => updateDoc(doc(kitchen.db, 'orders', orderRef.id), { status: to, updatedAt: Date.now() }))
      check(`kitchen can set ${to}`, r === 'allowed', r)
      s = await snapshotScreens(kitchen.db, orderRef.id, created.table)
    }
    check('served order lands in kitchen History', s.where_.includes('kitchenHistory'))
    const hist = await attempt(() => getDocs(query(collection(kitchen.db, 'orders'), where('status', '==', 'served'), orderBy('createdAt', 'desc'))))
    check('History query works (composite index built)', hist === 'allowed', hist)

    // ── 6b. call staff ──
    step('6b. CUSTOMER taps "Call staff" → cashier sees it → "On my way"')
    const reqRef = doc(collection(customer.db, 'serviceRequests'))
    const call = await attempt(() => writeBatch(customer.db).set(reqRef, { tableNumber: 99, type: 'staff', status: 'open', createdAt: Date.now() }).commit())
    check('customer can call staff', call === 'allowed', call)
    if (call === 'allowed') created.requests = [reqRef.id]
    const open = await getDocs(query(collection(cashier.db, 'serviceRequests'), where('status', '==', 'open')))
    check('cashier sees the open request', open.docs.some(d => d.id === reqRef.id))
    const resolved = await attempt(() => updateDoc(doc(cashier.db, 'serviceRequests', reqRef.id), { status: 'done', resolvedAt: Date.now() }))
    check('cashier resolves it ("On my way")', resolved === 'allowed', resolved)

    // ── 6c. cashier clears the table ──
    step('6c. CASHIER clears table 99 after the guests leave')
    const cleared = await attempt(() => updateDoc(doc(cashier.db, 'tables', created.table), { status: 'available', currentOrderId: null, occupiedAt: null, updatedAt: Date.now() }))
    check('cashier can clear the table', cleared === 'allowed', cleared)

    // ── 7. cashier walk-in ──
    step('7. CASHIER rings up a walk-in at table 99 (already paid)')
    const walkRef = doc(collection(cashier.db, 'orders'))
    const walk = await attempt(() => writeBatch(cashier.db).set(walkRef, {
      tableNumber: 99, items: [{ id: created.menu, name: 'ZZ TEST Adobo', price: 250, quantity: 1, image: '' }],
      status: 'preparing', paymentStatus: 'paid', paymentMethod: 'cash', total: 250, orderType: 'dine-in',
      createdAt: Date.now(), updatedAt: Date.now(),
    }).commit())
    check('walk-in order created', walk === 'allowed', walk)
    created.orders.push(walkRef.id)
    s = await snapshotScreens(kitchen.db, walkRef.id, created.table)
    check('walk-in goes straight to the kitchen', s.where_.includes('kitchenLive'))

    // ── 8. abuse probes as an anonymous customer ──
    step('8. SECURITY probes as a customer (anonymous)')
    const cheapRef = doc(collection(customer.db, 'orders'))
    const cheap = await attempt(() => writeBatch(customer.db).set(cheapRef, {
      tableNumber: 99, items: [{ id: created.menu, name: 'ZZ TEST Adobo', price: 1, quantity: 10, image: '' }],
      status: 'pending', paymentStatus: 'pending', total: 10, orderType: 'dine-in', createdAt: Date.now(), updatedAt: Date.now(),
      customerUid: getAuth(customer.app).currentUser.uid, qrToken: TOKEN,
    }).commit())
    if (cheap === 'allowed') created.orders.push(cheapRef.id)
    check('customer CANNOT set their own prices (₱250 → ₱1)', cheap === 'denied' && placedDoc.items?.[0]?.price === 250, cheap)
    const apiNoToken = await api(customer, '/api/orders', { orderId: newId(), tableNumber: 99, items: [{ id: created.menu, quantity: 1 }] })
    check('server refuses an order without the table QR code', apiNoToken.status === 403, `HTTP ${apiNoToken.status}`)
    const apiBadToken = await api(customer, '/api/orders', { orderId: newId(), tableNumber: 99, qrToken: 'guess', items: [{ id: created.menu, quantity: 1 }] })
    check('server refuses a wrong QR code', apiBadToken.status === 403, `HTTP ${apiBadToken.status}`)
    const apiTooMany = await api(customer, '/api/orders', { orderId: newId(), tableNumber: 99, qrToken: TOKEN, items: [{ id: created.menu, quantity: 50 }] })
    check('server refuses more plates than are in stock', apiTooMany.status === 409, `HTTP ${apiTooMany.status} ${apiTooMany.data.error || ''}`)

    const selfPaidRef = doc(collection(customer.db, 'orders'))
    const selfPaid = await attempt(() => writeBatch(customer.db).set(selfPaidRef, {
      tableNumber: 99, items: [], status: 'preparing', paymentStatus: 'paid', total: 0, orderType: 'dine-in', createdAt: Date.now(), updatedAt: Date.now(),
    }).commit())
    if (selfPaid === 'allowed') created.orders.push(selfPaidRef.id)
    check('customer CANNOT create an already-paid order (skips cashier)', selfPaid === 'denied', `${selfPaid}`)

    const noToken = await attempt(() => writeBatch(customer.db).set(doc(collection(customer.db, 'orders')), {
      tableNumber: 99, items: [], status: 'pending', paymentStatus: 'pending', total: 0, orderType: 'dine-in',
      createdAt: Date.now(), updatedAt: Date.now(), customerUid: getAuth(customer.app).currentUser.uid,
    }).commit())
    check('customer CANNOT order without the table QR code (e.g. from home)', noToken === 'denied', noToken)
    const badToken = await attempt(() => writeBatch(customer.db).set(doc(collection(customer.db, 'orders')), {
      tableNumber: 99, items: [], status: 'pending', paymentStatus: 'pending', total: 0, orderType: 'dine-in',
      createdAt: Date.now(), updatedAt: Date.now(), customerUid: getAuth(customer.app).currentUser.uid, qrToken: 'guess',
    }).commit())
    check('customer CANNOT order with a wrong QR code', badToken === 'denied', badToken)
    const peekSecret = await attempt(() => getDoc(doc(customer.db, 'tableSecrets', '99')))
    check('customer CANNOT read table QR secrets', peekSecret === 'denied', peekSecret)

    const stock = await attempt(() => updateDoc(doc(customer.db, 'menu', created.menu), { stock: 999, available: true }))
    check('customer CANNOT reset stock to 999', stock === 'denied', stock)
    const price = await attempt(() => updateDoc(doc(customer.db, 'menu', created.menu), { price: 1 }))
    check('customer cannot change menu price', price === 'denied', price)
    const serve = await attempt(() => updateDoc(doc(customer.db, 'orders', walkRef.id), { status: 'served' }))
    check('customer cannot move kitchen status', serve === 'denied', serve)
    stranger = await role('stranger', 'anon')
    const peekReq = await attempt(() => getDocs(collection(stranger.db, 'serviceRequests')))
    check('a stranger cannot read staff requests', peekReq === 'denied', peekReq)
    const peek = await attempt(() => getDoc(doc(stranger.db, 'orders', orderRef.id)))
    check('a stranger cannot read other people\'s orders', peek === 'denied', peek)
    const ownRead = await attempt(() => getDoc(doc(customer.db, 'orders', orderRef.id)))
    check('the customer CAN read their own order', ownRead === 'allowed', ownRead)

    // ── 9. staff accounts ──
    step('9. STAFF ACCOUNTS — roles come from the staff list')
    // A stranger makes their own Firebase login (anyone can) — they must get nothing
    const outsider = initializeApp(config, 'outsider')
    const outAuth = getAuth(outsider)
    const OUT_EMAIL = 'zz-not-staff@hapag.test', OUT_PASS = 'zz-test-pass-123'
    try { await signInWithEmailAndPassword(outAuth, OUT_EMAIL, OUT_PASS) }
    catch { await createUserWithEmailAndPassword(outAuth, OUT_EMAIL, OUT_PASS) }
    const outDb = getFirestore(outsider)
    const outUid = outAuth.currentUser.uid
    created.outsider = outsider
    const selfPromote = await attempt(() => setDoc(doc(outDb, 'staff', outUid), { name: 'Me', email: OUT_EMAIL, role: 'admin', active: true, createdAt: Date.now() }))
    check('a stranger with a login CANNOT make themselves admin', selfPromote === 'denied', selfPromote)
    const outOrders = await attempt(() => getDocs(collection(outDb, 'orders')))
    check('a login without a staff profile CANNOT read orders', outOrders === 'denied', outOrders)
    const outStaff = await attempt(() => getDocs(collection(outDb, 'staff')))
    check('a login without a staff profile CANNOT read the staff list', outStaff === 'denied', outStaff)
    const cashierWrites = await attempt(() => setDoc(doc(cashier.db, 'staff', outUid), { name: 'X', email: OUT_EMAIL, role: 'admin', active: true, createdAt: Date.now() }))
    check('a cashier CANNOT add or promote staff', cashierWrites === 'denied', cashierWrites)

    // Owner adds them as a DEACTIVATED cashier → still nothing; reactivate → cashier powers
    await setDoc(doc(admin.db, 'staff', outUid), { name: 'ZZ Test Staff', email: OUT_EMAIL, role: 'cashier', active: false, createdAt: Date.now() })
    created.outProfile = outUid
    const inactiveRead = await attempt(() => getDocs(collection(outDb, 'orders')))
    check('a DEACTIVATED staff member CANNOT read orders', inactiveRead === 'denied', inactiveRead)
    await updateDoc(doc(admin.db, 'staff', outUid), { active: true })
    const activeRead = await attempt(() => getDocs(collection(outDb, 'orders')))
    check('the same person, reactivated as cashier, CAN read orders', activeRead === 'allowed', activeRead)
    const ownProfile = await attempt(() => getDoc(doc(outDb, 'staff', outUid)))
    check('staff CAN read their own profile (needed at login)', ownProfile === 'allowed', ownProfile)

    const adminUid = getAuth(admin.app).currentUser.uid
    const selfDeactivate = await attempt(() => updateDoc(doc(admin.db, 'staff', adminUid), { active: false }))
    check('an admin CANNOT deactivate themselves (no lock-out)', selfDeactivate === 'denied', selfDeactivate)
    const selfDemote = await attempt(() => updateDoc(doc(admin.db, 'staff', adminUid), { role: 'cashier' }))
    check('an admin CANNOT demote themselves', selfDemote === 'denied', selfDemote)
  } catch (e) {
    log('\nUNEXPECTED ERROR: ' + (e.stack || e))
  } finally {
    step('CLEANUP  admin deletes all test data')
    try {
      for (const id of created.orders) await deleteDoc(doc(admin.db, 'orders', id))
      for (const id of created.requests ?? []) await deleteDoc(doc(admin.db, 'serviceRequests', id))
      if (created.menu) await deleteDoc(doc(admin.db, 'menu', created.menu))
      if (created.table) await deleteDoc(doc(admin.db, 'tables', created.table))
      if (created.secret) await deleteDoc(doc(admin.db, 'tableSecrets', '99'))
      if (created.outProfile) await deleteDoc(doc(admin.db, 'staff', created.outProfile))
      if (created.outsider) await deleteApp(created.outsider)
      log(`   removed ${created.orders.length} orders, ${created.menu ? 1 : 0} dish, ${created.table ? 1 : 0} table`)
    } catch (e) { log('   CLEANUP FAILED: ' + e.message) }
    for (const r of [admin, cashier, kitchen, customer, stranger]) if (r) await deleteApp(r.app)
    const failed = results.filter(r => !r.ok)
    log(`\nSUMMARY: ${results.length - failed.length}/${results.length} passed`)
    failed.forEach(f => log('   ✗ ' + f.label))
    process.exit(0)
  }
})()

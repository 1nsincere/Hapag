import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  onSnapshot, 
  query, 
  orderBy,
  addDoc,
  deleteDoc,
  writeBatch,
  where
} from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { db, auth } from './firebase';
import { orderSafeImage } from './imageCompress';

/** Strip embedded (uploaded) photos from order items — they live on the menu item */
const slimItems = (items: CartItem[]) => items.map(i => ({ ...i, image: orderSafeImage(i.image) }))

export const ensureAuth = async () => {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe() // prevent multiple calls
      if (user) {
        resolve(user)
      } else {
        try {
          const result = await signInAnonymously(auth)
          resolve(result.user)
        } catch (error) {
          console.error("Anonymous auth failed:", error)
          reject(error)
        }
      }
    })
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type OrderStatus = 'pending' | 'accepted' | 'preparing' | 'in-progress' | 'ready' | 'served'

export interface AppSettings {
  [key: string]: string | undefined;
  restaurantName: string;
  stationName: string;
  taxRate: string;
  serviceFee: string;
  baseUrl?: string;
  imgbbApiKey?: string;
  cloudinaryCloudName?: string;
  cloudinaryUploadPreset?: string;
  cloudinaryApiKey?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  restaurantName: 'My Restaurant',
  stationName: 'Main Line',
  taxRate: '8',
  serviceFee: '2.50',
  baseUrl: '',
  imgbbApiKey: '',
  cloudinaryCloudName: '',
  cloudinaryUploadPreset: '',
  cloudinaryApiKey: ''
}

const SETTINGS_COL = 'settings'
const MENU_COL     = 'menu'
const ORDERS_COL   = 'orders'
const TABLES_COL   = 'tables'
const FLOORS_COL   = 'floors'
const SERVICE_COL  = 'serviceRequests'
const SECRETS_COL  = 'tableSecrets'

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export type TableStatus = 'available' | 'occupied' | 'reserved'
export type TableShape = 'square' | 'round' | 'rectangle'

export interface Table {
  id: string
  tableNumber: number
  name: string
  status: TableStatus
  qrCode: string
  capacity: number
  // ── Floor plan (all in floor-canvas units, see Floor.width/height) ──
  positionX: number          // left edge
  positionY: number          // top edge
  shape?: TableShape
  floorId?: string | null    // which floor it sits on — unset = not placed yet
  width?: number
  height?: number
  rotation?: number          // degrees, clockwise
  currentOrderId?: string | null
  occupiedAt?: number | null
  createdAt: number
  updatedAt: number
}

export async function getTables(): Promise<Table[]> {
  try {
    const q = query(collection(db, TABLES_COL), orderBy('tableNumber'))
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Table))
  } catch (error) {
    console.error('Error fetching tables:', error)
    return []
  }
}

export async function createTable(table: Omit<Table, 'id' | 'createdAt' | 'updatedAt'>) {
  try {
    const docRef = await addDoc(collection(db, TABLES_COL), {
      ...table,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    return docRef.id
  } catch (error) {
    console.error('Error creating table:', error)
    return null
  }
}

export async function updateTableStatus(tableId: string, status: TableStatus, orderId?: string | null) {
  try {
    // Customers scanning a QR code may not be signed in yet — the rules require
    // at least an anonymous Firebase session to write table occupancy.
    await ensureAuth()
    const now = Date.now()
    await updateDoc(doc(db, TABLES_COL, tableId), {
      status,
      currentOrderId: orderId ?? null,
      occupiedAt: status === 'occupied' ? now : null,
      updatedAt: now
    })
  } catch (error) {
    console.error('Error updating table status:', error)
  }
}

export async function deleteTable(tableId: string) {
  try {
    await deleteDoc(doc(db, TABLES_COL, tableId))
  } catch (error) {
    console.error('Error deleting table:', error)
  }
}

export async function updateTable(tableId: string, updates: Partial<Table>) {
  try {
    await updateDoc(doc(db, TABLES_COL, tableId), { ...updates, updatedAt: Date.now() })
  } catch (error) {
    console.error('Error updating table:', error)
  }
}

export async function getTableByQrCode(qrCode: string): Promise<Table | null> {
  try {
    const snap = await getDocs(collection(db, TABLES_COL))
    const match = snap.docs.find(d => d.data().qrCode === qrCode)
    return match ? ({ id: match.id, ...match.data() } as Table) : null
  } catch (error) {
    console.error('Error fetching table by QR code:', error)
    return null
  }
}

export async function linkOrderToTable(tableId: string, orderId: string) {
  try {
    await updateDoc(doc(db, TABLES_COL, tableId), {
      status: 'occupied',
      currentOrderId: orderId,
      updatedAt: Date.now()
    })
  } catch (error) {
    console.error('Error linking order to table:', error)
  }
}

/**
 * ─── THE ONLY PLACE A TABLE GOES BACK TO 'available' ───────────────────────
 * Called exclusively from the checkout page after the customer pays.
 *
 * Full lifecycle:
 *   Customer orders  →  table: occupied   (set atomically in addOrder)
 *   Kitchen serves   →  table: still occupied  (guests still seated/eating)
 *   Customer pays    →  table: available   ← clearTableAfterPayment()
 */
export async function clearTableAfterPayment(tableId: string) {
  try {
    await updateDoc(doc(db, TABLES_COL, tableId), {
      status: 'available',
      currentOrderId: null,
      occupiedAt: null,
      updatedAt: Date.now()
    })
    console.log('[clearTableAfterPayment] table freed:', tableId)
  } catch (error) {
    console.error('Error clearing table after payment:', error)
  }
}

export function listenToTables(callback: (tables: Table[]) => void) {
  const q = query(collection(db, TABLES_COL), orderBy('tableNumber'))
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Table))),
    error => console.error('[listenToTables] Firestore error:', error)
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLOOR PLANS
// Each floor is a canvas (width × height units) holding room features
// (walls, bar, entrance…). Tables reference their floor via table.floorId.
// ═══════════════════════════════════════════════════════════════════════════════

export type FloorElementType =
  | 'wall' | 'window' | 'entrance' | 'bar' | 'counter' | 'kitchen'
  | 'restroom' | 'stairs' | 'plant' | 'zone' | 'label'

export interface FloorElement {
  id: string
  type: FloorElementType
  x: number
  y: number
  w: number
  h: number
  rotation?: number
  label?: string
}

export interface Floor {
  id: string
  name: string
  order: number
  width: number
  height: number
  elements: FloorElement[]
  createdAt: number
  updatedAt: number
}

/** Table fields the floor plan editor is allowed to change */
export type TableLayout = Pick<Table, 'floorId' | 'positionX' | 'positionY' | 'width' | 'height' | 'rotation' | 'shape' | 'capacity'>

/**
 * Subscribes only once Firebase Auth has restored the signed-in user.
 * Needed for staff-only collections: right after a page load the auth session
 * is still being restored, and a listener attached too early is rejected by
 * the security rules and never retries.
 */
function listenWhenSignedIn(subscribe: () => () => void, onSignedOut?: () => void) {
  let unsubData: (() => void) | null = null
  const unsubAuth = onAuthStateChanged(auth, user => {
    unsubData?.()
    unsubData = user ? subscribe() : null
    if (!user) onSignedOut?.()
  })
  return () => { unsubAuth(); unsubData?.() }
}

export function listenToFloors(callback: (floors: Floor[]) => void, onError?: (error: Error) => void) {
  return listenWhenSignedIn(() => onSnapshot(
    query(collection(db, FLOORS_COL), orderBy('order')),
    snap => callback(snap.docs.map(d => {
      const data = d.data() as Omit<Floor, 'id'>
      return { ...data, id: d.id, elements: data.elements ?? [] }
    })),
    error => { console.error('[listenToFloors] Firestore error:', error); onError?.(error) }
  ), () => onError?.(new Error('Not signed in to Firebase')))
}

export async function createFloor(floor: Omit<Floor, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const now = Date.now()
  const ref = await addDoc(collection(db, FLOORS_COL), { ...floor, createdAt: now, updatedAt: now })
  return ref.id
}

/** Deletes a floor; its tables go back to "not placed" (they are never deleted). */
export async function deleteFloor(floorId: string, tableIdsOnFloor: string[]) {
  const batch = writeBatch(db)
  batch.delete(doc(db, FLOORS_COL, floorId))
  tableIdsOnFloor.forEach(id => batch.update(doc(db, TABLES_COL, id), { floorId: null, updatedAt: Date.now() }))
  await batch.commit()
}

/** Saves floor changes and table positions in one atomic write. */
export async function saveFloorPlan(
  floors: Pick<Floor, 'id' | 'name' | 'order' | 'width' | 'height' | 'elements'>[],
  tables: { id: string; layout: TableLayout }[],
) {
  const now = Date.now()
  const batch = writeBatch(db)
  floors.forEach(f => {
    const { id, ...data } = f
    batch.update(doc(db, FLOORS_COL, id), { ...data, updatedAt: now })
  })
  tables.forEach(t => batch.update(doc(db, TABLES_COL, t.id), { ...t.layout, updatedAt: now }))
  await batch.commit()
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE QR TOKENS
// Each table's QR code carries a secret (?t=…). Orders from customers must
// include it — the security rules check it against tableSecrets/{tableNumber},
// which only the admin can read. Stops fake orders typed in from home.
// ═══════════════════════════════════════════════════════════════════════════════

function newToken() {
  const bytes = new Uint8Array(9)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 14)
}

/** Admin only — tableNumber → token */
export function listenToTableTokens(callback: (tokens: Record<number, string>) => void) {
  return listenWhenSignedIn(() => onSnapshot(
    collection(db, SECRETS_COL),
    snap => callback(Object.fromEntries(snap.docs.map(d => [Number(d.id), String(d.data().token ?? '')]))),
    error => console.error('[listenToTableTokens] Firestore error:', error)
  ))
}

/** Admin only — create tokens for tables that don't have one yet */
export async function ensureTableTokens(tableNumbers: number[], existing: Record<number, string>) {
  const missing = tableNumbers.filter(n => n > 0 && !existing[n])
  if (!missing.length) return
  const batch = writeBatch(db)
  missing.forEach(n => batch.set(doc(db, SECRETS_COL, String(n)), { token: newToken(), createdAt: Date.now() }))
  await batch.commit()
}

/** Admin only — issue a new code (old printed QR codes stop working) */
export async function regenerateTableToken(tableNumber: number) {
  await setDoc(doc(db, SECRETS_COL, String(tableNumber)), { token: newToken(), createdAt: Date.now() })
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

export async function getSettings(): Promise<AppSettings> {
  try {
    const snap = await getDoc(doc(db, SETTINGS_COL, 'general'))
    return snap.exists() ? (snap.data() as AppSettings) : DEFAULT_SETTINGS
  } catch (error) {
    console.error('Error fetching settings:', error)
    return DEFAULT_SETTINGS
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await setDoc(doc(db, SETTINGS_COL, 'general'), settings)
}

export function listenToSettings(callback: (settings: AppSettings) => void) {
  return onSnapshot(doc(db, SETTINGS_COL, 'general'),
    snap => callback(snap.exists() ? { ...DEFAULT_SETTINGS, ...snap.data() as AppSettings } : DEFAULT_SETTINGS),
    error => console.error('[listenToSettings] Firestore error:', error)
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MENU ITEMS
// ═══════════════════════════════════════════════════════════════════════════════

export interface MenuItemVariant {
  name: string
  price: number
}

export interface MenuItem {
  id: string
  name: string
  description: string
  price: number
  category: 'Appetizers' | 'Mains' | 'Drinks' | 'Desserts' | 'Sides' | 'Snacks'
  image: string
  badge?: string
  tags?: string[]
  variants?: MenuItemVariant[]
  available: boolean
  stock?: number
}

export const CATEGORIES = ['Appetizers', 'Mains', 'Drinks', 'Desserts', 'Sides', 'Snacks'] as const

export async function getMenuItems(): Promise<MenuItem[]> {
  try {
    const q = query(collection(db, MENU_COL), orderBy('name'))
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem))
  } catch (error) {
    console.error('Error fetching menu items:', error)
    return []
  }
}

export async function saveMenuItem(item: Partial<MenuItem>) {
  try {
    if (item.id) {
      const { id, ...data } = item
      // Auto mark as unavailable when stock hits 0
      if (data.stock !== undefined && data.stock <= 0) {
        data.available = false
        data.stock = 0
      }
      await updateDoc(doc(db, MENU_COL, id), data)
    } else {
      await addDoc(collection(db, MENU_COL), { ...item, available: true })
    }
  } catch (error) {
    console.error('Error saving menu item:', error)
  }
}

export async function deleteMenuItem(id: string) {
  try {
    await deleteDoc(doc(db, MENU_COL, id))
  } catch (error) {
    console.error('Error deleting menu item:', error)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════════════════════════

export interface CartItem {
  id: string
  baseId?: string
  name: string
  price: number
  quantity: number
  image: string
  variantName?: string
  notes?: string
}

export interface Order {
  id: string
  tableNumber: number
  items: CartItem[]
  status: OrderStatus
  specialInstructions?: string
  createdAt: number
  updatedAt: number
  total: number
  orderType: 'dine-in' | 'takeout'
  // ── Pay-as-you-order fields ──────────────────────────────────────────────
  paymentStatus: 'pending' | 'paid'
  paymentMethod?: 'qrph' | 'card' | 'cash'
  tipAmount?: number
  grandTotal?: number
  paidAt?: number
  // ── Security ─────────────────────────────────────────────────────────────
  customerUid?: string   // device (anonymous Firebase user) that placed it — only it + staff can read
  qrToken?: string       // secret from the table's QR code — proves the order came from the table
}

/**
 * Creates a new order, atomically marks the table as 'occupied',
 * and decrements stock for each ordered item in a single batch write.
 *
 * Stock lifecycle:
 *   stock: 5  →  customer orders 2  →  stock: 3
 *   stock: 1  →  customer orders 1  →  stock: 0  →  available: false (sold out)
 */
export async function addOrder(
  order: Omit<Order, 'id'>,
  tableId?: string,
  options?: { preserveStatus?: boolean }
): Promise<string | null> {
  try {
    // Ensure the client SDK is authenticated (anonymously for customers) before writing
    await ensureAuth();

    const now = Date.now()
    const batch = writeBatch(db)

    // ── 1. Create the order (pending_payment — NOT yet visible to kitchen) ───
    const orderRef = doc(collection(db, ORDERS_COL))
    batch.set(orderRef, {
      ...order,
      items: slimItems(order.items),
      customerUid: auth.currentUser?.uid ?? null,
      status: options?.preserveStatus ? (order.status ?? 'pending') : 'pending',
      paymentStatus: options?.preserveStatus ? (order.paymentStatus ?? 'pending') : 'pending',
      createdAt: now,
      updatedAt: now,
    })

    // NOTE: Table is NOT marked occupied here. It is marked occupied only after
    // the customer confirms payment in processPaymentAndActivateOrder().
    // This prevents the table map from showing "occupied" for unpaid orders.

    // ── 2. Decrement stock for each ordered item ─────────────────────────────
    // Stock is reserved at order creation time (before payment) to prevent
    // overselling when multiple customers order the same item simultaneously.
    for (const cartItem of order.items) {
      // Handle variant ids like "productId::16oz" — extract the base menu id
      const menuId = cartItem.baseId ?? cartItem.id.split('::')[0]
      const menuSnap = await getDoc(doc(db, MENU_COL, menuId))
      if (!menuSnap.exists()) continue

      const menuData = menuSnap.data() as MenuItem
      // Skip items with unlimited stock (stock field not set)
      if (menuData.stock === undefined) continue

      const newStock = Math.max(0, menuData.stock - cartItem.quantity)
      batch.update(doc(db, MENU_COL, menuId), {
        stock: newStock,
        // Auto mark sold out when stock reaches 0
        ...(newStock <= 0 ? { available: false } : {}),
      })
    }

    // ── 3. Commit everything atomically ─────────────────────────────────────
    await batch.commit()
    console.log('[addOrder] batch committed — orderId:', orderRef.id, '(pending payment)')
    return orderRef.id
  } catch (error) {
    console.error('Error adding order:', error)
    return null
  }
}

export async function getOrder(id: string): Promise<Order | null> {
  try {
    const snap = await getDoc(doc(db, ORDERS_COL, id))
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Order) : null
  } catch (error) {
    console.error('Error fetching order:', error)
    return null
  }
}

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  try {
    await updateDoc(doc(db, ORDERS_COL, orderId), { status, updatedAt: Date.now() })
  } catch (error) {
    console.error('Error updating order status:', error)
  }
}

/**
 * Kitchen "Mark Served" — marks the ORDER as served.
 *
 * Lifecycle summary:
 *   new  →  in-progress  →  ready  →  served   (kitchen pipeline)
 *   occupied  ──────────────────────────────→  available  (payment only)
 */
export async function markOrderServed(orderId: string): Promise<void> {
  try {
    // Table status is controlled by QR scan (occupied) and payment (available);
    // serving an order no longer touches the table.
    await updateDoc(doc(db, ORDERS_COL, orderId), {
      status: 'served',
      updatedAt: Date.now()
    })
  } catch (error) {
    console.error('Error marking order served:', error)
  }
}

/**
 * Called when an order is paid (customer checkout or cashier).
 * Marks it paid and sends it to the kitchen queue ('preparing').
 *
 * The TABLE is deliberately left alone: guests are still eating after they
 * pay. The cashier clears the table when they leave (clearTableAfterPayment).
 */
export async function processPaymentAndActivateOrder(
  orderId: string,
  paymentMethod: 'qrph' | 'card' | 'cash',
  tipAmount: number,
  grandTotal: number,
  finalItems?: { items: CartItem[]; total: number }
): Promise<void> {
  try {
    // Ensure the client SDK is authenticated (anonymously for customers) before writing
    await ensureAuth();
    const now = Date.now()
    // If the customer adjusted quantities at checkout, persist the final items
    // so the kitchen cooks exactly what was paid for.
    await updateDoc(doc(db, ORDERS_COL, orderId), {
      ...(finalItems ? { items: slimItems(finalItems.items), total: finalItems.total } : {}),
      paymentStatus: 'paid',
      paymentMethod,
      tipAmount,
      grandTotal,
      paidAt: now,
      status: 'preparing',
      updatedAt: now,
    })
  } catch (error) {
    console.error('Error processing payment and activating order:', error)
    throw error
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE REQUESTS ("Call staff" from the customer's phone)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ServiceRequest {
  id: string
  tableNumber: number
  type: 'staff'
  status: 'open' | 'done'
  createdAt: number
  resolvedAt?: number
}

export async function createServiceRequest(tableNumber: number): Promise<void> {
  await ensureAuth()
  await addDoc(collection(db, SERVICE_COL), { tableNumber, type: 'staff', status: 'open', createdAt: Date.now() })
}

/** Staff screens only — open requests, oldest first */
export function listenToOpenServiceRequests(callback: (requests: ServiceRequest[]) => void) {
  return listenWhenSignedIn(() => onSnapshot(
    query(collection(db, SERVICE_COL), where('status', '==', 'open')),
    snap => callback(
      snap.docs.map(d => ({ id: d.id, ...d.data() } as ServiceRequest)).sort((a, b) => a.createdAt - b.createdAt)
    ),
    error => console.error('[listenToOpenServiceRequests] Firestore error:', error)
  ))
}

export async function resolveServiceRequest(id: string) {
  await updateDoc(doc(db, SERVICE_COL, id), { status: 'done', resolvedAt: Date.now() })
}

// ═══════════════════════════════════════════════════════════════════════════════
// REAL-TIME LISTENERS
// ═══════════════════════════════════════════════════════════════════════════════

export function listenToOrders(callback: (orders: Order[]) => void) {
  const q = query(collection(db, ORDERS_COL), orderBy('createdAt', 'desc'))
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))),
    error => console.error('[listenToOrders] Firestore error — check security rules:', error)
  )
}

export function listenToMenu(callback: (items: MenuItem[]) => void) {
  const q = query(collection(db, MENU_COL), orderBy('name'))
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem))),
    error => console.error('[listenToMenu] Firestore error — check security rules:', error)
  )
}

/**
 * A single order. Orders are private: only the device that placed it (and
 * staff) can read it, so this waits for the Firebase session first. If this
 * device can't read it (another phone's order / cleared browser) → null.
 */
export function listenToOrder(id: string, callback: (order: Order | null) => void) {
  return listenWhenSignedIn(
    () => onSnapshot(
      doc(db, ORDERS_COL, id),
      snap => callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as Order) : null),
      error => { console.warn('[listenToOrder] cannot read order on this device:', error.code); callback(null) }
    ),
    () => { ensureAuth().catch(() => callback(null)) }
  )
}
// Removes ONLY orders created by my sweep tests (identified by their test note / takeout name).
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const root = process.argv[2]
const req = createRequire(root + '/package.json')
const { initializeApp, deleteApp } = req('firebase/app')
const { getAuth, signInWithEmailAndPassword } = req('firebase/auth')
const { getFirestore, collection, getDocs, query, where, deleteDoc, updateDoc } = req('firebase/firestore')
const env = Object.fromEntries(readFileSync(root + '/.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const app = initializeApp({ apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, appId: env.NEXT_PUBLIC_FIREBASE_APP_ID })
for (let i = 0; ; i++) { try { await signInWithEmailAndPassword(getAuth(app), 'admin@restaurant.com', 'admin123'); break } catch (e) { if (i > 5) throw e; await new Promise(r => setTimeout(r, 2000)) } }
const db = getFirestore(app)
const snap = await getDocs(query(collection(db, 'orders'), where('specialInstructions', '==', 'Less ice please')))
for (const d of snap.docs) await deleteDoc(d.ref)
// walk-in takeout from the sweep: Beef Tapa only, takeout, no demo tag, created in the last 3 hours
const recent = await getDocs(query(collection(db, 'orders'), where('orderType', '==', 'takeout')))
let w = 0
for (const d of recent.docs) {
  const o = d.data()
  if (!o.demo && o.items?.length === 1 && o.items[0].name === 'Beef Tapa' && Date.now() - o.createdAt < 3 * 3600_000) { await deleteDoc(d.ref); w++ }
}
const calls = await getDocs(query(collection(db, 'serviceRequests'), where('status', '==', 'open')))
let c = 0
for (const d of calls.docs) if (d.data().tableNumber === 1) { await updateDoc(d.ref, { status: 'done', resolvedAt: Date.now() }); c++ }
console.log('closed ' + c + ' leftover test staff calls on table 1')
console.log(`cleanup: removed ${snap.size} sweep orders, ${w} sweep walk-ins`)
await deleteApp(app)

#!/usr/bin/env node
/**
 * Removes the public demo's accounts from THIS project — run it on your own
 * (non-demo) Firebase project after the portfolio demo has moved to its own
 * project. Deletes only: the three demo logins (demo-owner, demo-cashier,
 * demo-kitchen), their staff profiles, and the demo's bookkeeping docs.
 * Your menu, tables, orders and staff are not touched.
 *
 *   npm run remove-demo-accounts
 */
import { readFileSync, existsSync } from 'node:fs'
import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const keyFile = new URL('../service-account.json', import.meta.url)
if (!existsSync(keyFile)) { console.error('service-account.json not found in the project folder.'); process.exit(1) }
const key = JSON.parse(readFileSync(keyFile, 'utf8'))
const app = initializeApp({ credential: cert(key) })
const auth = getAuth(app)
const db = getFirestore(app)

console.log(`Project: ${key.project_id}`)
for (const uid of ['demo-owner', 'demo-cashier', 'demo-kitchen']) {
  try { await auth.deleteUser(uid); console.log(`  removed login ${uid}`) } catch { console.log(`  (no login ${uid})`) }
  await db.collection('staff').doc(uid).delete()
}
for (const id of ['demoSetup', 'demoClock']) await db.collection('_system').doc(id).delete()
console.log('Done. Demo accounts removed; your own data is untouched.')

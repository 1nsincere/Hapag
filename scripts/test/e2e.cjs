#!/usr/bin/env node
/**
 * npm run test:e2e  [-- http://localhost:3000]
 *
 * Clicks through every screen like real staff and a real customer would
 * (order → accept → pay → kitchen → serve → clear table, walk-ins, staff calls,
 * admin menu/tables/floor plan/settings) in Microsoft Edge (headless).
 *
 * Needs: the dev server running, demo data loaded (npm run seed:demo), Edge installed.
 * It cleans up the test orders it creates. Screenshots of failures go to your temp folder.
 */
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const root = path.resolve(__dirname, '..', '..')
const base = process.argv[2] || 'http://localhost:3000'
const out = path.join(os.tmpdir(), 'hapag-e2e')
fs.mkdirSync(out, { recursive: true })

async function tableToken(n) {
  const { initializeApp, deleteApp } = require('firebase/app')
  const { getAuth, signInWithEmailAndPassword } = require('firebase/auth')
  const { getFirestore, getDoc, doc } = require('firebase/firestore')
  const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
  const app = initializeApp({ apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, appId: env.NEXT_PUBLIC_FIREBASE_APP_ID }, 'e2e')
  for (let i = 0; ; i++) {
    try { await signInWithEmailAndPassword(getAuth(app), 'admin@restaurant.com', 'admin123'); break }
    catch (e) { if (i > 5) throw e; await new Promise(r => setTimeout(r, 2000)) }
  }
  const snap = await getDoc(doc(getFirestore(app), 'tableSecrets', String(n)))
  await deleteApp(app)
  if (!snap.exists()) throw new Error(`Table ${n} has no QR code yet — run "npm run seed:demo" first.`)
  return snap.data().token
}

;(async () => {
  const cleanup = () => spawnSync(process.execPath, [path.join(__dirname, 'cleanup.mjs'), root], { stdio: 'inherit' })
  cleanup()
  const token = await tableToken(1)
  console.log(`Running the click-through against ${base} …\n`)
  const run = spawnSync(process.execPath, [path.join(__dirname, 'e2e-sweep.cjs'), base, out, token], { stdio: 'inherit', cwd: root })
  cleanup()
  console.log(`\nScreenshots: ${out}`)
  process.exit(run.status ?? 1)
})().catch(e => { console.error(e.message); process.exit(1) })

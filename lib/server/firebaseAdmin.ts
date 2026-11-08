/**
 * Server-only Firestore access with the Firebase service account.
 * It bypasses security rules, so every API route that uses it must check
 * who is calling and what they're allowed to do itself.
 *
 * Credentials (never commit either):
 *  • local:   service-account.json in the project folder (git-ignored)
 *  • hosting: FIREBASE_SERVICE_ACCOUNT env var — the JSON, or the JSON base64-encoded
 */
import fs from 'fs'
import path from 'path'
import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

function loadCredentials(): ServiceAccount {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT?.trim()
  if (fromEnv) {
    const json = fromEnv.startsWith('{') ? fromEnv : Buffer.from(fromEnv, 'base64').toString('utf8')
    return JSON.parse(json)
  }
  const file = path.join(process.cwd(), 'service-account.json')
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
  throw new Error('Server key missing: add service-account.json (local) or FIREBASE_SERVICE_ACCOUNT (hosting).')
}

let db: Firestore | null = null

function adminApp(): App {
  return getApps()[0] ?? initializeApp({ credential: cert(loadCredentials()) })
}

export function adminDb(): Firestore {
  if (db) return db
  db = getFirestore(adminApp())
  return db
}

export function adminAuth(): Auth {
  return getAuth(adminApp())
}

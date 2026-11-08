#!/usr/bin/env node
/**
 * Creates (or repairs) the restaurant owner's admin login — the first account
 * on a new Hapag setup. Everyone else is added later in Admin → Staff.
 *
 *   npm run create-owner -- owner@restaurant.ph "Maria Santos"
 *   npm run create-owner -- owner@restaurant.ph "Maria Santos" --password "their-choice"
 *
 * Without --password a strong one is generated and printed once.
 * Needs service-account.json in this folder (Firebase console → Project settings →
 * Service accounts → Generate new private key). It never leaves your computer.
 */
import { readFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const args = process.argv.slice(2)
const pwIdx = args.indexOf('--password')
const password = pwIdx >= 0 ? args[pwIdx + 1] : randomBytes(9).toString('base64url')
const [email, name = 'Owner'] = args.filter((_, i) => pwIdx < 0 || (i !== pwIdx && i !== pwIdx + 1))

if (!email || !email.includes('@')) {
  console.error('Usage: npm run create-owner -- owner@restaurant.ph "Owner Name" [--password "..."]')
  process.exit(1)
}
if (!password || password.length < 8) {
  console.error('Password must be at least 8 characters.')
  process.exit(1)
}
const keyFile = new URL('../service-account.json', import.meta.url)
if (!existsSync(keyFile)) {
  console.error('service-account.json not found in the project folder.')
  process.exit(1)
}

const app = initializeApp({ credential: cert(JSON.parse(readFileSync(keyFile, 'utf8'))) })
const auth = getAuth(app)
const db = getFirestore(app)

let user
try {
  user = await auth.getUserByEmail(email)
  await auth.updateUser(user.uid, { password, disabled: false })
  console.log(`Found existing login for ${email} — password reset.`)
} catch (e) {
  if (e.code !== 'auth/user-not-found') throw e
  user = await auth.createUser({ email, password, displayName: name })
  console.log(`Created login for ${email}.`)
}
const now = Date.now()
await db.collection('staff').doc(user.uid).set(
  { name, email: email.toLowerCase(), role: 'admin', active: true, updatedAt: now, createdAt: now },
  { merge: true },
)
console.log(`\n✓ ${name} is the admin (owner) of project ${app.options.credential.projectId ?? ''}`)
console.log(`  Email:    ${email}`)
console.log(`  Password: ${password}`)
console.log('\nGive this to the owner privately and ask them to change it (Admin → Staff → reset password).')

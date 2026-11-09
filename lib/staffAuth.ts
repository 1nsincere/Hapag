/**
 * Server-side staff verification (used by NextAuth on login).
 *
 *  1. The browser signs in to Firebase Auth (Firebase checks the password —
 *     nothing is stored or compared in this app) and sends us its ID token.
 *  2. We verify that token with Google's public keys (no service account needed).
 *  3. We read the person's staff profile (staff/{uid}) from Firestore *as them*
 *     via the REST API — the security rules let staff read their own profile.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { UserRole } from './auth'

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

export async function verifyFirebaseIdToken(idToken: string) {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID,
  })
  if (!payload.sub) throw new Error('Token has no user')
  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email.toLowerCase() : '',
  }
}

export interface StaffProfile { name: string; role: UserRole; active: boolean; demo: boolean }

/** Reads staff/{uid} as the signed-in user. null = no profile (or not readable). */
export async function fetchStaffProfile(uid: string, idToken: string): Promise<StaffProfile | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/staff/${uid}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' })
  if (res.status === 404 || res.status === 403) return null
  if (!res.ok) throw new Error(`Staff lookup failed (HTTP ${res.status})`)
  const doc = await res.json() as { fields?: Record<string, { stringValue?: string; booleanValue?: boolean }> }
  const f = doc.fields ?? {}
  const role = f.role?.stringValue as UserRole | undefined
  if (role !== 'admin' && role !== 'cashier' && role !== 'kitchen') return null
  return { name: f.name?.stringValue ?? '', role, active: f.active?.booleanValue !== false, demo: f.demo?.booleanValue === true }
}

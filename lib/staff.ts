'use client'

/**
 * Staff accounts (Admin → Staff).
 *  • Login + password live in Firebase Authentication (Firebase stores/checks passwords).
 *  • Name, role and active flag live in Firestore staff/{uid}.
 */
import { initializeApp, deleteApp, getApps } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth'
import { collection, doc, onSnapshot, setDoc, updateDoc, getDoc } from 'firebase/firestore'
import { db, auth } from './firebase'
import type { UserRole } from './auth'
import { guardDemo } from './demo'

export interface StaffMember {
  uid: string
  name: string
  email: string
  role: UserRole
  active: boolean
  createdAt: number
  updatedAt?: number
}

export const ROLE_INFO: Record<UserRole, { label: string; can: string; icon: string }> = {
  admin:   { label: 'Admin',   can: 'Everything: menu, tables, floor plan, staff, settings, cashier and kitchen', icon: 'admin_panel_settings' },
  cashier: { label: 'Cashier', can: 'Cashier screen: accept orders, take payments, walk-ins, tables', icon: 'point_of_sale' },
  kitchen: { label: 'Kitchen', can: 'Kitchen screen: see paid tickets, mark cooking / ready / served', icon: 'skillet' },
}

/** Admin only — every staff profile, newest first */
export function listenToStaff(callback: (staff: StaffMember[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    collection(db, 'staff'),
    snap => callback(snap.docs.map(d => ({ uid: d.id, ...d.data() } as StaffMember)).sort((a, b) => b.createdAt - a.createdAt)),
    err => { console.error('[listenToStaff]', err); onError?.(err) },
  )
}

const FRIENDLY: Record<string, string> = {
  'auth/email-already-in-use': 'That email already has a login. If they used to work here, find them in the list and reactivate them.',
  'auth/invalid-email': 'That email address doesn’t look right.',
  'auth/weak-password': 'The password must be at least 6 characters.',
  'auth/network-request-failed': 'Can’t reach the server — check the internet connection.',
}

/**
 * Creates a login for a new staff member and their profile.
 * Uses a separate, temporary Firebase app so the owner stays signed in
 * (creating a user in the main app would switch the session to the new user).
 */
export async function createStaffAccount(input: { name: string; email: string; password: string; role: UserRole }) {
  guardDemo('Adding staff')
  const config = getApps()[0].options
  const temp = initializeApp(config, `staff-create-${Date.now()}`)
  try {
    const tempAuth = getAuth(temp)
    const cred = await createUserWithEmailAndPassword(tempAuth, input.email.trim(), input.password)
    await signOut(tempAuth)
    const now = Date.now()
    await setDoc(doc(db, 'staff', cred.user.uid), {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      role: input.role,
      active: true,
      createdAt: now,
      updatedAt: now,
    })
    return cred.user.uid
  } catch (err) {
    const code = (err as { code?: string }).code ?? ''
    throw new Error(FRIENDLY[code] ?? (err as Error).message)
  } finally {
    await deleteApp(temp).catch(() => {})
  }
}

export async function updateStaff(uid: string, patch: Partial<Pick<StaffMember, 'name' | 'role' | 'active'>>) {
  guardDemo('Changing staff accounts')
  await updateDoc(doc(db, 'staff', uid), { ...patch, updatedAt: Date.now() })
}

/** Firebase emails the person a secure link to choose a new password */
export async function sendStaffPasswordReset(email: string) {
  guardDemo('Password resets')
  try {
    await sendPasswordResetEmail(auth, email)
  } catch (err) {
    const code = (err as { code?: string }).code ?? ''
    throw new Error(FRIENDLY[code] ?? (err as Error).message)
  }
}

/**
 * Safety net: makes sure the signed-in admin appears in the staff list.
 * (Admins always have a profile now — the owner is created with
 * `npm run create-owner` — so this is normally a no-op.)
 */
export async function ensureOwnProfile(name: string) {
  const user = auth.currentUser
  if (!user || user.isAnonymous) return
  const ref = doc(db, 'staff', user.uid)
  if ((await getDoc(ref)).exists()) return
  const now = Date.now()
  await setDoc(ref, { name, email: (user.email ?? '').toLowerCase(), role: 'admin', active: true, createdAt: now, updatedAt: now })
}

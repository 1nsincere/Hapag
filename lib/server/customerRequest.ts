/** Shared plumbing for customer API routes: who's calling + safe error replies. */
import { NextResponse } from 'next/server'
import { verifyFirebaseIdToken } from '@/lib/staffAuth'
import { OrderError } from './orders'

/** The phone's Firebase (anonymous) user, proven by its ID token. */
export async function callerUid(req: Request): Promise<string> {
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) throw new OrderError('Please refresh the page and try again.', 401)
  try {
    return (await verifyFirebaseIdToken(token)).uid
  } catch {
    throw new OrderError('Your session expired. Please refresh the page and try again.', 401)
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' ? body : {}
  } catch {
    throw new OrderError('Bad request.')
  }
}

export function errorResponse(e: unknown, where: string) {
  if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status })
  // Transactions retry contention themselves; anything else is unexpected — don't leak details
  console.error(`[${where}]`, e)
  return NextResponse.json({ error: 'Something went wrong on our side. Please try again or ask staff.' }, { status: 500 })
}

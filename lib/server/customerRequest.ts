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
  } catch (e) {
    // A bad/expired token is the phone's problem (401). Failing to fetch Google's
    // signing keys is a network blip on our side (503) — the phone retries those.
    const code = (e as { code?: string })?.code ?? ''
    if (/^ERR_(JWT|JWS)/.test(code) || code === 'ERR_JWKS_NO_MATCHING_KEY' || (e instanceof Error && e.message === 'Token has no user')) {
      throw new OrderError('Your session expired. Please refresh the page and try again.', 401)
    }
    console.warn('[callerUid] could not verify token right now:', code || (e instanceof Error ? e.message : e))
    throw new OrderError('Connection problem — please try again.', 503)
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

/**
 * The site address as the phone reached it (e.g. http://192.168.1.74:3000 or
 * https://your-domain). Used for payment return links. Not req.url — in dev
 * that's the bind address (0.0.0.0), which phones can't open.
 */
export function requestOrigin(req: Request): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  if (!host || !/^[a-z0-9.\-:[\]]+$/i.test(host)) return new URL(req.url).origin
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim()
    ?? (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ? 'http' : 'https')
  return `${proto}://${host}`
}

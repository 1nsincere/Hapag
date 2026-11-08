/**
 * POST /api/demo/session { role: 'admin' | 'cashier' | 'kitchen' }
 * One-click demo entry: returns a Firebase sign-in token for that demo account.
 * Only exists when NEXT_PUBLIC_DEMO_MODE=true. Demo accounts are restricted by
 * firestore.rules (they can run service but can't delete or rename anything).
 */
import { NextResponse } from 'next/server'
import { DEMO_ACCOUNTS, DEMO_MODE, type DemoRole } from '@/lib/demo'
import { demoSignInToken, ensureDemoReady } from '@/lib/server/demo'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (!DEMO_MODE) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json().catch(() => ({}))
  const role = body?.role as DemoRole
  if (!(role in DEMO_ACCOUNTS)) return NextResponse.json({ error: 'Pick Owner, Cashier or Kitchen.' }, { status: 400 })
  try {
    await ensureDemoReady()
    return NextResponse.json({ token: await demoSignInToken(role), path: DEMO_ACCOUNTS[role].path })
  } catch (e) {
    console.error('[demo/session]', e)
    return NextResponse.json({ error: 'The demo is waking up — please try again in a moment.' }, { status: 503 })
  }
}

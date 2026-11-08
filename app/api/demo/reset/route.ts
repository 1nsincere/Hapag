/**
 * GET /api/demo/reset — nightly fresh start for the public demo.
 * Called by Vercel Cron (vercel.json), which sends "Authorization: Bearer <CRON_SECRET>".
 * Only deletes data tagged demo: true.
 */
import { NextResponse } from 'next/server'
import { DEMO_MODE } from '@/lib/demo'
import { resetDemo } from '@/lib/server/demo'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: Request) {
  if (!DEMO_MODE) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await resetDemo()
    return NextResponse.json({ ok: true, resetAt: new Date().toISOString() })
  } catch (e) {
    console.error('[demo/reset]', e)
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 })
  }
}

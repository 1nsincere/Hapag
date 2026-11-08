/**
 * POST /api/payments/webhook/:provider — the payment provider tells us money arrived.
 * The signature is checked before anything is trusted; only then is the order marked paid.
 * Point the provider's dashboard webhook at: https://<your-site>/api/payments/webhook/<provider>
 */
import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/server/firebaseAdmin'
import { findProvider, markSessionPaid } from '@/lib/server/payments'

export const runtime = 'nodejs'

export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await ctx.params
  const provider = findProvider(id)
  if (!provider) return NextResponse.json({ error: 'unknown provider' }, { status: 404 })

  const raw = await req.text()
  let event
  try {
    event = await provider.verifyWebhook(raw, req.headers)
  } catch (e) {
    console.warn(`[webhook:${id}] rejected:`, e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }
  if (!event) return NextResponse.json({ ok: true, ignored: true })

  try {
    const outcome = await markSessionPaid(adminDb(), provider.id, event)
    if (outcome !== 'paid' && outcome !== 'already-paid') console.warn(`[webhook:${id}] ${outcome}`, event.sessionId)
    return NextResponse.json({ ok: true, outcome })
  } catch (e) {
    // 500 → the provider retries later
    console.error(`[webhook:${id}]`, e)
    return NextResponse.json({ error: 'try again' }, { status: 500 })
  }
}

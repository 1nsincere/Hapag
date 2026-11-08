/** POST /api/orders/:orderId/pay — the customer checks out. Totals are recalculated here from the menu + Settings. */
import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/server/firebaseAdmin'
import { payCustomerOrder } from '@/lib/server/orders'
import { callerUid, errorResponse, readJson } from '@/lib/server/customerRequest'

export const runtime = 'nodejs'

export async function POST(req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  try {
    const uid = await callerUid(req)
    const { orderId } = await ctx.params
    const result = await payCustomerOrder(adminDb(), uid, orderId, await readJson(req))
    return NextResponse.json(result)
  } catch (e) {
    return errorResponse(e, 'POST /api/orders/pay')
  }
}

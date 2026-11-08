/** POST /api/orders — a customer places an order from the table's QR code. Prices are set here, not on the phone. */
import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/server/firebaseAdmin'
import { createCustomerOrder } from '@/lib/server/orders'
import { callerUid, errorResponse, readJson } from '@/lib/server/customerRequest'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const uid = await callerUid(req)
    const result = await createCustomerOrder(adminDb(), uid, await readJson(req))
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    return errorResponse(e, 'POST /api/orders')
  }
}

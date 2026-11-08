/**
 * One shape for every online payment provider (Practice today; PayMongo,
 * Xendit, HitPay… later). Swapping providers = writing one of these and
 * setting PAYMENT_PROVIDER. Nothing else in Hapag changes.
 *
 * The flow is the same for all of them:
 *  1. createCheckout → the guest is sent to the provider's payment page
 *  2. the provider calls our webhook when money actually arrives
 *  3. verifyWebhook proves the call really came from the provider
 *  4. only then is the order marked paid (lib/server/payments/index.ts)
 */

export interface CheckoutRequest {
  sessionId: string      // our own id for this payment attempt
  orderId: string
  amount: number         // pesos, already worked out by the server
  description: string
  method: 'qrph' | 'card'
  successUrl: string     // where the guest lands after paying
  cancelUrl: string      // where the guest lands if they back out
}

export interface CheckoutResult {
  checkoutUrl: string    // send the guest here
  providerRef?: string   // the provider's own id for the checkout, if any
}

/** A verified "money arrived" message from the provider. */
export interface PaidEvent {
  sessionId: string
  amount: number
  reference: string      // provider's payment reference (for receipts / refunds)
}

export interface PaymentProvider {
  id: string
  label: string
  /** true = no real money moves (demo / testing) */
  practice: boolean
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>
  /** Return the event if the webhook is genuine and means "paid"; null for other genuine events; throw if forged. */
  verifyWebhook(rawBody: string, headers: Headers): Promise<PaidEvent | null>
}

/**
 * One pricing formula for every way an order is paid (customer phone,
 * cashier counter, walk-in):  total = subtotal + tax + service fee (+ tip)
 * Tax % and service fee come from Admin → System Settings.
 */
import type { AppSettings } from './data'

const round2 = (n: number) => Math.round(n * 100) / 100

export function orderTotals(subtotal: number, settings: Pick<AppSettings, 'taxRate' | 'serviceFee'>, opts: { tipPercent?: number; serviceFee?: boolean } = {}) {
  const taxRate = parseFloat(settings.taxRate) || 0
  const fee = opts.serviceFee === false ? 0 : parseFloat(settings.serviceFee) || 0
  const tax = round2(subtotal * (taxRate / 100))
  const tip = round2(subtotal * ((opts.tipPercent ?? 0) / 100))
  return { subtotal: round2(subtotal), taxRate, tax, serviceFee: fee, tip, total: round2(subtotal + tax + fee + tip) }
}

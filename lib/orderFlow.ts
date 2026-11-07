/**
 * ─── Hapag order flow — the single source of truth ───────────────────────────
 *
 * Every screen (customer, cashier, kitchen) uses these names so staff hear one
 * vocabulary. The flow in one sentence:
 *
 *   Customer sends → Cashier accepts → Customer pays → Kitchen cooks →
 *   Kitchen marks ready → Staff serves → Cashier clears the table.
 *
 * Database values (order.status) are unchanged; only the wording lives here.
 */
import type { OrderStatus } from './data'

export type Role = 'Customer' | 'Cashier' | 'Kitchen' | 'Server'

export interface Stage {
  status: OrderStatus
  step: number
  /** What staff screens call it */
  label: string
  /** What the customer sees on their phone */
  customerLabel: string
  /** Who has to do something now */
  owner: Role | null
  /** The button that moves it forward */
  nextAction: string | null
  /** One-line explanation for the staff guide */
  explain: string
  icon: string
  tone: 'amber' | 'blue' | 'orange' | 'violet' | 'green' | 'slate'
}

export const STAGES: Stage[] = [
  { status: 'pending',     step: 1, label: 'New order',        customerLabel: 'Order sent',          owner: 'Cashier',  nextAction: 'Accept',
    explain: 'A customer sent an order from their table. Check the items, then tap Accept.', icon: 'notifications_active', tone: 'amber' },
  { status: 'accepted',    step: 2, label: 'Awaiting payment', customerLabel: 'Ready for payment',   owner: 'Customer', nextAction: 'Take payment',
    explain: 'The customer pays on their phone. If they prefer cash or card at the counter, tap Take payment.', icon: 'payments', tone: 'blue' },
  { status: 'preparing',   step: 3, label: 'In queue',         customerLabel: 'In the kitchen',      owner: 'Kitchen',  nextAction: 'Start cooking',
    explain: 'Paid. The ticket appears in the kitchen. Tap Start cooking when you begin.', icon: 'receipt_long', tone: 'orange' },
  { status: 'in-progress', step: 4, label: 'Cooking',          customerLabel: 'Being prepared',      owner: 'Kitchen',  nextAction: 'Mark ready',
    explain: 'The kitchen is cooking. Tap Mark ready when the food is plated.', icon: 'local_fire_department', tone: 'violet' },
  { status: 'ready',       step: 5, label: 'Ready to serve',   customerLabel: 'Almost at your table', owner: 'Server',  nextAction: 'Mark served',
    explain: 'Food is ready at the pass. Bring it to the table, then tap Mark served.', icon: 'room_service', tone: 'green' },
  { status: 'served',      step: 6, label: 'Served',           customerLabel: 'Enjoy your meal',     owner: null,       nextAction: null,
    explain: 'Done. When the guests leave, the cashier clears the table so it can be used again.', icon: 'done_all', tone: 'slate' },
]

const BY_STATUS = Object.fromEntries(STAGES.map(s => [s.status, s])) as Record<OrderStatus, Stage>

export function stageOf(status: OrderStatus): Stage {
  return BY_STATUS[status] ?? STAGES[0]
}

/** Tailwind classes per tone — used for chips and badges on staff screens */
export const TONE_CLASSES: Record<Stage['tone'], { chip: string; dot: string }> = {
  amber:  { chip: 'bg-amber-100 text-amber-800 border-amber-200',    dot: 'bg-amber-500' },
  blue:   { chip: 'bg-blue-100 text-blue-800 border-blue-200',       dot: 'bg-blue-500' },
  orange: { chip: 'bg-orange-100 text-orange-800 border-orange-200', dot: 'bg-orange-500' },
  violet: { chip: 'bg-violet-100 text-violet-800 border-violet-200', dot: 'bg-violet-500' },
  green:  { chip: 'bg-green-100 text-green-800 border-green-200',    dot: 'bg-green-500' },
  slate:  { chip: 'bg-slate-100 text-slate-700 border-slate-200',    dot: 'bg-slate-400' },
}

/** Table rules, in the words staff should use */
export const TABLE_RULES = [
  { status: 'Available', explain: 'Free to seat new guests.', color: '#10b981' },
  { status: 'Occupied',  explain: 'Guests are seated. Happens automatically when a guest scans the table QR (or the cashier seats them). Stays occupied while they eat — even after paying.', color: '#ef4444' },
  { status: 'Reserved',  explain: 'Held for a booking. Set by the cashier.', color: '#3b82f6' },
] as const

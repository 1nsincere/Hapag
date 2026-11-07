# How Hapag works

A one-page explanation for owners and staff. The same content is built into the app — tap **How it works** on the cashier, kitchen or admin screen.

## The order journey — six steps

| # | Stage (what screens say) | Who acts | What they do |
|---|---|---|---|
| 1 | **New order** | Cashier | A customer scanned the table QR and sent an order. Check it, tap **Accept**. |
| 2 | **Awaiting payment** | Customer | Customer pays on their phone (QR Ph / card / cash). Paying at the counter? Cashier taps **Take payment**. |
| 3 | **In queue** | Kitchen | Paid — the ticket appears in the kitchen. Tap **Start cooking**. |
| 4 | **Cooking** | Kitchen | Tap **Mark ready** when plated. |
| 5 | **Ready to serve** | Server / cashier | Bring the food, tap **Mark served**. |
| 6 | **Served** | — | Done. |

**In one sentence:** customer sends → cashier accepts → customer pays → kitchen cooks → food is served → cashier clears the table.

### Why the cashier accepts first
It stops prank or mistaken orders before anyone pays or cooks, and lets the cashier spot problems (e.g. prices that don't match the menu are shown in red).

### Walk-in customers
Cashier → **Cart** → add items → pick the table (or Takeout) → take payment. It goes **straight to the kitchen** (step 3).

## Tables

| Status | Meaning |
|---|---|
| **Available** | Free to seat guests. |
| **Occupied** | Guests are seated. Set automatically when a guest scans the table QR (or by the cashier). |
| **Reserved** | Held for a booking (set by the cashier). |

**Golden rule:** paying does **not** free a table — guests are still eating. The cashier taps **Clear table (guests left)** when they leave. The map tags a table **Ready to clear** when everything is served and paid.

## Alerts (bottom-left of the cashier screen)

Alerts only appear when someone has to do something, and stay until it's done:

- 🔴 **Table N is calling for staff** — customer tapped *Call staff* → go to the table → **On my way**
- 🟠 **New order** → **Accept** (or **Review** first)
- 🟢 **Ready to serve** → **Mark served** (or **Got it** if someone else serves)

They chime on arrival and every minute while a customer is waiting.

## Screens

| Screen | Who | Address |
|---|---|---|
| Customer menu | Guests (via table QR) | `/menu/<table number>` |
| Cashier POS | Cashier | `/cashier` |
| Kitchen display | Kitchen | `/kitchen` |
| Admin | Owner / manager | `/admin` — menu, tables & QR codes, floor plan, settings |

The cashier can switch the big left panel between **Menu** (to ring up walk-ins) and **Floor plan** (to see every table live).

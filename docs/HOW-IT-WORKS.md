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

## Alerts (lower right of the cashier screen)

Alerts only appear when someone has to do something, and stay until it's done:

- 🔴 **Table N is calling for staff** — customer tapped *Call staff* → go to the table → **On my way**
- 🟠 **New order** → **Accept** (or **Review** first)
- 🟢 **Ready to serve** → **Mark served** (or **Got it** if someone else serves)

They chime on arrival and every minute while a customer is waiting.

## Staff accounts (Admin → Staff)

- **Everyone gets their own login.** The owner adds each person with their name, email, a temporary password and a role:
  - **Admin** — everything (menu, tables, floor plan, staff, settings, plus cashier and kitchen)
  - **Cashier** — the cashier screen
  - **Kitchen** — the kitchen screen
- **Someone leaves?** Tap **Deactivate** — they can't log in or use any screen from that moment. **Reactivate** brings them back.
- **Forgot a password?** Tap **Forgot password?** on the login screen (or **Send password reset** on the Staff page) — Firebase emails a secure link.
- **Change your own password** at the bottom of the Staff page. Do this first for the demo admin (`admin123`).
- Passwords are stored by Firebase, never in the app. An admin can't demote or deactivate themselves, so the restaurant can't get locked out.

## Cashier tips

- **Show served / Hide served** (QR Orders tab) — served orders are hidden by default to keep the list short. Nothing is deleted.
- **End shift** (gear icon) — shows the shift total for the person logged in, then signs them out so the next cashier logs in with their own account.
- If several alerts arrive at once, tap **Minimise** — they shrink to a pill and pop back open when something new arrives. Repeated "Call staff" taps from one table show as one card (×2, ×3…).

## Screens

| Screen | Who | Address |
|---|---|---|
| Customer menu | Guests (via table QR) | `/menu/<table number>` |
| Cashier POS | Cashier | `/cashier` |
| Kitchen display | Kitchen | `/kitchen` |
| Admin | Owner / manager | `/admin` — menu, tables & QR codes, floor plan, settings |

The cashier can switch the big left panel between **Menu** (to ring up walk-ins) and **Floor plan** (to see every table live).

## QR codes & menu photos (admin)

- **Every table's QR code contains a secret code.** Guests who scan it can order; someone who just types the address can only browse. Print codes from **Admin → Table Management**. If a code gets copied or photographed, tap **New code** on that table and reprint it.
- **The QR address is automatic.** Online, it uses the website's address; while testing on a computer, it uses that computer's Wi-Fi address so phones on the same network can open it. Only set a custom address (e.g. your own domain) in **System Settings** if you need to.
- **Menu photos need no setup.** In **Menu Manager**, tap *Upload a photo* — it's resized and saved with the dish automatically. No Cloudinary/imgbb account or API keys.
- **Orders are private.** A customer's order page only opens on the phone that placed it. Staff can always see every order.

## Brand look (Admin → System Settings)

Each restaurant gets its own colour on the customer screens.

- **Pick a preset** (Saffron, Terracotta, Emerald, Ocean, Burgundy, Charcoal, Noir & Gold) or type the restaurant's exact brand colour.
- **Choose Light or Dark background.** Light (warm ivory) suits most places; Dark suits bars and fine dining.
- **Readable text is automatic.** Button text, prices and links are checked against WCAG AA (4.5:1) and shades are adjusted if needed. The card shows a live preview and the check result.
- Press **Save Changes**. Every customer phone updates live; returning phones open in the right colour straight away.
- The default, Saffron on ivory, is meant for demos. Swap it for the client's colour during setup.

## Prices & payment safety

- **The phone never decides the price.** When a guest orders or pays, the Hapag server looks up every dish's name and price on the menu, plus tax and service fee from Settings. A tampered phone still pays the real price.
- **Orders only come from the table.** The server checks the secret in the table's QR code and refuses orders from home or with a guessed code.
- **No double orders.** If the Wi-Fi drops while sending, the phone retries safely, and the same order is never created twice.
- **Stock is checked.** The server refuses more plates than are left, including dishes added at checkout. Removed dishes go back into stock.
- **Cash = pay at the counter.** If a guest picks Cash, the order is not marked paid. The cashier gets a blue "paying cash at the counter" alert, and the order goes to the kitchen after **Process Payment**.
- **Online payment (QR Ph / card) works like a real gateway.** The guest is sent to a payment page and pays there. The order is marked paid only when the payment provider sends a signed "payment received" message for the exact amount. Fake messages are rejected.
- **For now the payment page is the Practice provider** (yellow "Practice payment" banner, no real money). When the restaurant's PayMongo / Xendit account is ready, it replaces that page. Nothing else changes for staff.
- **If money arrives but doesn't match the order** (for example, the guest changed the order after paying started, or paid twice), the order shows a red note on the cashier screen to check with the guest.

# Roadmap — Hapag (QR Ordering & POS for Restaurants)

_Last reviewed: 2026-11-07_

## How the system works today

| Role | Route | What it does |
|---|---|---|
| Customer (no login) | `/menu/[tableNumber]` | Scans table QR → table auto-marked **occupied** → browses menu, builds cart, places order (`pending`) |
| Customer | `/status/[orderId]` | Live order tracker; shows "Pay now" once the cashier accepts |
| Customer | `/checkout/[orderId]` → `/confirmation/[orderId]` | Tip, payment method, can adjust quantities, pays (simulated) |
| Cashier | `/cashier` (alias `/pos`) | Accepts incoming orders, takes counter payments, walk-in POS, table map |
| Kitchen | `/kitchen` | Queue of paid orders: preparing → in-progress → ready → served |
| Admin | `/admin` (alias `/dashboard`) | Menu CRUD + stock, tables + QR codes, settings |

**Order flow** (names from `lib/orderFlow.ts`, used on every screen): New order → Awaiting payment → In queue → Cooking → Ready to serve → Served. See [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md).
**Table lifecycle:** QR scan (or cashier) → Occupied; stays occupied after payment; cashier taps *Clear table* when guests leave → Available.

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · Tailwind 4 · Firebase (Firestore + Auth) · NextAuth (staff login, JWT) · role checks in `proxy.ts`.

## Done ✅
- Customer QR ordering, cart, variants, tags, stock auto-decrement / sold-out
- Cashier accept → pay-first flow, kitchen pipeline with urgency timers, toasts, bulk actions
- Admin menu / tables / settings, QR code generation, image upload (Cloudinary)
- Staff login with roles (admin / cashier / kitchen) and protected routes
- Firestore security rules per role
- 2026-11-07 cleanup: removed stale `Qr_Wawo-s/` copy (already merged), customer self-checkout now allowed by rules, login hardening, `middleware` → `proxy`, `.env.example`
- 2026-11-07 renamed product to **Hapag**; restaurant name now always comes from admin Settings (incl. cashier header)
- 2026-11-07 customer UI redesign (Hapag Noir); end-to-end order run-through (26/28 checks pass); rules block self-paid orders and stock resets; cashier alert + chime for orders awaiting acceptance; kitchen chime fixed; `npm run seed:demo` demo data
- 2026-11-07 floor plan editor (multi-floor, drag/resize/rotate tables, walls/bar/kitchen/etc., undo, snap) + live cashier map; login no longer redirects before Firebase sign-in finishes
- 2026-11-07 one shared order-flow vocabulary + built-in "How it works" staff guide; persistent cashier action alerts (new order / call staff / ready to serve); real "Call staff"; tables stay occupied until cleared; cashier Menu ⇄ Floor plan switch; table history index
- 2026-11-07 menu photos without API keys (browser-compressed WebP stored on the dish); automatic QR address (site address online, Wi-Fi IP while testing; typo-proof); one pricing formula (cashier counter + walk-ins now use Settings tax/service fee); private orders (device-bound); secret per-table QR codes enforced by rules
- 2026-11-07 bug sweep: `npm run test:rules` (38 rule checks) + `npm run test:e2e` (37-step click-through, 37/37) added; fixed End shift (now signs out), "Clear All" (replaced by non-destructive Show/Hide served), auto-seating without the table QR code, staff calls grouped per table, login/customer sign-in retry on network blips, persistent offline cache (changes survive refresh/Wi-Fi drops)
- 2026-11-07 real staff accounts: Admin → Staff (add / role / deactivate / password reset / change my password); Firebase stores passwords; NextAuth verifies the Firebase ID token with Google's keys and reads staff/{uid}; rules take roles from the staff list (self-promotion, deactivated access and admin self-lockout all blocked); table QR codes created transactionally (no overwrite between two admin screens); cashier shows the signed-in person
- 2026-11-08 light customer theme by default + per-restaurant **brand look** (Admin → System Settings): 7 presets or any colour, light/dark, automatic contrast (WCAG AA), live preview, no colour flash on load
- 2026-11-08 **server-side prices**: customers order and pay through `/api/orders` (firebase-admin + service account). The server checks the table QR code, takes names/prices from the menu, tax/fee from Settings, re-checks stock for checkout changes, stops duplicate orders on Wi-Fi retries and limits unpaid orders per phone. Phones can no longer write orders or stock directly. "Cash" at checkout now waits for the cashier (it used to mark the order paid), with a cashier alert + badge.

## Next up — must fix before real use 🔴
1. **Deploy the updated `firestore.rules`** — `firebase deploy --only firestore:rules`. Until then, phones can still write orders directly (the old rules).
2. **Change the demo account passwords** (Admin → Staff → Change my password) or deactivate the demo accounts, and add your real team.
4. **Set a real `NEXTAUTH_SECRET`** — code falls back to a public dev secret.
6. **Online payment is still simulated.** QR Ph / card mark the order paid without money moving. Connect PayMongo: `/api/orders/[id]/pay` creates the PayMongo checkout and a verified webhook marks the order paid. Server-side prices are already done.
6b. **Hosting needs the server key**: set `FIREBASE_SERVICE_ACCOUNT` (the service-account JSON, or base64 of it) in Vercel. Locally it reads `service-account.json` (git-ignored).

## Next up — correctness 🟠
8. Table goes `available` right after payment even though guests are still eating (pay-first). Decide: free the table on "served", or add a manual "clear table" step in cashier.
9. `QuickOrderPanel` and shift summary in `SettingsPanel` are stubs (not written to Firestore).
10. `markOrderServed` / checkout swallow Firestore errors in places — surface permission errors to the user.

## Later — polish 🟡
- Real payment gateway (QR PH / card) instead of the 1.5 s simulation
- Sales reports / end-of-shift records in admin
- 70 remaining lint findings (mostly `any`, `<img>` → `next/image`, React-compiler effect warnings)
- Split the very large page files (`admin`, `cashier`, `kitchen`, `menu` are 1,000–1,500 lines each)
- Hapag brand assets: logo, favicon, brand colors, landing/sales page
- Floor plan: show the live map on the kitchen screen too; drag tables to merge/split parties; reservations on the map

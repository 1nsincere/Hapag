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

**Order lifecycle:** `pending` (placed) → `accepted` (cashier) → `preparing` + `paid` (customer checkout or cashier) → `in-progress` → `ready` → `served`.
**Table lifecycle:** QR scan → `occupied`; payment → `available`.

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · Tailwind 4 · Firebase (Firestore + Auth) · NextAuth (staff login, JWT) · role checks in `proxy.ts`.

## Done ✅
- Customer QR ordering, cart, variants, tags, stock auto-decrement / sold-out
- Cashier accept → pay-first flow, kitchen pipeline with urgency timers, toasts, bulk actions
- Admin menu / tables / settings, QR code generation, image upload (Cloudinary)
- Staff login with roles (admin / cashier / kitchen) and protected routes
- Firestore security rules per role
- 2026-11-07 cleanup: removed stale `Qr_Wawo-s/` copy (already merged), customer self-checkout now allowed by rules, login hardening, `middleware` → `proxy`, `.env.example`
- 2026-11-07 renamed product to **Hapag**; restaurant name now always comes from admin Settings (incl. cashier header)

## Next up — must fix before real use 🔴
1. **Deploy the updated `firestore.rules`** — `firebase deploy --only firestore:rules`. Customer checkout fails until this is done.
2. **Pre-create the 3 staff accounts in Firebase Auth** (console → Authentication) and turn off public sign-up if possible. Rules trust the email claim, so an unclaimed staff email can be grabbed.
3. **Staff passwords are hard-coded** in `lib/auth.ts` (`admin123` etc.). Move to Firestore `users` collection (hashed) or Firebase Auth + custom claims via `firebase-admin` (already a dependency), then drop the dual NextAuth/Firebase login.
4. **Set a real `NEXTAUTH_SECRET`** — code falls back to a public dev secret.
5. **Cloudinary API key is stored in the `settings` doc, which is world-readable.** Keep only the cloud name + unsigned upload preset there.

## Next up — correctness 🟠
6. Cashier payment modal hard-codes 8% tax (`/ 1.08` in `app/cashier/page.tsx`); use `settings.taxRate`.
7. Customer quantity increases at checkout don't re-check/decrement stock.
8. Table goes `available` right after payment even though guests are still eating (pay-first). Decide: free the table on "served", or add a manual "clear table" step in cashier.
9. `QuickOrderPanel` and shift summary in `SettingsPanel` are stubs (not written to Firestore).
10. `markOrderServed` / checkout swallow Firestore errors in places — surface permission errors to the user.

## Later — polish 🟡
- Real payment gateway (QR PH / card) instead of the 1.5 s simulation
- Sales reports / end-of-shift records in admin
- 70 remaining lint findings (mostly `any`, `<img>` → `next/image`, React-compiler effect warnings)
- Split the very large page files (`admin`, `cashier`, `kitchen`, `menu` are 1,000–1,500 lines each)
- Hapag brand assets: logo, favicon, brand colors, landing/sales page
- Add tests for the order/payment lifecycle and Firestore rules (emulator)

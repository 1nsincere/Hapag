# Hapag — Production Checklist

Tracks everything needed to take Hapag from "works in testing" to "ready to sell".
Tick items off as they're done (`- [x]`). Last updated: 2026-11-08.

**Size:** S = small (part of a session) · M = about one session · L = several sessions
**Who:** Me = Claude (code) · You = owner (accounts, business, decisions)

**Where we are:** about 80% of the core product is done. Customer ordering, cashier/kitchen/admin screens,
floor plans, staff accounts, brand colours, server-side prices and the practice payment flow are built and tested
(`npm run test:e2e` 42/42).

**Products we'll sell**
- **Hapag Order:** QR ordering, kitchen screen, tables and alerts, next to the restaurant's existing POS. That POS keeps the till and official receipts.
- **Hapag Complete:** Hapag also replaces the till (needs Phase 5).

**Progress (2026-11-08)**

| What | % done |
|---|---|
| Core product (built and tested) | ~80% |
| Ready for a 1-month pilot (Hapag Order, counter payments) | ~85% |
| Ready to sell at full price | ~65–70% |
| Hapag Complete (replaces their POS) | ~45% |

---

## Pilot-ready plan (if a restaurant says yes)

**Promise: the pilot starts 3 weeks after they say yes.** That's about 10–14 working days of work plus buffer.
The clock starts when the restaurant sends the day-1 items below.

**Pilot scope:** Hapag Order. Their POS keeps the till and official receipts (no BIR issues). Guests pay at the counter.
No payment account needed. Online payments and Hapag Complete come after the pilot.

### Must-haves (checklist items, with estimates)
- [ ] 1.3: Require a real secret (½ day). *(1.1 done)*
- [ ] 1.2: Staff accounts made by the server; turn off public sign-up (½ day)
- [ ] 1.4 + 1.5: "Ordering paused" switch, plus an outage test (1 day)
- [ ] 1.6: Counter-payment-only mode (½ day)
- [ ] 1.8 + 1.9: Backups + error alerts (½ day)
- [ ] 2.1: Kitchen ticket + receipt printing (1–2 days)
- [ ] 2.2: "Rung up in POS ✓" + end-of-day check (½ day)
- [ ] 2.5 + 2.8: Device check page; receipt header with their details (½ day)
- [ ] 3.2–3.4: Clean start, privacy notice, staff guide (1 day)
- [ ] 3.1: Their setup: Vercel site, menu, photos, tables, floor plan, QR standees (2–3 days)
- [ ] Testing + buffer: real phones, their device, fixes (2–3 days)
- [ ] *Optional:* 2.4 dish add-ons (+1 day) · 2.3 spreadsheet menu import (+1 day; for a small menu, typing it in is faster)

**Possible delays (and the backup plan):**
- Unusual device or printer → use a cheap tablet or the kitchen screen instead of printed tickets; the start date holds
- Late menu or photos → the start date moves by the same amount
- Print shop time for QR standees → 1–3 days
- Owner availability for testing and the on-site visit

### Ask the restaurant on day 1
- [ ] Menu: dish names, prices, categories, options (a photo of the printed menu is fine)
- [ ] Dish photos (or permission to take them)
- [ ] Table layout: number of tables and floors (a rough sketch is fine)
- [ ] Photos of their POS device and printer, including the model sticker
- [ ] Logo and brand colour
- [ ] Staff list: names and roles (cashier, kitchen)
- [ ] Internet setup, and whether they have a backup (pocket WiFi / LTE router)

### Schedule to show the restaurant
| Week | What happens |
|---|---|
| Week 1 | They send menu/photos; we finish the safety and printing features |
| Week 2 | Their branded Hapag set up (menu, tables, QR codes); device test on-site |
| Week 3 | Final testing; QR standees printed; 1–2 hour staff training |
| Pilot day 1 | Go live, with the owner on-site for the first service |
| Pilot month | Weekly check-in; fixes within 24–48 hours |

**Pilot terms to offer:** free or discounted for the month; their POS stays the till; guests pay at the counter;
online payments and Hapag Complete come after the pilot.

---

## Portfolio demo (before sharing a public link)

Step-by-step: [docs/DEPLOY-DEMO.md](docs/DEPLOY-DEMO.md)

- [x] **Me** Demo mode + showcase landing page: one-click Guest/Cashier/Kitchen/Owner, demo accounts restricted by the rules, nightly reset (`NEXT_PUBLIC_DEMO_MODE=true`)
- [ ] **You** Deploy the database rules (see 0.1). **Required:** the demo restrictions live in the rules.
- [ ] **You** Deploy on Vercel with the variables in docs/DEPLOY-DEMO.md (incl. `NEXT_PUBLIC_DEMO_MODE` and `CRON_SECRET`)
- [ ] **You** Edit `lib/site.ts` (your name / links)
- [ ] **You** *(recommended)* A separate Firebase project just for the demo, so visitors never share data with your own testing
- [x] ~~Clear the saved QR address~~ (the demo clears home-network addresses itself)

---

## Phase 0: Owner tasks (no code; start any time)

- [ ] **0.1 You:** Deploy the database rules. Until then, phones can still write orders directly.
  ```
  cd "C:\Users\acegr\Desktop\Qr_Ordering System\qr_system"
  npx firebase-tools deploy --only firestore:rules
  ```
- [ ] **0.2 You:** Apply for a payment account (Xendit / PayMongo / HitPay). Approval can take days or weeks.
- [ ] **0.3 You:** Ask an accountant about BIR (receipts/invoices, POS registration) and the Data Privacy Act.
- [ ] **0.4 You:** Ask 3–5 target restaurants which POS and printer they use (photo of the model sticker).
- [ ] **0.5 You:** Find one friendly restaurant for a free pilot.

## Phase 1: Safe for a real restaurant (security and reliability)

- [x] **1.1 Me (M):** Remove the demo login fallback (demo emails got roles without a staff profile). Done: no profile = no access; new restaurants get their owner with `npm run create-owner -- email "Name"`. *Takes effect when the rules are deployed (0.1).*
- [ ] **1.2 Me + You (M):** Staff accounts created by the server, so public sign-up can be turned off in Firebase.
- [ ] **1.3 Me (S):** In production, refuse to start without a real `NEXTAUTH_SECRET` (no public fallback secret).
- [ ] **1.4 Me (M):** "Ordering paused" safety switch: if the cashier screen is offline for about 2 min, QR ordering pauses with a clear message to guests.
- [ ] **1.5 Me (S):** Outage test: cut the internet on purpose and check that everything syncs correctly afterwards.
- [ ] **1.6 Me (S):** Online payment on/off switch (counter-payment-only mode for pilots).
- [ ] **1.7 Me + You (M):** Bot protection (Firebase App Check) against fake-order spam.
- [ ] **1.8 Me + You (S):** Daily database backups (needs Firebase's pay-as-you-go Blaze plan).
- [ ] **1.9 Me (S):** Error alerts, so problems are noticed before the owner complains.
- [ ] **1.10 Me (S):** Fix the remaining 3 old lint errors (setState inside effects on the menu and checkout pages).

## Phase 2: Useful next to their existing POS (Hapag Order complete)

- [ ] **2.1 Me (M):** Real printing: customer receipt + kitchen ticket at 58/80mm, automatic kitchen ticket when paid. *(The cashier "Receipt Printer" switch is currently a placeholder.)*
- [ ] **2.2 Me (S):** "Rung up in POS ✓" checkbox on paid orders, plus an end-of-day check list.
- [ ] **2.3 Me (M):** Menu import/export by spreadsheet (CSV).
- [ ] **2.4 Me (M):** Dish options / add-ons (extra rice, no onions, spice level).
- [ ] **2.5 Me (S):** Device check page: test a client's tablet or POS on the spot (screen, printing, sound, internet).
- [ ] **2.6 Me (L):** Restyle the cashier and kitchen screens to match the premium customer side.
- [ ] **2.7 Me (S):** Finish or remove the placeholder panels (Quick Order, shift summary).
- [ ] **2.8 Me (S):** Restaurant logo upload, plus receipt header (address, TIN, contact).

## Phase 3: Ready to sign clients

- [ ] **3.1 Me (M):** New-restaurant setup script and checklist (a new client in about 30 min).
- [ ] **3.2 Me (S):** Clean-start tool: remove all demo data before go-live.
- [ ] **3.3 Me + Accountant (S):** Privacy notice and terms pages (linked from the customer menu).
- [ ] **3.4 Me (S):** Printable staff training guide (1 page per role).
- [ ] **3.5 You (S):** Contract template and pricing (setup fee + monthly). Me can draft.
- [ ] **3.6 You + Me (L):** 1-week pilot, then fix everything it finds.

> ✅ **After Phases 0–3: ready to sell Hapag Order.**

## Phase 4: Real online payments

- [ ] **4.1 Me (M):** Payment provider connector (PayMongo / Xendit / HitPay). Needs 0.2. *The flow is already built with the Practice provider (`lib/server/payments/`).*
- [ ] **4.2 Me (M):** Refunds, plus a payout check report (money received vs orders).
- [ ] **4.3 You + Client (S each):** Payment account in each restaurant's business name; webhook at `https://<site>/api/payments/webhook/<provider>`.

## Phase 5: Hapag Complete (replaces their POS)

- [ ] **5.1 Me (M):** Senior/PWD discount (VAT-exempt + 20%), VAT breakdown, VAT or non-VAT setting. *Legally required.*
- [ ] **5.2 Me (M):** Voids and refunds with manager PIN, plus an audit log.
- [ ] **5.3 Me (M):** Shift open/close, cash count, X/Z readings.
- [ ] **5.4 Me (M):** Sales reports + Excel export (daily, monthly, per dish).
- [ ] **5.5 Me (M):** Cash drawer, plus direct Bluetooth/USB printing (incl. Android POS built-in printers).
- [ ] **5.6 Me (M):** Reliable cashier sales while offline.
- [ ] **5.7 Me + You + Accountant (L):** BIR accreditation features (sequential invoice numbers, a grand total that can't be reset, electronic journal), then apply to BIR.

> ✅ **After Phase 5 (stage 1: restaurant uses BIR-registered paper invoices): ready to sell Hapag Complete.**
> Full BIR accreditation comes later. Never wipe a client's BIR-registered POS without their accountant's OK.

## Phase 6: Growth (once clients exist)

- [ ] One shared system for all restaurants with separate data for each (replaces one setup per client)
- [ ] Owner dashboard for multiple branches
- [ ] Hapag Android app (built-in printers, cash drawer, device locked to Hapag)
- [ ] Connectors for popular cloud POS brands, if clients use them

---

## Done ✅ (for reference)

- [x] Customer QR ordering, live order status, receipts; light theme with per-restaurant brand colour
- [x] Cashier (alerts lower right, table colours, floor plan view), kitchen screen, admin (menu, tables, floor plan editor, staff)
- [x] Staff accounts with roles; secret QR code per table; private orders per phone
- [x] Server-side prices and totals (`/api/orders`); stock checked; no duplicate orders on Wi-Fi retries
- [x] Cash at checkout waits for the cashier (alert + badge)
- [x] Online payment flow with the Practice provider; only signed, verified webhooks mark orders paid
- [x] Automated tests: `npm run test:e2e` (click-through) and `npm run test:rules` (security)

## Recommended order

Phase 1 → 2 → 3 → pilot, with Phase 0 in parallel. Phase 4 whenever the payment account is approved.
Phase 5 after the first paying Hapag Order client.

# Hapag

**Smart QR ordering & POS for restaurants — small or big.**

Hapag (Filipino for *dining table*) is table-side QR ordering for restaurants: customers scan a table QR code, order and pay from their phone; cashier, kitchen and admin screens update in real time.

Each restaurant sets its own brand colour and light/dark look in Admin → System Settings; readable contrast is worked out automatically.

Built with Next.js 16, React 19, Tailwind 4, Firebase (Firestore + Auth) and NextAuth.

See **[ROADMAP.md](ROADMAP.md)** for how the system works, what's done and what's next, and **[PRODUCTION-CHECKLIST.md](PRODUCTION-CHECKLIST.md)** for what's left before selling.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in Firebase config + NEXTAUTH_SECRET
# Firebase console → Project settings → Service accounts → Generate new private key
# save it as service-account.json in this folder (git-ignored; never commit it)
npm run dev                  # http://localhost:3000 (also reachable on your LAN)
```

Deploy Firestore security rules after changing `firestore.rules`:

```bash
firebase deploy --only firestore:rules
```

## Routes

| Route | Who |
|---|---|
| `/menu/<tableNumber>` | Customers (via table QR code) |
| `/status/<orderId>`, `/checkout/<orderId>` | Customers |
| `/login` | Staff |
| `/cashier` (`/pos`) | Cashier, admin |
| `/kitchen` | Kitchen, admin |
| `/admin` (`/dashboard`) | Admin |

Staff log in with their own accounts, managed in **Admin → Staff**. The demo accounts (`admin@` / `cashier@` / `kitchen@restaurant.com`, passwords `admin123` / `cashier123` / `kitchen123`) are for testing — change or deactivate them before going live.

## Testing

Run these before showing the app to anyone or after changing code:

```bash
npm run seed:demo    # demo menu, tables, floors and orders (only touches demo data)
npm run test:rules   # 47 checks of the database security rules, as each role
npm run test:e2e     # 42-step click-through in Edge: ordering, cashier, kitchen, admin, staff accounts (needs npm run dev)
```

Both tests clean up the data they create.

## Scripts

- `npm run dev` — dev server on `0.0.0.0`
- `npm run build` / `npm start` — production build
- `npm run lint` — ESLint
- `npm run seed:demo` / `npm run seed:demo:remove` — load / remove demo data
- `npm run test:rules` / `npm run test:e2e` — automated tests (see Testing)

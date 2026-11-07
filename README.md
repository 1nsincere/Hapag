# Hapag

**Smart QR ordering & POS for restaurants — small or big.**

Hapag (Filipino for *dining table*) is table-side QR ordering for restaurants: customers scan a table QR code, order and pay from their phone; cashier, kitchen and admin screens update in real time.

Built with Next.js 16, React 19, Tailwind 4, Firebase (Firestore + Auth) and NextAuth.

See **[ROADMAP.md](ROADMAP.md)** for how the system works, what's done and what's next.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in Firebase config + NEXTAUTH_SECRET
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

Demo staff accounts are defined in `lib/auth.ts` (development only — see roadmap).

## Scripts

- `npm run dev` — dev server on `0.0.0.0`
- `npm run build` / `npm start` — production build
- `npm run lint` — ESLint

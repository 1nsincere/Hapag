# Deploy the Hapag demo site (Vercel)

The portfolio/demo site is the normal Hapag app with **demo mode** on:

- `/` shows the showcase landing page, with one-click entry as Guest, Cashier, Kitchen or Owner.
- Demo accounts can run service but can't delete or rename anything (enforced by `firestore.rules`).
- Everything visitors create is tagged `demo: true` and reset every night (Vercel Cron → `/api/demo/reset`).
- The first visit sets everything up by itself: demo accounts, plus the demo restaurant if the database is empty.

> Never turn on demo mode for a real restaurant's site.

## 1. Deploy the database rules (once, and after every rules change)

```powershell
cd "C:\Users\acegr\Desktop\Qr_Ordering System\qr_system"
npx firebase-tools deploy --only firestore:rules
```

It should end with **Deploy complete!** The rules are compiled first; if there's a mistake, nothing is published.

## 2. Make the secrets (on your computer)

```powershell
# NEXTAUTH_SECRET (copy what it prints)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# CRON_SECRET (run again, copy the new value)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# FIREBASE_SERVICE_ACCOUNT, straight to the clipboard (never shown on screen). Do this last.
[Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json")) | Set-Clipboard
```

## 3. Import the project

1. Go to vercel.com/new, sign in with GitHub, and **Import** the `Hapag` repo.
2. Leave Framework (Next.js) and Root Directory (`./`) as they are.

## 4. Environment variables (before the first deploy)

| Name | Value |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` … `NEXT_PUBLIC_FIREBASE_APP_ID` (6) | copy from `.env.local` |
| `NEXTAUTH_SECRET` | from step 2 |
| `FIREBASE_SERVICE_ACCOUNT` | paste from the clipboard (step 2) |
| `CRON_SECRET` | from step 2 |
| `NEXT_PUBLIC_DEMO_MODE` | `true` |
| `PAYMENT_PROVIDER` | `practice` |

Don't add `DEV_ORIGINS`. Add `NEXTAUTH_URL` after the first deploy (step 6).
`NEXT_PUBLIC_…` values are built into the site, so **redeploy after changing any of them**.

## 5. Deploy

Click **Deploy** and wait about 2 minutes.

## 6. Tell the login system its address

Settings → Environment Variables → add `NEXTAUTH_URL` = `https://<your-project>.vercel.app` (no slash at the end).
Then Deployments → ⋯ → **Redeploy**.

## 7. Allow the address in Firebase

Firebase console → Authentication → Settings → **Authorized domains** → Add domain → `<your-project>.vercel.app`.

## 8. Open it

Open the site. The first visit takes a few extra seconds while it sets up the demo.
Try **Enter as Cashier**, and scan the guest QR code with your phone.

## 9. Optional: run the nightly reset now

```powershell
Invoke-RestMethod -Uri "https://<your-project>.vercel.app/api/demo/reset" -Headers @{ Authorization = "Bearer <CRON_SECRET>" }
```

It removes everything tagged `demo: true` and re-creates the demo restaurant. If the demo shares a database with your
own testing, this also resets the demo tables' floor-plan positions and the brand colour. A separate Firebase project
for the demo avoids that.

## 10. Make it yours

- Edit `lib/site.ts` (your name, links), then push. Vercel redeploys by itself.
- Vercel → Settings → General → change the Project Name for a nicer address.

## Troubleshooting

| You see | Fix |
|---|---|
| "Scan the code on your table" instead of the landing page | `NEXT_PUBLIC_DEMO_MODE` is missing, or no redeploy happened after adding it |
| "The demo is waking up" when entering | `FIREBASE_SERVICE_ACCOUNT` is missing or wrong; check Vercel → Logs |
| Login goes in circles | `NEXTAUTH_URL` doesn't exactly match the site address; redeploy after fixing |
| QR codes open a 192.168… address | Visit `/` once (the demo clears home-network addresses), or clear it in System Settings on a non-demo site |
| Nightly reset doesn't run | `CRON_SECRET` missing. Vercel → Settings → Cron Jobs shows the runs |

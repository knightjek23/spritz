# Slice 7 — Native purchases (iOS first, Android-ready)

**Status:** code built and typechecked; needs the migration, four env vars, App Store Connect products, the RevenueCat project, an In-App Purchase capability in Xcode, and a sandbox run. Banking reads Clear as of 2026-09-11.
**Decisions:** D31 (7-day trial on monthly, Apple intro offer), D32 (Stripe-Pro users: "managed on the web", no buttons), D33 (Restore on /pricing and Account). D4 still stands: no link-out payments.
**Ships as:** web code via Vercel **plus** a native rebuild (new plugin → `npx cap sync ios`, In-App Purchase capability, build 3).

## What it does

Inside the shell, `/pricing` becomes the App Store paywall: prices come from the store (localized), the trial line reflects Apple's introductory offer, the CTA runs `Purchases.purchasePackage`, and a Restore purchases link sits under it. Stripe is unreachable from the shell: no checkout, no portal, no "Stripe" copy. After a purchase the app calls `POST /api/purchases/sync`, which reads the subscriber from RevenueCat's REST API and writes `users.plan`, `is_lifetime`, `pro_source` immediately; the RevenueCat webhook keeps it right over time (renewals, expirations, transfers). Account shows the plan and, per D32/D33, the right action for where it came from.

## Files

- `lib/native/purchases.ts` — SDK wrapper: `configurePurchases(clerkUserId)`, `logOutPurchases`, `getNativePlans`, `purchasePro(plan)`, `restorePro`, `syncEntitlement`. Package ids `$rc_monthly`, `$rc_annual`, `lifetime`; entitlement `pro`. Empty offerings → `null`/`unavailable` (on iOS this means agreements, banking or product approval, not code).
- `lib/billing/entitlement.ts` — the one place that writes Pro: `grantPro(userId, source, {lifetime})`, `revokePro(userId, source)` (never a lifetime buyer, never another system's Pro), Clerk mirror.
- `supabase/migrations/0030_pro_source.sql` — `users.pro_source` in ('stripe','apple','play').
- `app/api/webhooks/revenuecat/route.ts` — rewritten on the shared module: timing-safe auth, `product_id` decides lifetime, `store` decides source, `TRANSFER` handled, `SUBSCRIPTION_PAUSED`/`TEST` explicit no-ops.
- `app/api/webhooks/stripe/route.ts` — records `pro_source: 'stripe'`; downgrade scoped to Stripe-sourced or legacy rows.
- `app/api/purchases/sync/route.ts` — Clerk-authed; `REVENUECAT_SECRET_API_KEY`.
- `app/pricing/page.tsx` — native branch (store prices, purchase, restore, copy), signed-out native users go to `/sign-up`, "Stripe" removed from FAQ copy.
- `components/plan-actions.tsx` + `app/account/page.tsx` — plan card actions by platform and source; store subscribers get "Manage subscription" opening the App Store / Play subscriptions page in the browser sheet.
- `components/native-auth-bridge.tsx` — configures the SDK with the Clerk user id on sign-in, logs out on sign-out.
- `package.json` / lockfile — `@revenuecat/purchases-capacitor@^11.3.2`.

## Setup only Josh can do (in this order)

1. **Migration:** `npm run db:migrate`.
2. **App Store Connect → Spritz → Monetization:**
   - Subscriptions → create group **Spritz Pro** → two auto-renewable subscriptions: `spritz_pro_monthly` ($4.99, 1 month, **Introductory Offer: 7-day free trial**, all territories) and `spritz_pro_annual` ($29.99, 1 year, no intro offer). Each needs a localized display name/description and a review screenshot (any screenshot of the pricing page is accepted).
   - In-App Purchases → **Non-Consumable** `spritz_pro_lifetime` ($89).
   - Subscriptions also need the group's localized display name, and the App Store listing's Privacy Policy URL and Terms of Use (EULA) link (Apple's standard EULA is fine; paste its URL in the app description or the EULA field).
3. **RevenueCat (app.revenuecat.com):** new project "Spritz" → add Apple App Store app, bundle `app.spritzofficial`, upload an **In-App Purchase Key** (App Store Connect → Users and Access → Integrations → In-App Purchase → generate, download .p8) and the **App-Specific Shared Secret**. Products: import the three ids. Entitlement `pro` attached to all three. Offering `default` with packages Monthly (`$rc_monthly`), Annual (`$rc_annual`), and a custom package with identifier **`lifetime`**. Integrations → Webhooks → URL `https://spritzofficial.app/api/webhooks/revenuecat`, Authorization header = a long random string.
4. **Vercel env (Production):** `NEXT_PUBLIC_REVENUECAT_IOS_KEY` (Apple public SDK key, `appl_…`), `REVENUECAT_SECRET_API_KEY` (Project → API keys → secret `sk_…`), `REVENUECAT_WEBHOOK_AUTH` (the header string). Redeploy.
5. **Xcode:** `npm install && npx cap sync ios`; App target → Signing & Capabilities → + Capability → **In-App Purchase**. Build number 3 → archive → TestFlight.
6. **Sandbox tester:** App Store Connect → Users and Access → Sandbox → add a tester (any unused email). On the iPhone: Settings → App Store → Sandbox Account → sign in with it. TestFlight builds bill through sandbox automatically.
7. **App Privacy:** add Purchases → Purchase History (linked, App Functionality) per the slice 9 brief.

## Verification (acceptance criteria from the build map)

Sandbox on device: monthly purchase → sheet shows "7-day free trial" → Pro immediately (sync) → Account says Spritz Pro · Active with Manage subscription → `users` row has `plan=pro, pro_source=apple`. Lifetime → `is_lifetime=true`, Account shows Lifetime. Sandbox subscriptions renew every few minutes and expire after 6 renewals: watch `plan` drop to free via the EXPIRATION webhook and confirm a lifetime row survives. Restore on a reinstall. Reviewer sweep: from inside the app, `/pricing`, Account, "Unlock with Pro" on a fragrance, "Pro unlocks 25" on Similar: no Stripe anywhere. Web unchanged: Stripe checkout and portal still work.

## Not in this pass

`pro_source` for pre-existing Stripe subscribers is NULL until their next Stripe event; the code treats NULL-with-Stripe-customer as Stripe. RevenueCat's Play app and `NEXT_PUBLIC_REVENUECAT_ANDROID_KEY` wait for the Android slice-7 half. Promotional offers, win-back offers, and the Small Business Program enrollment (15% instead of 30%) are App Store Connect tasks, not code.

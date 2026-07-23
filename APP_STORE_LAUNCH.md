# Spritz — App Store Launch Runbook (iOS first, native IAP)

Goal: ship Spritz to the **Apple App Store** as a native app that sells Pro
through **in-app purchases**, then reuse ~90% of it for Google Play.

Spritz is a Next.js PWA, so the app is a **Capacitor** native shell that loads
the live site (`spritzofficial.app`) and layers on native capabilities —
**RevenueCat** in-app purchases, push notifications, and the native camera.
That native layer is what gets you past Apple's Guideline 4.2 ("not just a
repackaged website").

**Entitlement model (already built):** web purchases use Stripe; mobile
purchases use StoreKit via RevenueCat. Both converge on the same Supabase
truth — `users.plan = 'pro'` and `users.is_lifetime`. The mobile side is wired
by `app/api/webhooks/revenuecat/route.ts` (already in the repo).

> Money split to remember: Apple takes **15–30%** of IAP revenue (15% under
> $1M/yr via the Small Business Program — enroll in it). Stripe on web stays
> at Stripe's ~3%. Same $4.99 / $29.99 / $89 prices; smaller net on mobile.

---

## Prerequisites

- **Apple Developer Program** — enroll at developer.apple.com ($99/yr). As an
  individual it's usually approved within a day; do this first, everything gates
  on it. Also enroll in the **App Store Small Business Program** (15% rate).
- **Mac + Xcode** — required to build and submit. Install the latest Xcode from
  the Mac App Store. ✅ (you have this)
- **A physical iPhone** for testing IAP (the sandbox doesn't fully work in the
  simulator).
- **Bundle ID:** `app.spritzofficial` (matches `capacitor.config.ts`).

---

## Phase 1 — App Store Connect: app record + products

1. **appstoreconnect.apple.com → Apps → +** → New App. Platform iOS, name
   "Spritz", primary language, bundle ID `app.spritzofficial`, SKU `spritz-ios`.
2. Complete **Agreements, Tax, and Banking** (Business section). **IAP will not
   work until the Paid Apps agreement is active and banking/tax are filled in** —
   this trips everyone up, do it early.
3. **In-App Purchases** → create three products:

   | Product | Type | Product ID | Price |
   |---|---|---|---|
   | Pro Monthly | Auto-Renewable Subscription | `spritz_pro_monthly` | $4.99/mo |
   | Pro Annual | Auto-Renewable Subscription | `spritz_pro_annual` | $29.99/yr |
   | Pro Lifetime | Non-Consumable | `spritz_pro_lifetime` | $89 one-time |

   - Put the two subscriptions in **one Subscription Group** (e.g. "Spritz Pro")
     so users can move between monthly/annual. Lifetime is a separate
     non-consumable.
   - Optional: add a **7-day free trial (Introductory Offer)** on Pro Monthly to
     match the web. Apple trials are configured on the product, not in code.
   - Each product needs a localized display name, description, and a review
     screenshot before it can be submitted.

---

## Phase 2 — RevenueCat: the purchase + entitlement layer

RevenueCat wraps StoreKit (and later Play Billing), verifies receipts, and fires
the webhook that grants Pro. Sign up at revenuecat.com (free under ~$2.5k/mo
tracked revenue).

1. **Create a project** "Spritz" → add an **App** for the Apple App Store. Enter
   the bundle ID and your **App Store Connect Shared Secret** (App Store Connect
   → your app → App Information → App-Specific Shared Secret).
2. **Products** → import/add `spritz_pro_monthly`, `spritz_pro_annual`,
   `spritz_pro_lifetime`.
3. **Entitlements** → create one entitlement called **`pro`** and attach all
   three products to it. (Your app checks this single entitlement; the webhook
   grants `plan='pro'` regardless of which product unlocked it.)
4. **Offerings** → create a default offering with packages:
   - `$rc_monthly` → `spritz_pro_monthly`
   - `$rc_annual` → `spritz_pro_annual`
   - a custom package `lifetime` → `spritz_pro_lifetime`
5. **API keys** → copy the **public Apple SDK key** → set as
   `NEXT_PUBLIC_REVENUECAT_IOS_KEY` (in Vercel + `.env.local`).
6. **Webhook** → Integrations → Webhooks → add:
   - URL: `https://spritzofficial.app/api/webhooks/revenuecat`
   - **Authorization header:** invent a long random string, paste it here, and
     set the identical value as `REVENUECAT_WEBHOOK_AUTH` in Vercel. The route
     rejects anything that doesn't match.

**Already handled in code:** `app/api/webhooks/revenuecat/route.ts` maps
RevenueCat's `app_user_id` (which you'll set to the Clerk user id) to the
Supabase user, grants `pro` on purchase/renewal, sets `is_lifetime` on the
non-consumable, drops to `free` on expiration, and protects lifetime buyers from
downgrade — the same rules as the Stripe webhook.

---

## Phase 3 — Capacitor: build the iOS shell

From the repo root on your Mac:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios
npx cap add ios
npx cap sync ios
npx cap open ios        # opens the project in Xcode
```

`capacitor.config.ts` is already in the repo (bundle id `app.spritzofficial`,
loading `https://spritzofficial.app`). In Xcode:

- Select the project → **Signing & Capabilities** → set your Team (from the
  Developer Program) so it can sign.
- Run on a connected iPhone to confirm the site loads inside the shell.

> The shell loads the live site, so front-end changes deploy via Vercel as
> usual — you only rebuild the native app when native code/plugins change.

---

## Phase 4 — Wire in-app purchases (client)

Install the RevenueCat Capacitor SDK **on your Mac** (it's native-only, so it's
kept out of the Vercel web build until now):

```bash
npm install @revenuecat/purchases-capacitor
npx cap sync ios
```

Add a native purchase helper. Create `lib/native/purchases.ts`:

```ts
// Native in-app purchases (RevenueCat). No-ops on web so the Stripe flow
// stays the path there. The dynamic import is marked webpackIgnore so the
// Vercel web build never tries to bundle the native-only package.
export function isNativeApp(): boolean {
  return (
    typeof window !== "undefined" &&
    // @ts-expect-error Capacitor is injected by the native runtime
    !!window.Capacitor?.isNativePlatform?.()
  );
}

async function rc() {
  return import(/* webpackIgnore: true */ "@revenuecat/purchases-capacitor");
}

/** Call once after the user signs in so RevenueCat is keyed to your user. */
export async function configurePurchases(clerkUserId: string) {
  if (!isNativeApp()) return;
  const { Purchases } = await rc();
  await Purchases.configure({
    apiKey: process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY ?? "",
    appUserID: clerkUserId, // becomes event.app_user_id in the webhook
  });
}

/** Buy Pro. Maps the plan to a RevenueCat package and triggers StoreKit. */
export async function purchasePro(plan: "monthly" | "annual" | "lifetime") {
  const { Purchases } = await rc();
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  if (!current) throw new Error("No RevenueCat offering configured");
  const pkg =
    plan === "monthly"
      ? current.monthly
      : plan === "annual"
        ? current.annual
        : current.availablePackages.find((p) => p.identifier === "lifetime");
  if (!pkg) throw new Error(`No package for ${plan}`);
  await Purchases.purchasePackage({ aPackage: pkg });
  // The webhook grants Pro server-side; the client can also refresh
  // customerInfo to update UI immediately.
}
```

Then branch the pricing page so the app uses IAP and the web uses Stripe. In
`app/pricing/page.tsx`, inside `upgrade()`:

```ts
import { isNativeApp, purchasePro } from "@/lib/native/purchases";

// ...at the top of upgrade(), after the sign-in check:
if (isNativeApp()) {
  setBusy(true);
  try {
    await purchasePro(plan);
    // entitlement arrives via the RevenueCat webhook; route to Pro state
    window.location.href = "/collection?upgraded=1";
  } catch (err) {
    console.error("[pricing] native purchase failed:", err);
  } finally {
    setBusy(false);
  }
  return; // don't fall through to the Stripe fetch
}
```

And call `configurePurchases(user.id)` once after sign-in (e.g. in a top-level
client effect where Clerk's `user` is available).

> **Apple rule:** inside the iOS app, do **not** show the Stripe checkout or
> external "subscribe on the web" links for Pro — that's an automatic 3.1.1
> rejection. The `isNativeApp()` branch above keeps Stripe web-only. (Apple's
> 2025 external-link entitlements exist but are narrow and region-specific;
> don't rely on them for v1.)

---

## Phase 5 — Native features for Guideline 4.2

A pure web wrapper gets rejected. Ship these so the app is genuinely "app-like":

- **Push notifications** (the #1 differentiator — Safari web push doesn't count):
  `npm install @capacitor/push-notifications`, add the Push Notifications
  capability in Xcode, create an APNs key in the Developer portal, and register
  a device token. Even a simple "your wishlist fragrance is on sale" or "new
  drops this week" hook satisfies review and adds real value.
- **Native camera** for scanning: `npm install @capacitor/camera` and use it for
  the bottle scan instead of the web `getUserMedia` path when native — smoother,
  and concrete device-feature evidence.
- **Offline handling:** a graceful offline screen / cached library view.

---

## Phase 6 — Store listing + privacy

- **Screenshots** for required device sizes (6.7" and 6.5" at minimum) — use a
  real iPhone or the simulator.
- **App Privacy ("nutrition labels")** — declare data collection honestly:
  account/email (Clerk), purchases (Apple/RevenueCat), photos/camera (scans),
  usage/analytics (PostHog), and that data is used for app functionality. Link
  your **privacy policy URL**.
- **Age rating**, category (Lifestyle or Shopping), description, keywords,
  support URL.
- **Reviewer notes + demo account:** give App Review a working login and one
  line: "Pro is unlocked via in-app purchase; use the sandbox tester to buy Pro
  Monthly to see gated features (AI dupes, full library)." Missing this is a
  top rejection cause.

---

## Phase 7 — Test before submitting

1. **StoreKit sandbox:** create a **Sandbox Apple Account** (App Store Connect →
   Users and Access → Sandbox Testers). Sign into it on the iPhone (Settings →
   Developer / App Store sandbox), then buy each product in the app — sandbox
   purchases are free.
2. Confirm the **RevenueCat webhook** fires: after a sandbox purchase, check
   that `users.plan` flips to `pro` (and `is_lifetime` for lifetime) in Supabase,
   and that a Pro-gated feature unlocks. RevenueCat's dashboard shows the event +
   webhook delivery status for debugging.
3. Test **expiration** (sandbox subscriptions renew/expire on an accelerated
   clock) → confirm you drop back to `free`, and that a lifetime purchase does
   **not** get downgraded.
4. Push a build to **TestFlight** for a real end-to-end run before submitting.

---

## Phase 8 — Submit

Archive in Xcode (Product → Archive) → upload to App Store Connect → attach the
build to the version → submit for review. First reviews typically take 1–3 days.

**If rejected under 4.2:** lead your resubmission notes with the native features
(push, camera, IAP) and the concrete user value beyond the website. That's
usually enough.

---

## Environment variables (add to Vercel + `.env.local`)

```
REVENUECAT_WEBHOOK_AUTH=            # the Authorization header value you set in RevenueCat
NEXT_PUBLIC_REVENUECAT_IOS_KEY=     # RevenueCat public Apple SDK key
NEXT_PUBLIC_REVENUECAT_ANDROID_KEY= # (later, for Android)
```

The webhook route is live once `REVENUECAT_WEBHOOK_AUTH` is set and deployed —
no migration needed; it reuses `users.plan` / `users.is_lifetime`.

---

## Android later (mostly free reuse)

Same RevenueCat project + the **same webhook** and entitlement model. Add a Play
Billing app in RevenueCat, `npx cap add android`, package via Play Console
($25 one-time), and use `NEXT_PUBLIC_REVENUECAT_ANDROID_KEY`. Google is more
lenient than Apple on wrapped web apps, so it's the easier follow-up.

---

## Note: multi-source entitlement

A user could theoretically hold both a Stripe (web) subscription and an Apple
IAP. Both write `plan='pro'`, so access is correct, but avoid billing them
twice: in the app, if someone is already Pro via Stripe, hide the IAP CTA (check
`publicMetadata.plan === 'pro'`). If you later want per-source reporting or
smarter downgrade rules, add a `pro_source` column — not required for v1.

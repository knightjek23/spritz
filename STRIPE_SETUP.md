# Stripe Setup Runbook — Spritz Pro

Locked pricing: **Free · Pro Monthly $4.99/mo with a 7-day free trial · Pro Annual $29.99/yr billed upfront · Pro Lifetime $89 one-time.**

The trial sits on **monthly, not annual** — deliberately. A trial on annual would auto-convert to a $29.99 charge (a "surprise bill"); on monthly the worst-case auto-charge after the trial is $4.99. Annual charges its known $29.99 upfront at checkout.

The app code is already wired. This runbook covers the credential-gated steps only I can't do for you: creating the products/prices in Stripe, registering the webhook, and pasting the resulting IDs into your env. Do the whole thing in **Test mode** first (toggle top-right in the Stripe dashboard), verify a test checkout, then repeat in **Live mode** for the four values that differ.

---

## 1. Create the Product + two Prices

Stripe dashboard → **Product catalog** → **Add product**.

- **Name:** `Spritz Pro`
- **Description:** `Full fragrance library — perfumer credits, house history, note profiles, and on-demand AI dupes.`

Add **three prices** to this one product (not separate products):

| Price | Amount | Billing period | Notes |
|---|---|---|---|
| Pro Monthly | $4.99 | Monthly (recurring) | Do **not** set the trial here |
| Pro Annual | $29.99 | Yearly (recurring) | — |
| Pro Lifetime | $89 | **One-time** | Price type "One time", not recurring |

> The 7-day trial is applied in code (`app/api/stripe/checkout/route.ts`, monthly only), not on the Stripe Price. Leave "Free trial" blank on all prices so it isn't applied twice.
>
> The Lifetime price **must be one-time (non-recurring)** — the app checks it out in `mode: "payment"` and the webhook grants permanent Pro on `checkout.session.completed`. A recurring Lifetime price would behave like a subscription.

After saving, click each price and copy its **API ID** (looks like `price_1Qx...`). You'll have three.

---

## 2. Put the keys + price IDs in your env

Local dev goes in `.env.local`; production goes in **Vercel → Project → Settings → Environment Variables** (add to Production, and Preview if you want branch deploys to work).

```
STRIPE_SECRET_KEY=sk_test_…            # Developers → API keys → Secret key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…          # from step 3
STRIPE_PRICE_ID_PRO_MONTHLY=price_…    # the $4.99/mo price API ID
STRIPE_PRICE_ID_PRO_ANNUAL=price_…     # the $29.99/yr price API ID
STRIPE_PRICE_ID_PRO_LIFETIME=price_…   # the $89 one-time price API ID
NEXT_PUBLIC_APP_URL=http://localhost:3000   # your real domain in prod
```

The code reads these in `lib/stripe.ts` (`STRIPE_PRICES`) and the checkout route. Missing IDs surface as a `stripe_price_not_configured` 500, so if upgrade buttons return an error, this is the first thing to check.

---

## 3. Register the webhook

The webhook is what actually flips a user to Pro — without it, checkout succeeds but entitlement never updates.

Stripe dashboard → **Developers → Webhooks → Add endpoint**.

- **Endpoint URL:** `https://YOUR_DOMAIN/api/webhooks/stripe`
- **Events to send** (the handler only acts on these four):
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

Save, then reveal the **Signing secret** (`whsec_…`) and put it in `STRIPE_WEBHOOK_SECRET`.

### Local testing without a public URL
```
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```
`stripe listen` prints its own `whsec_…` — use that one in `.env.local` while testing locally. Trigger a real flow rather than `stripe trigger`, so the customer/metadata linkage matches your Supabase rows.

---

## 4. Enable the customer portal (for cancel / manage)

`app/api/stripe/portal/route.ts` sends users to Stripe's hosted billing portal. Turn it on once:

Stripe dashboard → **Settings → Billing → Customer portal** → activate. Allow: cancel subscription, update payment method, switch plan (optional). Do this in Test and Live separately.

---

## 5. End-to-end test (Test mode)

1. `npm run build` locally — confirms the code changes typecheck and compile.
2. Run the app + `stripe listen`. Go to `/pricing`, sign in, pick **Monthly**, click upgrade.
3. Use card `4242 4242 4242 4242`, any future expiry / CVC / ZIP.
4. Confirm:
   - You land on `/collection?upgraded=1`.
   - Stripe shows the subscription in **`trialing`** status with a 7-day trial (first charge is $4.99, dated 7 days out).
   - Your `public.users` row flips `plan` to `pro` (the webhook does this even during trial — `trialing` counts as active).
   - A Pro-gated feature works, e.g. AI dupes (`POST /api/dupes/ai/[id]` no longer 402s).
5. Test **Annual** too — it should charge $29.99 immediately with **no** trial.
6. Cancel via the account menu → portal → confirm the `customer.subscription.deleted` event flips `plan` back to `free`.

---

## 6. Go live

Flip the dashboard to **Live mode** and repeat: create the product + two prices again (Live has its own catalog), add a Live webhook endpoint pointed at your production domain, then swap these four env values in Vercel to their live counterparts:

- `STRIPE_SECRET_KEY` → `sk_live_…`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` → `pk_live_…`
- `STRIPE_WEBHOOK_SECRET` → the Live endpoint's `whsec_…`
- `STRIPE_PRICE_ID_PRO_MONTHLY` / `STRIPE_PRICE_ID_PRO_ANNUAL` → the Live price IDs

Redeploy. Do one real card purchase and immediately refund it from the dashboard to confirm the live path end-to-end.

---

## What's already handled in code (no action needed)
- 7-day trial applied to monthly only — `app/api/stripe/checkout/route.ts`.
- `trialing` treated as Pro; `deleted` reverts to free — `app/api/webhooks/stripe/route.ts`.
- Stripe → Supabase (`users.plan`, source of truth) → Clerk `publicMetadata` sync.
- Missing-user backfill on checkout — `lib/users.ts` (`ensureAppUser`).
- Pricing page reflects $4.99 / $29.99 + trial copy — `app/pricing/page.tsx`.

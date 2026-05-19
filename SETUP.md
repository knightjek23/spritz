# Spritz — Day 1 Setup Runbook

Get from "scaffold on disk" to "deployed on Vercel with a real DB" in roughly an hour. The keys, dashboards, and migration push all need *your* hands — Anthropic doesn't have access to your Clerk / Supabase / Stripe / OpenAI / Vercel accounts.

The scaffold has already been typechecked successfully (`npx tsc --noEmit` passes with zero errors), so you're starting from a known-good base.

---

## 0. Prerequisites

```bash
node --version    # need >= 20
npm --version
git --version
```

If Node is older than 20, install via [nvm](https://github.com/nvm-sh/nvm) (`nvm install 20 && nvm use 20`).

---

## 1. Install dependencies (5 min)

From the project folder:

```bash
npm install
```

Expect ~457 packages, ~1 minute on a decent connection. You'll see deprecation warnings for `@clerk/types` and `@clerk/clerk-react` — those are internal to `@clerk/nextjs` and harmless.

Then a sanity check:

```bash
npx tsc --noEmit
```

Should print nothing. If it errors, send me the output.

---

## 2. Get your keys (~30 min, mostly dashboard clicking)

Open `.env.local` (already created from `.env.example`). Fill in each section as you go. **Don't commit this file** — it's gitignored.

### 2a. Supabase

1. Go to https://supabase.com/dashboard → **New project**
2. Name: `spritz`. Region: closest to you (US East / US West). Save the DB password somewhere safe.
3. Wait ~2 min for provisioning.
4. **Settings → API** → copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key (under "Reveal") → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ never commit, never expose to browser

### 2b. Clerk

1. Go to https://dashboard.clerk.com → **Create application**
2. Name: `Spritz`. Sign-in methods: **Email**, **Apple**, **Google**.
3. **API Keys** → copy:
   - Publishable key → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - Secret key → `CLERK_SECRET_KEY`
4. **Webhooks** → **Add endpoint** (do this *after* deploy, see Step 5 — for now leave `CLERK_WEBHOOK_SECRET` blank).
5. **JWT Templates → New template** — this is the one step Day 1 almost always misses. The app can't read RLS-bound rows until this exists.

   **Why this matters.** Supabase RLS policies in `0001_initial_schema.sql` resolve the current user via `auth.jwt() ->> 'sub'`. That JWT has to be signed by something Supabase trusts (its own JWT secret), and it has to land in the `Authorization` header on every Supabase request. The Clerk JWT Template is what produces that token. `lib/supabase/server.ts` calls `getToken({ template: "supabase" })` — that string literal **must match** the template name exactly.

   **Steps:**
   1. In the Clerk dashboard → **JWT Templates → New template**. Pick **Supabase** from the preset list if it's offered (Clerk auto-fills the right claims). If not, choose **Blank template** and fill it in manually as below.
   2. **Name:** `supabase` (lowercase, exact — the app code looks for this string).
   3. **Token lifetime:** `60s` is fine; keep the default.
   4. **Signing algorithm:** `HS256`.
   5. **Signing key:** paste your Supabase **JWT Secret** — find it in Supabase dashboard → **Settings → API → JWT Settings → JWT Secret** (click *Reveal*). This is the shared symmetric key both services use; without this, Supabase rejects every token.
   6. **Claims** — paste this exact JSON:
      ```json
      {
        "aud": "authenticated",
        "role": "authenticated",
        "email": "{{user.primary_email_address}}",
        "app_metadata": {},
        "user_metadata": {
          "plan": "{{user.public_metadata.plan}}"
        }
      }
      ```
      The `aud` and `role` claims are what Supabase RLS expects for a signed-in user. The `user_metadata.plan` line is optional but lets you write RLS policies that gate Pro-only rows without an extra `users` table lookup.
   7. **Save**.

   After saving, sign out and back in once so your existing session picks up the new template. If you stay signed in, `getToken({ template: "supabase" })` will throw "Not Found" until the session refreshes.

6. **Stripe → Clerk metadata sync** (no UI step, just FYI): the `/api/webhooks/stripe` route mirrors plan changes into Clerk's `publicMetadata.plan` so client components like `<KnownDupes />` can render the right state without a server roundtrip. Supabase is still the source of truth — Clerk is just a cache for the UI. No setup needed; it works as soon as the Stripe webhook is live.

### 2c. Stripe

1. Go to https://dashboard.stripe.com → start in **Test mode** (toggle top right).
2. **Developers → API keys** → copy:
   - Publishable key → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - Secret key → `STRIPE_SECRET_KEY`
3. **Product catalog → Add product**:
   - Name: `Spritz Pro — Monthly`. Recurring $4.99/month. Save.
   - Copy the **price ID** (`price_xxx`) → `STRIPE_PRICE_ID_PRO_MONTHLY`
4. Repeat for `Spritz Pro — Annual` at $39/year → `STRIPE_PRICE_ID_PRO_ANNUAL`
5. Webhook secret comes after deploy — leave `STRIPE_WEBHOOK_SECRET` blank for now.

### 2d. OpenAI

1. Go to https://platform.openai.com/api-keys → **Create new secret key**
2. Copy → `OPENAI_API_KEY`
3. Make sure billing is set up — GPT-4o vision is pay-per-use (~$0.01 per scan).

### 2e. Affiliate IDs (low priority for Day 1)

Apply now, fill in keys when approved (1–14 days):
- Scentbird: https://www.scentbird.com/affiliate (Impact Radius)
- FragranceNet: https://www.fragrancenet.com/affiliates
- Nordstrom: https://www.nordstrom.com/affiliate-program (Rakuten)

App will work without them — the buy links just won't earn commission until filled.

### 2f. PostHog (optional, Day 13)

Skip for Day 1. Set up later when you wire analytics.

---

## 3. Push the schema to Supabase (5 min)

Two ways. Pick one.

### Option A — Supabase CLI (recommended if you'll iterate on schema)

```bash
# Install the CLI
brew install supabase/tap/supabase    # macOS
# or: scoop install supabase           # Windows
# or: see https://supabase.com/docs/guides/cli

# Login + link
supabase login
supabase link --project-ref <your-project-ref>
# project-ref is in your Supabase URL: https://app.supabase.com/project/<ref>

# Push
supabase db push
```

### Option B — Paste into the SQL editor (faster for Day 1)

1. Open https://supabase.com/dashboard/project/_/sql
2. Copy the *entire* contents of `supabase/migrations/0001_initial_schema.sql`
3. Paste, click **Run**.
4. Verify in **Table Editor** that you see: `fragrances`, `users`, `collection_items`, `scan_events`, `affiliate_clicks`, `dupe_pairs`. Plus the `unmatched_scans_summary` view.

**Verify pgvector extension:**
```sql
select * from pg_extension where extname in ('vector', 'pg_trgm', 'uuid-ossp');
-- should return 3 rows
```

If `vector` is missing, Supabase has it preinstalled but extensions need to be enabled per project — go to **Database → Extensions** and toggle `vector` on.

---

## 4. Run locally to confirm everything talks (5 min)

```bash
npm run dev
# → open http://localhost:3000
```

You should see the home screen with "Scan a bottle" + "Search by name" buttons.

Quick checks:
- **Sign up** at `/sign-up` → check Clerk dashboard, see your user appear.
- **Visit Supabase Table Editor → users** → you'll see *no row yet* because the Clerk webhook isn't wired (that happens after deploy in Step 5).
- **Try a scan** → the camera will open but the database is empty, so OCR will succeed and lookup will return zero matches. Expected.

If anything 500s, check the terminal — the most common Day 1 issues are mistyped env vars and a missing Supabase JWT template.

---

## 5. Deploy to Vercel (10 min)

### 5a. Push to GitHub

```bash
git init
git add .
git commit -m "Day 1: scaffold + schema"

# Create a private repo on GitHub, then:
git remote add origin git@github.com:<you>/spritz.git
git branch -M main
git push -u origin main
```

⚠️ Verify `.env.local` is **not** in the commit (`git status` should not list it). The `.gitignore` covers it but check.

### 5b. Connect to Vercel

1. Go to https://vercel.com/new → import the repo.
2. **Framework Preset**: Next.js (auto-detected).
3. **Root Directory**: leave as is (the project root *is* the Next.js app).
4. **Environment Variables**: paste each from `.env.local`. Skip `STRIPE_WEBHOOK_SECRET` and `CLERK_WEBHOOK_SECRET` for now — you'll set those next.
5. **Deploy**.
6. Once live, copy the production URL (e.g. `https://spritz.vercel.app`).

Update one env var:
- `NEXT_PUBLIC_APP_URL` → set to the production URL → redeploy.

### 5c. Wire the webhooks (this is the part everyone forgets)

**Clerk webhook:**
1. Clerk dashboard → **Webhooks** → **Add endpoint**
2. URL: `https://<your-app>.vercel.app/api/webhooks/clerk`
3. Events: subscribe to `user.created`, `user.updated`, `user.deleted`
4. Copy the **Signing Secret** → set `CLERK_WEBHOOK_SECRET` in Vercel → redeploy

**Stripe webhook:**
1. Stripe dashboard → **Developers → Webhooks → Add endpoint**
2. URL: `https://<your-app>.vercel.app/api/webhooks/stripe`
3. Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
4. Copy the **Signing secret** → set `STRIPE_WEBHOOK_SECRET` in Vercel → redeploy

### 5d. Smoke test the deploy

1. Visit `https://<your-app>.vercel.app/sign-up`, create a test account.
2. Check **Supabase → users table** — you should see a row appear within ~5s. *That confirms Clerk webhook works.*
3. Hit `/pricing`, click **Upgrade**, complete checkout with Stripe test card `4242 4242 4242 4242` (any future date, any CVC).
4. Check **Supabase → users table** — your row's `plan` column should flip to `pro`. *That confirms Stripe webhook works.*
5. Open **Clerk dashboard → your test user → Public metadata** — you should see `{ "plan": "pro" }`. *That confirms the Clerk mirror is working.* If Supabase flipped but Clerk didn't, the Stripe → Clerk sync is failing silently; check Vercel logs for `[stripe webhook] Clerk publicMetadata sync failed`.

---

## ✅ Day 1 done

You now have:
- A typechecked Next.js scaffold deployed to Vercel
- Supabase with the schema, RLS, and pgvector ready
- Clerk handling auth + mirroring users
- Stripe processing test subscriptions
- A `.env.local` for local dev + Vercel envs for prod

The DB is empty — that's Day 2. The scraper subproject in `/scraper` is ready to run as soon as you want to start populating fragrances.

---

## What's next (Day 2)

1. Resolve the affiliate program applications (Q3 in PRD §14) — they have the longest lead time.
2. Run the vision provider spike (Q1) — drop 30 sample bottle photos into a script, compare GPT-4o vs Google Vision accuracy and cost.
3. Start the scraper:
   ```bash
   cd scraper
   npm install
   npx playwright install chromium
   cp .env.example .env
   # fill in NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
   npm run scrape
   ```
   The `discoverUrls()` and `parseHtml()` functions still have `TODO` markers — those are the Day 2 implementation tasks.

---

## Troubleshooting

- **Clerk redirect loops on `/sign-in`** — verify `NEXT_PUBLIC_CLERK_SIGN_IN_URL` and the after-sign-in URLs in `.env.local` match what's in `app/sign-in/[[...sign-in]]/page.tsx`.
- **Supabase queries return `null` even though row exists** — RLS is blocking. Confirm the JWT template `supabase` is set up in Clerk and `auth.jwt() ->> 'sub'` matches `users.clerk_user_id` in the row.
- **`getToken({ template: 'supabase' })` throws "Not Found"** — the JWT template either doesn't exist or isn't named exactly `supabase` (lowercase). The server route in `lib/supabase/server.ts` swallows this error and falls back to anonymous, so public reads still work, but RLS-bound user reads will silently return empty. Recreate the template per Step 2b.5 and sign out + back in.
- **Pro features don't unlock client-side after checkout** — Supabase `users.plan` is correct but Clerk `publicMetadata.plan` hasn't synced. Check Vercel logs for `[stripe webhook] Clerk publicMetadata sync failed`. Worst case the user can sign out + back in to force Clerk to re-pull, but the server-side gating (e.g. `/api/dupes/ai/[id]`) is already correct so they can still hit the feature directly.
- **Stripe webhook returns 400** — the signing secret is wrong (most common) or the request is from `stripe-cli` testing locally without `stripe listen --forward-to`.
- **Vercel build fails on tsc** — locally run `npx tsc --noEmit` first; CI catches what local typecheck catches.
- **"vector type does not exist"** — pgvector extension not enabled. Supabase dashboard → Database → Extensions → toggle `vector`.

# Spritz — Launch Runbook (your-credentials-required steps)

Everything code-side from the audit is done (see `AUDIT_REPORT.md` and the
change list below). These remaining steps need your dashboard logins, in
this order.

## 1. 🚨 Kill the leaked Supabase keys (do this first)

The real service-role key + anon key are in the **committed** version of
`.env.example` (the working-tree copy is already blanked, but git history
and GitHub still have them).

Supabase no longer allows rotating the legacy anon/service_role/JWT
secrets — the migration path IS the revocation path. The leaked values are
the legacy JWT-based API keys, so deactivating legacy keys kills them.

1. Supabase Dashboard → **Settings → API Keys** → tab **Publishable and
   secret API keys** → **Create new API keys**. This adds a
   `sb_publishable_...` and a `sb_secret_...` key alongside the legacy
   ones (which keep working until you deactivate them — no downtime).
2. Update the values in `.env.local` AND Vercel env vars (the variable
   NAMES stay the same, no code change needed):
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → the `sb_publishable_...` key
   - `SUPABASE_SERVICE_ROLE_KEY` → the `sb_secret_...` key
   Also update the scraper's and editorial tooling's env files if they
   hold Supabase keys.
3. Update the Supabase packages first — older supabase-js sends the key as
   an `Authorization: Bearer` JWT, which the new (non-JWT) keys reject:
   ```
   npm i @supabase/supabase-js@latest @supabase/ssr@latest
   ```
4. Deploy, then click through: browse, search, sign in, save to shelf,
   scan. (The app's Clerk-JWT-in-Authorization-header pattern in
   lib/supabase/server.ts is the supported third-party-auth setup and is
   unaffected — the API key rides the `apikey` header.)
5. Back in **Settings → API Keys**, **deactivate the legacy keys**. This
   is the moment the leaked keys die. It's reversible if you find a
   client you missed.
6. Commit the now-clean `.env.example` so HEAD no longer carries secrets:
   ```
   git add .env.example && git commit -m "chore: strip real keys from .env.example"
   git push
   ```
7. Optional cosmetics: scrub history with BFG/git-filter-repo. Step 5
   already made the leaked keys worthless, so this is tidiness, not safety.
8. Do NOT do the separate "JWT signing keys" migration yet: your Clerk →
   Supabase integration signs JWTs with the shared legacy JWT secret
   (the `getToken({ template: "supabase" })` call in
   lib/supabase/server.ts). Revoking that secret breaks the template flow;
   that migration means moving to Clerk's third-party-auth integration
   first. Separate project, not needed to fix the leak.

## 2. Apply the two new DB migrations

```
npx supabase db push
```
- `0017_user_reactions_rls.sql` — closes the open anon-key read/write door
  on user_reactions.
- `0018_search_fragrances_lite.sql` — slim RPC the search endpoint now
  calls. **Search breaks in prod until this is applied**, so push before
  deploying the code.

## 3. OpenAI spend cap

OpenAI dashboard → Settings → Limits → set a monthly budget (e.g. $50) and
an email alert threshold. This is the backstop behind the new
`SCAN_GLOBAL_DAILY_BUDGET` (defaults to 2,000 scans/day; tune in env).

## 4. PostHog

1. Create a (free) PostHog project → copy the project API key.
2. Set in Vercel: `NEXT_PUBLIC_POSTHOG_KEY=phc_...`
   (`NEXT_PUBLIC_POSTHOG_HOST` defaults to https://us.i.posthog.com).
3. Redeploy — pageview capture is automatic, including client-side
   navigations. No key = analytics silently off (dev stays clean).

## 5. Vercel env check

`lib/env.ts` now fails production boots that are missing critical vars.
Confirm these exist in Vercel for Production:
`NEXT_PUBLIC_APP_URL` (your real domain, not localhost),
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`CLERK_SECRET_KEY`, `OPENAI_API_KEY`.

## 6. Local cleanup (fast, do once)

```bash
# Remove the unused Clerk starter app (not referenced by anything)
rmdir /s /q clerk-nextjs

# Untrack any node_modules git picked up before the .gitignore fix
git rm -r --cached editorial/node_modules 2>nul
git rm -r --cached clerk-nextjs 2>nul

# Your node_modules was installed with pnpm (build errors show a .pnpm
# path) but npm is now the package manager of record. Do ONE clean
# reinstall so the lockfile and layout agree:
rmdir /s /q node_modules
npm install

# Verify, then commit everything from this session
npm run typecheck && npm run build
git add -A && git commit -m "perf/seo/security: pre-launch audit fixes"
```

Note: `lib/env.ts` validation is fatal only on Vercel production deploys
(`VERCEL_ENV=production`). Local builds and previews just warn, so a
laptop build against a localhost `.env.local` works fine.

### If `next build` seems to hang

The fragrance pages prerender the top N at build (default 50, was 500).
For fast local builds put `FRAGRANCE_PRERENDER_COUNT=0` in `.env.local`
(don't set it on Vercel — there the default 50 is right). Two other
OneDrive-specific causes:
- Verify the `.next` junction still points off the synced drive:
  `dir .next` should show `<JUNCTION>`; if not, re-run
  `mklink /J .next C:\NextBuilds\spritz-next` (SETUP.md).
- Pause OneDrive sync while building/installing — it fights over
  node_modules and build output. Long-term, the real fix is moving the
  repo out of OneDrive entirely (git is your sync).

## 7. Before flipping the marketing switch

- Run `npm run build` locally and click through: home, a fragrance page,
  scan, search, a house page, a bad URL (should show the new branded 404).
- Share a fragrance URL in an iMessage/Slack to yourself — you should see
  the bottle image card, not the app icon.
- Optional but cheap: eval `SCAN_OCR_MODEL=gpt-4o-mini` + `SCAN_OCR_DETAIL=low`
  on ~20 real bottle photos. If accuracy holds, scans get ~10x cheaper.
- Optional: profile scrolling on a mid-tier Android — if the nav feels
  janky, the LiquidGlass displacement filter is the suspect (see audit M12).

## Deferred (post-launch, tracked in AUDIT_REPORT.md)

- M11: server-render the Shelf tab's initial data
- M13: promote most-added-to-collection tally to an RPC (cached for now)
- 1200×630 branded OG image (current: bottle image on fragrance pages,
  512px icon elsewhere — works, but a designed card would be better)
- Drop unused font weights (Playfair 500/600, Roboto 100)

# Spritz — Pre-Launch Audit Report

**Date:** July 9, 2026
**Scope:** Main Next.js app (`app/`, `components/`, `lib/`, config, Supabase migrations). Scraper, trends-collector, and scripts excluded per request.
**Method:** Three parallel deep audits (security, performance, quality/SEO) reading every file in scope, plus git history checks and a typecheck run.

---

## Verdict

The codebase is in better shape than most pre-launch apps: auth ownership checks are correct, Stripe and Clerk webhook signatures are verified, AI results are cached in the DB so you never pay twice, the bundle is lean, images are handled properly, and accessibility is above average. But there is **one genuine emergency** and a handful of items that will directly undermine a marketing push if not fixed first.

---

## 🚨 CRITICAL — Fix before anything else

### C1. Live Supabase service-role key is committed to git and pushed to GitHub
**File:** `.env.example:11-13`

The "example" env file contains your **real** project URL, real anon key, and the real `SUPABASE_SERVICE_ROLE_KEY`. Verified in committed history (`git cat-file -p HEAD:.env.example`) with remote `github.com/knightjek23/spritz.git`. The service-role key bypasses all RLS — anyone holding it has full read/write/delete on every user, collection, scan, and Stripe customer ID in your database.

**Fix, in order** (updated: Supabase no longer allows rotating legacy keys — the migration to `sb_publishable_`/`sb_secret_` keys is the revocation path):
1. Create new publishable + secret API keys, swap them into env vars, update supabase-js/ssr to latest, then **deactivate the legacy keys** — that's the moment the leaked JWTs die. Full steps in `LAUNCH_RUNBOOK.md` §1.
2. Blank the values in `.env.example` (done in working tree — commit it).
3. History scrubbing (BFG/git-filter-repo) is optional cosmetics after deactivation.

---

## 🔴 HIGH — Launch blockers

### H1. `user_reactions` table has no RLS
**File:** `supabase/migrations/0013_user_reactions.sql`
Every other table enables row-level security; this one (added later) was missed. With the anon key public by design (and also leaked per C1), anyone can dump or modify every user's like/dislike history via Supabase's auto REST API — no auth needed.
**Fix:** one-line migration: `alter table public.user_reactions enable row level security;` Then audit the dashboard for any tables created outside migrations.

### H2. Home page is fully dynamic — your marketing landing page does 30–50 DB calls per anonymous visitor
**File:** `app/page.tsx:23-33`
`export const revalidate = 60` is silently ignored because `auth()` opts the route into per-request rendering. Every anonymous hit SSRs `MarketingHome` including the trending N+1 (see H3). Landing TTFB is likely 800ms–2s+ instead of ~50ms edge-cached — on the exact page your campaign traffic lands on.
**Fix:** move the signed-in/anonymous branch to middleware (session-cookie rewrite), or minimum-viable: wrap the marketing data sections in `unstable_cache(..., { revalidate: 300 })`.

### H3. Trending join fires up to ~48 fuzzy-search RPCs per home render
**File:** `lib/trending/join.ts:39-61`
Each trending entry without a URL match runs its own trigram `search_fragrances` RPC. Combined with H2, this runs per pageview.
**Fix (best):** resolve `fragranceId` once in the weekly collector job and commit it into `data/trending-*.json`. Alternative: wrap `joinTrendingToCatalog` in `unstable_cache` keyed on the feed's `generated_at`.

### H4. `/fragrance/[id]` — your core SEO surface — is force-dynamic AND has no per-page metadata
**File:** `app/fragrance/[id]/page.tsx:32`
Thousands of fragrance pages: (a) re-render server-side on every request (slow TTFB for users and crawlers) just to hydrate the Own/Tried/Wishlist buttons, and (b) all ship the identical generic title "Spritz: know what you're wearing" — Google sees 10k duplicate-title pages, and social shares show a generic card. House/note/family pages already do this right; the highest-value page type doesn't.
**Fix (one change unlocks both):** switch to ISR (`revalidate = 3600`) + `generateStaticParams` for the top ~500 by popularity, fetch save-state client-side inside `SaveButton` after hydration, and add `generateMetadata` (`"${name} by ${house} — notes, longevity, dupes · Spritz"` + bottle image OG). Add JSON-LD `Product` + `BreadcrumbList` while you're in the file.

### H5. Scan API can burn uncapped OpenAI money; rate limiter fails open
**Files:** `app/api/scan/route.ts`, `lib/rate-limit.ts:43-46`
`/api/scan` is public by design (fine for the funnel), each scan costs ~$0.01–0.05 in OpenAI calls, but: the limiter **fails open** on any DB error, IP comes from client-influenceable `x-forwarded-for` (safe on Vercel only), and there's no global daily budget.
**Fix:** fail closed for anonymous requests on DB error; add a global daily scan cap (count today's `scan_events`, hard-stop at N); set a spend limit in the OpenAI dashboard as backstop.

### H6. Scan failures show users raw errors on your flagship feature
**Files:** `app/api/scan/route.ts:81+`, `app/scan/page.tsx:49-67`
No top-level try/catch around the OpenAI calls. An OpenAI hiccup → bodyless 500 → client shows `Couldn't scan: SyntaxError: Unexpected end of JSON input`. Also no `app/error.tsx` or `app/not-found.tsx` anywhere — server errors and dead links hit unbranded Next defaults.
**Fix:** try/catch the route returning `{ error: "scan_failed" }`; map error codes to human copy client-side; add branded root `error.tsx` + `not-found.tsx` (the `NoteNotFound` component in `note/[slug]/page.tsx` is a ready-made template) and a `loading.tsx` for fragrance pages.

### H7. No analytics at all
PostHog env vars are scaffolded in `.env.example` but zero analytics code exists. You cannot measure landing → sign-up → scan conversion during a marketing campaign.
**Fix:** wire PostHog (or minimum `@vercel/analytics`) in `app/layout.tsx` before launch day.

### H8. Root metadata gaps: no `metadataBase`, no title template, OG image is a 512px app icon
**File:** `app/layout.tsx:26-54`
Social shares of any page render as an app-stub card; OG URLs can resolve to the wrong host once a custom domain is live.
**Fix:** `metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL!)`, title template `"%s · Spritz"`, a real 1200×630 OG image, `twitter.card: "summary_large_image"`.

### H9. Dual lockfiles: both `package-lock.json` and `pnpm-lock.yaml` at root
Nondeterministic installs and Vercel package-manager detection.
**Fix:** keep `package-lock.json` (README says npm), delete `pnpm-lock.yaml`, gitignore the other.

---

## 🟡 MEDIUM

| # | Issue | File | Fix |
|---|---|---|---|
| M1 | Scan image body: no max size / base64 validation (min only). Vercel's 4.5MB cap saves you today; nothing does off-Vercel. Note: `bodySizeLimit: "10mb"` only applies to Server Actions, not this route handler | `app/api/scan/route.ts:28-30` | `z.string().min(100).max(8_000_000).regex(/^[A-Za-z0-9+/=]+$/)` |
| M2 | `/api/search` + `/api/scan/[id]/report` are unauthenticated with zero rate limiting (DB DoS + catalog-signal poisoning) | both routes | apply the IP limiter to both |
| M3 | Autocomplete returns 20 **complete** fragrance rows (all notes, editorial, dupes jsonb) per keystroke — can be 50–200KB of JSON; dropdown uses 6 fields | `app/api/search/route.ts`, migration 0004 | add a `search_fragrances_lite` RPC + `Cache-Control: s-maxage=3600` on the response |
| M4 | Scan OCR uses full `gpt-4o` at default (high) image detail — ~10x more expensive than needed for reading a label | `lib/vision.ts:30-46` | eval `gpt-4o-mini` + `detail: "low"` for the first pass; keep gpt-4o for disambiguation |
| M5 | `/encyclopedia` has no revalidate → statically frozen at build; "Trending this week" never updates until redeploy | `app/encyclopedia/page.tsx` | `export const revalidate = 3600` |
| M6 | House alias URLs render content with title "House not found · Spritz" — `generateMetadata` skips slug canonicalization the page body performs; no `alternates.canonical` anywhere (duplicate-content risk) | `app/house/[slug]/page.tsx:27-38` | canonicalize inside `generateMetadata`; add canonicals to fragrance/note/family too |
| M7 | No JSON-LD structured data anywhere — cheapest rich-result win for an encyclopedia product | `app/fragrance/[id]/page.tsx` | inject `Product` + `BreadcrumbList` scripts |
| M8 | `robots.ts`/`sitemap.ts` silently fall back to `http://localhost:3000` if `NEXT_PUBLIC_APP_URL` unset — would kill indexing invisibly. No env validation module exists | `app/robots.ts:9`, `app/sitemap.ts:21` | add `lib/env.ts` with zod; throw in prod when required vars missing |
| M9 | `userScalable: false, maximumScale: 1` blocks pinch-zoom (WCAG 1.4.4 fail, Lighthouse ding) | `app/layout.tsx:56-62` | remove both |
| M10 | `/scan`, `/search`, `/pricing`, `/account`, `/collection`, `/welcome` export no metadata → duplicate titles in Search Console | each page | one-line `export const metadata` each |
| M11 | Shelf tab is fully client-rendered: HTML shell → JS → Clerk → fetch, three sequential legs before content | `app/collection/page.tsx` | server page passes `initialItems` into the client tab component |
| M12 | LiquidGlass: backdrop blur + SVG `feDisplacementMap` on both fixed bars — likely scroll jank on mid/low-end Android | `components/liquid-glass/LiquidGlass.tsx:242-248` | profile on a mid-tier Android; drop the displacement filter (keep blur+tint) via feature query if janky |
| M13 | `getMostAddedToCollection` pulls up to 5,000 rows to count in memory, per signed-in home view | `lib/trending/db-trending.ts:73-95` | promote to an RPC or `unstable_cache({ revalidate: 900 })` |
| M14 | Stripe webhook branches on `(event.data.object as any).subscription` — entitlement-correctness fragility (not forgeable; signatures verified) | `app/api/webhooks/stripe/route.ts:103-110` | switch explicitly on `event.type` |
| M15 | Repo hygiene: `clerk-nextjs/` (entire unused starter app), `editorial/node_modules` not gitignored (editorial content itself IS load-bearing — don't delete), `Spritz_User_Test_Protocol 2.md` OneDrive dupe, README describes the old visual identity (Clash Display/Electric Blue vs actual Playfair/emerald), `.env.example` still says "Cologne Scan App" | root | delete starter + dupe, add `editorial/node_modules` to `.gitignore` + `git rm -r --cached`, refresh README |

---

## 🟢 LOW

- **Dead code:** `components/trending-tiktok-section.tsx` imported by nothing — delete or wire up.
- **Fonts:** 8 font files loaded (Playfair 400/500/600/700 + Roboto 100/300/400/500); audit and drop unused weights.
- **`robots.ts`** doesn't disallow `/account` or `/welcome` (thin, user-specific pages).
- **Image `remotePatterns`** wildcard `*.supabase.co` — tighten to your project subdomain.
- **`lib/rate-limit.ts`** stale comment ("in-memory" — it's DB-backed, which is better) and stale `"cologne-scan-app"` salt name.
- **Search input** lacks an accessible label; focus indicator is border-color-only.
- **Missing classic `/favicon.ico`** (404 noise from old crawlers).
- **Note page** alias loop awaits RPCs serially — `Promise.all` if you ever care (amortized by ISR).
- **Deps:** `next@14.2.33` includes the middleware-bypass CVE fix; Clerk/Stripe/OpenAI each one major behind but stable. Run `npm audit` locally to confirm.

---

## ✅ What's already good (no action)

- Auth ownership checks correct everywhere it matters (collection deletes scoped to user; Stripe customer resolved from authenticated user; price IDs from a server-side map — not forgeable).
- Both webhook signature verifications (Stripe `constructEvent`, Clerk svix) implemented correctly.
- AI consensus/dupes results persisted to the DB — each fragrance pays for AI exactly once, ever. Right model (`gpt-4o-mini`), JSON mode, capped tokens.
- `.env.local` properly gitignored and never committed; no hardcoded keys in source (the leak is only in `.env.example`).
- Lean bundle: no heavy client deps, no SDK leaks into client components, no barrel imports.
- `next/image` used consistently with correct `sizes`/`priority`; the one raw `<img>` (camera blob preview) is correct.
- Search autocomplete client: textbook debounce + AbortController + stale-guard; full ARIA combobox pattern.
- Sitemap is complete and well-prioritized (all fragrances, 213 notes, 20 houses).
- House/note/family pages: proper ISR + `generateStaticParams` + `generateMetadata`.
- No `console.log` in production paths, no ts-ignore, minimal `any`.
- PWA assets complete (manifest, maskable icons, apple-touch-icon).

---

## Verification

- **Typecheck:** could not complete in this sandbox — OneDrive hydrates `node_modules` files on demand through the mount and `tsc` didn't finish in ~16 minutes. Last successful local typecheck evidence is `tsconfig.tsbuildinfo` from Jul 5; eight source files were touched after it (`app/family/[slug]`, `app/house/[slug]`, `globals.css`, and five trending/scroller components). **Run `npm run typecheck` and `npm run build` locally to confirm clean.**

---

## Recommended fix order

**Today (before any marketing goes out):**
1. C1 — rotate Supabase keys, blank `.env.example`
2. H1 — RLS migration for `user_reactions`
3. H5 — fail-closed rate limiter + global scan budget + OpenAI spend cap

**This week (the marketing-effectiveness batch):**
4. H4 — fragrance page: ISR + `generateMetadata` + JSON-LD (one PR, biggest SEO win in the repo)
5. H2 + H3 — cacheable home page + trending N+1 fix (landing page speed)
6. H8 + M10 + M6 — metadataBase, OG image, per-page titles, canonicals
7. H6 — error boundaries + scan error handling
8. H7 — analytics
9. H9 + M15 — lockfile + repo hygiene sweep

**Next sprint:**
10. M1–M5, M11–M13 (validation, search payload, vision cost, shelf SSR, LiquidGlass profiling)

Estimated effort: items 1–3 are under an hour combined. Items 4–9 are roughly two to three focused days. The app is close — the emergency is the key leak, and the biggest missed opportunity is that the encyclopedia's SEO thesis (thousands of indexable fragrance pages) is currently unrealized.

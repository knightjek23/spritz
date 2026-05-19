# Spritz — v1 PRD

**Owner:** Josh
**Status:** Draft v1 — pending review
**Last updated:** April 22, 2026
**Source:** `cologne_scan_app_braindump.pdf` (April 2026), repositioned April 22, 2026
**Build window:** ~2 weeks
**Workspace:** `/Fragrance APP/`

---

## 1. Problem Statement

Fragrance enthusiasts on TikTok ("FragTok"), r/fragrance (1M+ members), and the broader scent community spend a surprising amount of time on a single repeated workflow: **picking up a bottle and trying to figure out what it actually is**. What's in it. How long it lasts. Who made it. When to wear it. Whether the hype is real. Today they screenshot the bottle, type the name into Fragrantica's clunky web UI, scroll past ads, and stitch together perfumer credits, longevity scores, brand history, and community reviews from 4–5 different tabs. The workflow is mobile-hostile, multi-app, and slow.

Spritz collapses that into one action: **point camera → know the bottle**. Not "here's a cheaper one to buy instead" — *here's everything worth knowing about the one in your hand.* The notes pyramid, who composed it, the house's story, longevity and sillage from the community, the seasons and occasions it shines in, how to wear it well.

The opportunity is large because (a) the audience is enormous and high-intent, (b) Fragrantica is the only real reference and is functionally a desktop wiki with no mobile/scan UX, and (c) doing this *well* — designed beautifully, fast to read, organized for the moment of curiosity — is a moat that's about presentation quality, not catalog size.

Not solving it leaves the obvious utility play on the table for a competitor with worse positioning.

---

## 2. Goals

1. **Ship a working v1 in ~14 days** — scan, save, learn, with a real (not stubbed) backend powered by a 10,000-fragrance Supabase DB.
2. **Validate the encyclopedia loop** — measured by % of users who complete scan → read detail page → save in their first session (target: 40%+ activation).
3. **Make the detail page the shareable moment** — 25%+ of detail pages screenshotted or shared (proxy for organic acquisition). The notes-pyramid card is the new dupe-comparison.
4. **Convert utility into revenue** — 5% free-to-Pro conversion within 30 days; affiliate clickthrough on 10%+ of detail pages (Buy CTA goes to the *scanned* fragrance, not alternatives).
5. **Achieve scan accuracy good enough to trust** — top-1 fragrance identified correctly on 85%+ of well-lit bottle photos in the top-10,000 catalog.

---

## 3. Non-Goals

1. **Spritz is not a dupe-finder app.** Similar fragrances are a discovery feature buried inside the detail page — not a headline. The product does not push users to buy alternatives to the bottle they're holding. Price-delta framing is removed entirely.
2. **No social layer in v1** — no comments, no following, no public collections, no feed. Deferred to v2.
3. **No taste profile / personalized recommendations in v1** — requires meaningful collection data that doesn't exist yet at launch.
4. **No Android-specific or native iOS app in v1** — ship as a mobile-web PWA via Next.js.
5. **No exhaustive catalog** — top 10,000 fragrances by popularity covers ~95% of what people own. Long-tail filled reactively.
6. **No public-facing scraper or data attribution** — Fragrantica is the bootstrap source. Scraper stays private, no credit in UI, data layer must be swappable.
7. **No multi-bottle / shelf scan** — one bottle per scan in v1.

---

## 4. Target Users & Personas

### Primary: The Active Collector ("Marcus, 24")
Owns 8–25 bottles. Watches FragTok daily. Posts in r/fragrance. **Core need:** stop tab-juggling between Fragrantica, Reddit, and YouTube to figure out a bottle he's looking at — get all of it, beautifully presented, in one tap.

### Secondary: The Curious Buyer ("Sarah, 31")
Owns 2–5 bottles. Discovered fragrance through TikTok. Doesn't know notes vocabulary. **Core need:** "Is this one good and would I like it?" Wants community-validated longevity/sillage scores, plus context that helps her *learn* (what's a chypre, why do people love this perfumer, when do you wear something like this).

### Tertiary: The Discoverer ("Devon, 19")
Doesn't own bottles, follows fragrance content. Comments on every TikTok asking about the bottle being shown. Budget-aware but curious. **Core need:** scan a bottle from a video, learn what it actually is, build a wishlist of things he wants to try someday. Powerful organic acquisition channel via screenshots of beautifully-rendered detail pages.

---

## 5. User Stories

### Scan & Identify
- As Marcus, I want to point my camera at any bottle and see its full profile in under 5 seconds so I don't have to type the name into Fragrantica.
- As Sarah, I want to scan a bottle in a store and immediately see longevity, sillage, what notes are in it, and who made it so I can decide if I want to try it.
- As any user, I want a manual search fallback when the scan fails so the app never feels broken.
- As any user, when a scan fails I want a clear next-best-action (search by name, retry with better light, report missing fragrance) instead of a dead end.

### Learn (the new core)
- As Sarah, I want to read who composed the fragrance and a short history of the house so I understand the context, not just the chemistry.
- As Marcus, I want to see what each note actually smells like (e.g., "bergamot — bright, sharp, like Earl Grey tea") so I can read a notes pyramid I haven't seen before.
- As any user, I want guidance on when this fragrance shines — season, time of day, occasion — so I know whether to buy it, wear it tonight, or save it for fall.
- As any user, I want longevity and sillage shown with confidence — not a flat number — so I know if "8 hours" means "everyone agrees" or "results vary wildly."

### Collection
- As Marcus, I want to save scanned bottles to **Own**, **Tried**, or **Wishlist** with one tap.
- As Marcus, I want to view my collection grouped by status, sorted by date added.
- As Devon, I want to build a wishlist without owning anything so I can plan what to try.

### Discovery (de-emphasized similar-fragrance feature)
- As Marcus, I want an *opt-in* "Similar fragrances" section at the bottom of the detail page so I can explore the family once I've already learned about the bottle in my hand. Framed as "If you like this, you might also enjoy" — never as "buy this instead."
- As any user, similar fragrances do not show price comparisons in v1. They link to other fragrance detail pages so the *learning* loop continues.

### Buy
- As any user, I want a single Buy CTA that takes me to the *scanned* fragrance at a real retailer — never to a substitute. The act of scanning signals interest; the right business model is supporting that interest, not redirecting it.

### Pro Upgrade
- As Marcus, I want to upgrade to Pro to unlock the full encyclopedia: deeper perfumer notes, expanded brand history, every note's flavor profile, and unlimited collection slots.

---

## 6. Requirements

### P0 — Must Have (cannot ship without these)

| # | Requirement | Acceptance Criteria |
|---|---|---|
| P0.1 | **Bottle scan via camera** | Given a user taps "Scan", when they point at a bottle and capture, then within 5s they see either (a) the matched fragrance detail page or (b) a "couldn't identify" state with manual search fallback. Top-1 accuracy ≥85% on well-lit photos in the top-10k catalog. |
| P0.2 | **Two-layer scan architecture** | Layer 1: GPT-4o vision (or Google Vision API) extracts brand + name from the label as text. Layer 2: text query hits Supabase, returns the fragrance row. Pure shape recognition is explicitly NOT used. |
| P0.3 | **Encyclopedia detail page** | Renders, in this priority order: name + house + year, notes pyramid (top/mid/base with weights), longevity + sillage (with confidence ranges), season/time-of-day guidance, perfumer credit, house history (~100 words), notes glossary (each note's flavor profile available on tap), Save CTA, Buy CTA (to *this* fragrance). Collapsed "Similar fragrances" section at the bottom. |
| P0.4 | **Collection (Own / Tried / Wishlist)** | One-tap save from any detail page. Three-tab collection view. Free tier capped at 25 total saves; Pro unlimited. Edit/delete works. Sort by date added. |
| P0.5 | **Similar fragrances (opt-in section)** | Bottom of detail page, collapsed by default. When opened: shows top-N similar fragrances by note-vector + family overlap. NO price-delta. NO "cheaper alternative" framing. Header reads "If you like this, explore." Free tier shows 5; Pro shows 25. |
| P0.6 | **Manual search fallback** | Search bar accessible from home and from any failed-scan state. Searches name + house, returns ranked list. |
| P0.7 | **Affiliate buy links (scanned fragrance only)** | Every fragrance page has a "Buy" CTA. Routes to Scentbird, FragranceNet, or Nordstrom (whichever has the *scanned* bottle in stock at best price) with affiliate tags appended. Click logged. NO buy CTAs on similar-fragrance items in v1. |
| P0.8 | **Auth (Clerk)** | Email + Apple/Google SSO. Required to save anything; scan + view detail works anonymously. |
| P0.9 | **Pro tier ($4.99/mo via Stripe)** | Pro unlocks: unlimited collection, deep encyclopedia content (perfumer interviews, full house history, every note's flavor profile), expanded similar-fragrance results (25 vs 5), wishlist sale alerts. |
| P0.10 | **Mobile-first responsive PWA** | Optimized for portrait phone viewport. Camera scan works on iOS Safari and Chrome Android. |
| P0.11 | **Bootstrap DB: top 10,000 fragrances** | Playwright scraper → raw HTML stored separately → Supabase. Schema per Section 9. Scraper rotates UAs, randomizes 2–5s delays, runs from residential IP. NOT public-facing. NO Fragrantica attribution in app UI. ~10–14 hours total scrape time at safe pacing — Days 2–3. |

### P1 — Nice to Have (fast follow after launch)

- **Collection notes** — free-text per saved fragrance ("good for date night", "scratchy on me").
- **Scan history** — list of every scan attempt, including failures, so users can return to a bottle they didn't save.
- **Shareable detail card** — pre-formatted screenshot-ready card optimized for Instagram/TikTok. Notes pyramid + name + house, with the Spritz watermark. Drives organic acquisition.
- **Push notifications** — opt-in for "your wishlisted bottle is on sale at [retailer]."
- **Empty-state UX polish** — first-launch tutorial, sample scans.
- **Wear log (precursor to journal)** — "I wore this today" tap from the detail page; populates a simple history.

### P2 — Future Considerations (design v1 to not block these)

- **Personal scent journal** — long-form longitudinal logging of how each fragrance performs *on you* (your longevity, your sillage, your mood/occasion notes). Big v2 feature.
- **Taste profile + personalized recommendations** (v2) — requires preserving full collection event history.
- **Social layer** — public collections, follows, comments. Schema should rough out user profile bones.
- **Multi-bottle scan** — shelf/lineup scan that returns multiple matches.
- **Native iOS / Android apps** — PWA in v1.
- **Indie / niche / vintage catalog expansion** — schema must support fragrances not on Fragrantica.
- **Brand partnerships** — data layer swappable.
- **Editorial / educational content** — "Understanding chypres", "Reading a notes pyramid", "Intro to oud" — leans into the encyclopedia positioning.

---

## 7. Scan Architecture (technical detail for P0.1 / P0.2)

```
[Camera capture] → [POST /api/scan with base64 image]
   ↓
[Layer 1: Vision]  GPT-4o vision OR Google Vision API
   "Read the brand and fragrance name from this bottle label.
    Return JSON: { brand: string, name: string, confidence: 0-1 }"
   ↓
[Layer 2: Lookup]  Fuzzy text match against Supabase
   - Exact match on (brand, name) → return row
   - Trigram/levenshtein fallback for OCR errors → return ranked candidates
   - Confidence threshold: top match ≥0.7 → auto-select; else → show top 3 picker
   ↓
[Response]  fragrance_id (or null) + candidates[] + confidence
   ↓
[Frontend]  Route to /fragrance/[id] or render disambiguation picker
```

**Decision: GPT-4o vs. Google Vision** — Spike both in Day 3. GPT-4o more flexible (~$0.01/call), Google Vision cheaper (~$0.0015). At scale, batch with Google and reserve GPT-4o for low-confidence retries.

**Rate limiting** — anonymous: 10 scans/day per IP; signed-in free: 50/day; Pro: unlimited.

---

## 8. Similarity Engine (powers the opt-in "Similar fragrances" section)

> **Note:** The engine that originally drove the "dupe finder" still powers the new "Similar fragrances" surface. The math doesn't change — the framing and placement do. Price comparisons are removed. Tier filtering is removed. The header is "If you like this, explore" instead of "Cheaper alternatives." This section is collapsed by default on the detail page so users learn about the scanned bottle *first*.

**Inputs (per fragrance):**
- `note_vector`: weighted vector across canonical note dictionary (~500 notes). Weight = community vote count, normalized.
- `family_tags`: ["woody", "amber"], etc.
- `gender`, `season_tags`

**Similarity score:**
```
score(A, B) = 0.70 * cosine(note_vector_A, note_vector_B)
            + 0.20 * jaccard(family_tags_A, family_tags_B)
            + 0.10 * jaccard(season_tags_A, season_tags_B)
```

**Ranking:**
1. Compute `score` for all DB rows where `id != A.id`
2. Filter: gender compatibility (or "unisex either way")
3. Sort by `score` desc
4. Top-N (5 free / 25 Pro) returned

**Display (revised):**
- Similarity % shown subtly (`72% match` in muted text, not as the headline)
- "Shares notes with this" — top 3 shared notes by combined weight (this is the educational hook)
- Tap → goes to that fragrance's detail page (continues the learning loop)
- NO price delta. NO Buy CTA on similar items.

**Performance:** Pre-compute pairwise scores nightly into `dupe_pairs` table. At 10k × 10k = 100M pairs, store top-50 per fragrance (~500k rows). Recompute when DB grows ±10%. Table is staying named `dupe_pairs` for now — internal name only, not user-facing.

---

## 9. Data Model

### `fragrances`
```
id                  uuid primary key
name                text not null
house               text not null
family              text[]
gender              text  -- 'masculine' | 'feminine' | 'unisex'
year                int
top_notes           jsonb  -- [{name: 'bergamot', weight: 0.8}, ...]
mid_notes           jsonb
base_notes          jsonb
note_vector         vector(500)  -- pgvector for cosine similarity
longevity_score     real
longevity_confidence real -- 0–1, how tight the community vote spread is
sillage_score       real
sillage_confidence  real
season_tags         text[]
time_tags           text[]
similar_ids         uuid[]
fragrantica_url     text  -- internal only, never exposed in UI

-- Encyclopedia content (NEW, drives the new positioning)
perfumer            text       -- "Francis Kurkdjian", "Sophia Grojsman", etc.
house_history       text       -- ~100-word brand story
wear_guidance       jsonb      -- {occasions: [...], how_to_wear: "...", layering_notes: "..."}
notes_descriptions  jsonb      -- {note_name: "what it smells like, in one sentence"}
bottle_image_url    text       -- canonical product shot for hero
editorial_notes     text       -- optional curator commentary (Pro-gated rendering)

avg_retail_price    numeric
price_tier          text       -- still scraped, used internally for affiliate routing
popularity_rank     int
created_at          timestamptz
updated_at          timestamptz
```

### `users` (Clerk-managed identity, plus app-level row)
```
id              uuid primary key  -- mirrors Clerk user id
email           text
plan            text  -- 'free' | 'pro'
stripe_customer_id text
created_at      timestamptz
```

### `collection_items`
```
id              uuid primary key
user_id         uuid references users(id)
fragrance_id    uuid references fragrances(id)
status          text  -- 'own' | 'tried' | 'wishlist'
note            text  -- P1, nullable
added_at        timestamptz
unique (user_id, fragrance_id, status)
```

### `scan_events`
```
id              uuid primary key
user_id         uuid nullable
ip_hash         text
image_url       text
detected_brand  text
detected_name   text
matched_fragrance_id uuid nullable
confidence      float
vision_provider text  -- 'gpt4o' | 'google'
latency_ms      int
created_at      timestamptz
```

### `affiliate_clicks`
```
id              uuid primary key
user_id         uuid nullable
fragrance_id    uuid
retailer        text
clicked_at      timestamptz
```

### `dupe_pairs` (internal name; surfaced as "Similar fragrances")
```
fragrance_a     uuid
fragrance_b     uuid
score           float
shared_notes    jsonb
primary key (fragrance_a, fragrance_b)
index on (fragrance_a, score desc)
```

---

## 10. Stack

| Layer | Tool | Notes |
|---|---|---|
| Frontend | Next.js 14 (App Router) | PWA. Camera via `<input capture="environment">` + `getUserMedia()`. |
| Backend / DB | Supabase | Postgres + `pgvector`. RLS on user data. |
| Auth | Clerk | Email + Apple SSO + Google SSO. Webhooks → Supabase user sync. |
| Payments | Stripe | Checkout + webhooks → update `users.plan`. |
| Hosting | Vercel | Edge functions for `/api/scan`. |
| Vision / Scan | GPT-4o vision (primary) + Google Vision (cost fallback) | Day 3 spike picks default. |
| Scraper | Playwright (Node) | Runs locally / private VPS, NEVER on Vercel. |
| Storage | Supabase Storage | Scan images, retained 30d. |

---

## 11. Visual Direction

Per the `/design-styles-2026` Consumer / Startup combo:

- **Type:** Clash Display (display/headers) + Inter (body/UI). Variable fonts.
- **Base:** Cloud Dancer `#F0EEE9` (not stark white).
- **Type colors:** Ink `#2C2C2A` (primary) + Slate UI `#78766F` (secondary).
- **Accents:** Electric Blue `#0057FF` (primary CTAs, links, brand) + Acid Yellow `#D4FF00` (highlights, badges, "saved" confirmations).
- **Surface:** Warm paper `#D8D6D0` for cards/elevated surfaces.
- **Status:** Vivid teal `#00D4AA` (success), Neon coral `#FF4D6D` (error/destructive).
- **Mono accent:** JetBrains Mono for metadata (vintage years, scan IDs, scientific note names).

The detail page is the visual hero. Notes pyramid renders large, with each note as a tappable chip that expands into the note's flavor description (the encyclopedia loop). Glassmorphism is reserved for one place: the hero bottle image card on the detail page. Everywhere else: clean neutral surfaces, bold accents, strong typographic hierarchy.

---

## 12. Revenue Model

| Tier | Price | What's Included |
|---|---|---|
| **Free** | $0 | Unlimited scans (rate-limited), basic detail page (notes pyramid, longevity/sillage, season/occasion tags), collection up to 25 items, 5 similar-fragrance results |
| **Pro** | $4.99/mo or $39/yr | **Deep encyclopedia content** (perfumer credits, full house history, every-note flavor descriptions, editorial commentary), unlimited collection, expanded similar-fragrance results (25 vs 5), wishlist sale alerts, priority scan queue |
| **Affiliate** | n/a | Buy links on detail pages → routes to *the scanned fragrance* at Scentbird / FragranceNet / Nordstrom |

**Revenue logic (revised):** Free tier shows enough to be genuinely useful — that's the trial. Pro paywalls the *depth*: the perfumer story, the brand history, what each note actually smells like. The bet is that the people who care enough to scan a bottle a second time care enough to want the full encyclopedia. Affiliate revenue is supportive, not central — and routes to the actual bottle the user expressed intent in, not a substitute.

---

## 13. Success Metrics

### Leading Indicators (week 1–4 post-launch)
| Metric | Target | How measured |
|---|---|---|
| Scan attempt → successful match rate | ≥85% on top-10k catalog | `scan_events` where `matched_fragrance_id IS NOT NULL` |
| First-session activation (scan → read detail → save) | ≥40% of new users | Funnel in PostHog |
| Median time on detail page | ≥45s | Page-time analytics (read-not-skim signal) |
| Encyclopedia interaction rate | ≥30% of detail views | Note chip taps, "house history" expansion, wear-guidance taps |
| Detail page → "Buy this" clickthrough | ≥10% | `affiliate_clicks` / detail-page views |
| Manual search fallback usage | ≤25% of total lookups | Search vs. scan event ratio |
| Median scan latency | ≤5.0s end-to-end | `scan_events.latency_ms` p50 |

### Lagging Indicators (month 1–3)
| Metric | Target | How measured |
|---|---|---|
| Free → Pro conversion | ≥5% within 30 days of signup | Stripe + Clerk join |
| Day-7 retention | ≥35% | Cohort analysis |
| Day-30 retention | ≥18% | Cohort analysis |
| Avg saved fragrances per active user | ≥4 | Collection items / WAU |
| Avg detail-page shares | ≥0.3/user/week | Share button events (P1) |
| Affiliate revenue per active user | ≥$0.30/mo | Lower than dupe-driven model — accept the tradeoff |
| Organic acquisition (TikTok/Reddit referrals) | ≥30% of new signups | Referrer header on signup |

### Kill Criteria (re-scope if hit)
- Scan accuracy <60% after vision tuning → pivot to manual-search-first UX
- Pro conversion <1.5% after 60 days → re-evaluate paywall (move encyclopedia content free, paywall something else like wear-log/journal)
- Day-7 retention <15% → loop isn't sticky, rethink before v2
- Detail-page time <20s → users aren't actually reading the encyclopedia content; positioning isn't working

---

## 14. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Encyclopedia content is thin without dupe engine carrying load | **High (new)** | Day 2-3 must include perfumer + house-history scraping passes. Pro paywall depends on depth. |
| Fragrantica blocks scraper IP | High | Residential IP, rotating UAs, randomized delays, scrape alphabetically by house. Store raw HTML. |
| Fragrantica sends C&D | Medium | Scraper not public, no UI attribution, ready to swap source. Frame as "community-bootstrapped DB." |
| Perfumer / brand history coverage isn't 100% of catalog | Medium | Tier the encyclopedia: notes pyramid + scores cover 100% of catalog (P0 minimum). Perfumer + history cover top 2k by popularity at launch, expand reactively. |
| GPT-4o vision costs spike | Medium | Per-tier rate limits. Google Vision fallback. Cache scan results by image hash. |
| Scan accuracy below 85% | High | Two-vendor spike Day 3. Manual search fallback always one tap away. Disambiguation picker for low-confidence. |
| Camera UX broken on iOS Safari | Medium | Test on actual iPhone Day 5. Fall back to "upload photo" if `getUserMedia` blocked. |
| Affiliate programs reject application | Medium | Apply to all 3 Day 1 — approval is the gating item. |
| 10,000 fragrances still misses niche/indie/vintage | Low | "Missing? Request it" CTA on failed scans. |
| FragTok virality without the dupe hook | **Medium (new)** | Bet: a beautifully-rendered notes pyramid screenshot is *more* shareable than a price-comparison list. Validate via P1 share-card feature within 30 days of launch; iterate if shares are <0.1/user/week. |
| **Longevity / sillage / season tags missing in v1** | Low | **Resolved by deferral (May 2026):** Fragrantica renders these via Vue components hydrated from inline JSON props — capturing them requires either (a) parsing every `:perfume-votes` attribute on each page and computing aggregates ourselves, or (b) intercepting Vue hydration. Both are ~6h+ of additional engineering, not justified for v1 since the detail page is meaningful without them. Punted to v2. |

---

## 15. Open Questions

| # | Question | Owner | Status |
|---|---|---|---|
| ~~Q1~~ | ~~GPT-4o vs. Google Vision~~ | Engineering | **Resolved:** GPT-4o for the v1 cohort, sufficient accuracy at observed cost. |
| Q2 | Where does perfumer + house history come from? Wikipedia? Curated? AI-generated and human-reviewed? | Engineering / Editorial | Partial: perfumer comes from Fragrantica when credited; house history + per-fragrance editorial is original work in `/editorial`. Approach validated; needs ongoing content production. |
| ~~Q3~~ | ~~Where does `avg_retail_price` come from?~~ | Engineering | **Punted:** Internal routing field only, not user-facing. Defer until affiliate integration needs it. |
| ~~Q4~~ | ~~Affiliate program approval timeline~~ | Josh | **In progress:** applications submitted; approvals tracked outside PRD. |
| Q5 | Annual Pro pricing — $39/yr (35% discount) or $49/yr (18% discount)? | Josh | Non-blocking, A/B post-launch |
| Q6 | Free tier collection cap — 25 right? Or 10 to push conversion harder? | Josh | Non-blocking |
| ~~Q7~~ | ~~Camera permission UX~~ | Design | **Resolved:** request on first scan attempt. |
| ~~Q8~~ | ~~On-demand scrape or log-only for missing fragrances?~~ | Engineering | **Resolved:** log-only for v1. |
| Q9 | Do we need ToS / Privacy Policy at launch? | Legal/Josh | Blocking before public launch |
| Q10 | Analytics tool — PostHog, Mixpanel, or Supabase + custom? | Engineering | Default PostHog free tier |
| Q11 | What's the actual shareable artifact? Notes pyramid? "How to wear it"? Perfumer + bottle image? | Design / Josh | Non-blocking but shapes virality |
| Q12 (NEW) | When and how do we capture longevity / sillage / season tags? | Engineering (v2) | **Punted to v2.** Vue prop parsing approach scoped (~6h work + 4h re-scrape). Revisit when v1 metrics indicate users actually want this on the detail page. |

---

## 16. Build Plan (revised from braindump, with checkpoints)

| Day | Task | Output / Checkpoint |
|---|---|---|
| **Day 1** | Repo scaffold (Next.js + Supabase + Clerk + Stripe + Vercel). Apply to affiliate programs. | App deploys hello-world to Vercel. Affiliate apps submitted. |
| **Day 2** | Playwright scraper + parser. Scrape top 10k for notes/scores. Schema migration with encyclopedia fields. | First 1k fragrances in Supabase. Schema locked. |
| **Day 3** | Vision spike (GPT-4o vs Google). Build `/api/scan`. **Encyclopedia content scrape pass** — perfumer + house history for top 2k. | Q1 resolved. `/api/scan` returns matches. Pro content has real material. |
| **Day 4** | `/api/search` (manual fallback). Fuzzy match, trigram. | Manual search works end-to-end. |
| **Day 5** | Similarity engine (formerly "dupe engine") — note vectorization, cosine similarity, pre-compute. | `/api/dupes/[id]` returns ranked similars. |
| **Day 6** | Mobile UI: scan screen, camera capture. | E2E scan flow works on a phone. |
| **Day 7** | **Encyclopedia detail page** — notes pyramid hero, longevity/sillage with confidence, season/occasion guidance, perfumer credit, house history. Note chips expand to flavor descriptions. | Detail page renders with real data; reads like an encyclopedia. |
| **Day 8** | Mobile UI: collection (Own/Tried/Wishlist), save flow. Collapsed "Similar fragrances" section at bottom of detail page. | Save works. Similars opt-in works. |
| **Day 9** | Auth (Clerk), Stripe checkout. Free tier limits + Pro encyclopedia content gating enforced. | Signup → Pro upgrade unlocks deeper content. |
| **Day 10** | Affiliate link integration to *scanned* fragrance only. Click logging. | Buy CTAs route correctly with affiliate tags. |
| **Day 11** | Polish: empty states, error states, loading skeletons. PWA manifest. Apply Consumer/Startup palette refinements. | App feels finished. |
| **Day 12** | QA on iOS Safari + Chrome Android. Real-bottle scan tests (≥30 bottles). | Accuracy measured. |
| **Day 13** | Analytics integration (PostHog). Funnels for activation + Pro conversion + encyclopedia interaction. ToS/Privacy stubs. | Metrics dashboard live. |
| **Day 14** | Soft launch — r/fragrance + 5–10 FragTok accounts. Lead with the "scan → encyclopedia" demo, not "find a dupe." | Live in production with first real users. |

**Checkpoints that can re-scope:** Day 3 (vision accuracy + encyclopedia content depth), Day 5 (scrape volume), Day 12 (real-bottle accuracy). If Day 3 encyclopedia content is too thin to justify Pro, defer Pro paywall and ship free-only first.

---

## 17. What Happens After v1

- **v1.1 (week 3–4 post-launch):** P1 items — shareable detail card (the notes pyramid screenshot), wear log, scan history, collection notes.
- **v1.5 (month 2):** Personal scent journal — long-form how-it-performed-on-me logging. Strongest Pro retention lever.
- **v2 (month 3+):** Two parallel tracks:
  - **Vue-rendered field capture** (Q12): parse `:perfume-votes` attributes from each scraped page, aggregate distributions ourselves, populate `longevity_score`, `sillage_score`, `season_tags`, `time_tags`, plus their `_confidence` siblings. Re-scrape required (~4h) but parser becomes pure post-processing on existing raw HTML if we capture the attribute strings during the next scrape. Trigger this work only if user research shows people actually want these on the detail page; otherwise defer further.
  - **Editorial / educational layer** — "Understanding chypres", "Reading a notes pyramid", curated content that reinforces the encyclopedia positioning.
- **v2+:** Social layer (public collections, follows). Native iOS/Android apps if PWA caps growth.

**v1 explicitly ships without:** longevity score, sillage score, season tags, time-of-day tags, similar URLs (we compute our own via cosine similarity). The detail page hides these sections cleanly when null. This is a deliberate scope choice, not a bug.

---

## Appendix A — Naming Note

The product was working-titled "Cologne Scan App" through the braindump phase. Locked to **Spritz** on April 22, 2026 — chosen for: (a) the verb-product alignment ("you spritz a bottle"), (b) one-syllable phonological stickiness, (c) universal vocabulary across FragTok / industry / casual users, (d) hits both insider-fragrance and consumer-app vibes simultaneously. The Italian-cocktail SEO collision is acknowledged and accepted.

## Appendix B — Data Source Risk

Fragrantica's ToS prohibits scraping. Standard hygiene applies:
1. Scraper code never goes in a public repo.
2. App UI never credits Fragrantica or links back.
3. Data layer abstracted behind a `FragranceRepository` interface so swap is a one-file change.
4. If contacted, freeze scraping immediately and accelerate community-contribution flow.
5. Public framing: "we bootstrapped the DB" — never describe the source.

For the *encyclopedia content layer* (perfumer credits, house history, note flavor descriptions), the data sources are different and need their own legal review:
- Perfumer credits: Fragrantica + Wikipedia. Both attributable but not in v1 UI.
- House history: Wikipedia (CC-BY-SA, requires attribution if quoted) or original AI-summarized + human-reviewed text.
- Note flavor descriptions: original editorial work (best path) or licensed dictionary.

Recommend Q2 resolution favors original editorial content for note descriptions — it's the smallest content set (~500 notes) and gives Spritz a defensible content moat that's not scraped from anyone.

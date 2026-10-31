# Seasonal Suggestions and Top Scents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three rotating discovery sections (Seasonal Suggestions with Men/Women, Top Scents for Men, Top Scents for Women), scored from a monthly research file plus existing signals, rotating every 3 days, seasonal picks strictly in-season.
**Architecture:** Pure functions for season, scoring and rotation (fully tested, no I/O); one server-only loader module that reads Supabase and the research JSON, filters eligibility, scores, rotates and caches per (list, season, window); two presentational components on the existing `FragranceScroller`. No migration, no cron.
**Tech Stack:** Next.js App Router server components, Supabase admin client, `unstable_cache`, tsx + node:assert tests (same pattern as `scripts/test-fcm.ts`).
**Spec:** `docs/superpowers/specs/2026-10-31-seasonal-and-top-scents-design.md` (approved 2026-10-31).

---

## File map

| File | New/Mod | Responsibility |
|---|---|---|
| `scripts/audit-discovery-coverage.ts` | new | One-off: gender and season_tags coverage in the top 300 by popularity. Prints numbers, exits. |
| `lib/discovery/season.ts` | new | `seasonFor(date)`, `windowIndex(date)`, Pacific-day arithmetic. Pure. |
| `lib/discovery/rotation.ts` | new | `rotate(pool, listKey, window, opts)`. Pure, seeded, replays prior windows for cooldowns. |
| `lib/discovery/score.ts` | new | `combineScores(candidates, signals, weights)` and the normalizers. Pure. |
| `lib/discovery/research.ts` | new | Types for `data/scent-research.json` and `researchMentions(file, list, now)` with 90-day decay and one-mention-per-source. Pure. |
| `lib/discovery/lists.ts` | new | Server-only loaders `getTopScents(gender)`, `getSeasonalPicks(gender)`: fetch, filter eligibility, score, rotate, cache. Never throws. |
| `data/scent-research.json` | new | Monthly research file, entries carry resolved `fragrance_id`. |
| `scripts/research-match.ts` | new | Resolves research entries to catalog ids via `joinTrendingToCatalog`, writes ids back, prints coverage and the unmatched list. |
| `scripts/test-discovery.ts` | new | All unit tests. |
| `package.json` | mod | `"test:discovery": "tsx scripts/test-discovery.ts"`, `"research:match": "tsx scripts/research-match.ts"`, `"audit:discovery": "tsx scripts/audit-discovery-coverage.ts"`. |
| `components/seasonal-suggestions.tsx` | new | Server wrapper loads both sides; client toggle child renders Men/Women. |
| `components/seasonal-toggle.tsx` | new | Client component: two-button segmented toggle, renders the chosen `FragranceScroller` rows. Pattern from `popular-by-house-tabs.tsx`. |
| `components/top-scents.tsx` | new | `TopScentsForMen`, `TopScentsForWomen` server components on `FragranceScroller` (`showRank={false}`). |
| `components/for-you-feed.tsx` | mod | Seasonal Suggestions after the "Based on what you wear" block. |
| `components/marketing-home.tsx` | mod | Seasonal Suggestions above `PopularOnFragrantica`. |
| `app/library/page.tsx` | mod | All three, next to the popular section. |

---

### Task 1: Coverage audit (decides whether Task 4b runs)

**Files:** create `scripts/audit-discovery-coverage.ts`; modify `package.json`.

- [ ] Write the script on the `scripts/push-test.ts` pattern (reads `.env.local`, `server-only` stub, `sb_secret_` key check). Query: `fragrances` ordered by `popularity_rank` asc, not null, limit 300, select `id, gender, season_tags, bottle_image_url, top_notes`.
- [ ] Print: count with gender set (by value), count with non-empty `season_tags`, per-season counts, count passing the quality floor (image + non-empty notes), and per-list eligible counts (masculine+unisex, feminine+unisex, each season x each gender).
- [ ] Josh runs `npm run audit:discovery` on the Mac (the sandbox has no Supabase credentials) and pastes the output.
- [ ] Record the numbers in the build log. **Gate:** if fewer than 60% of the 300 have season tags, or any season x gender list has fewer than 30 eligible, Task 4b is in scope.

### Task 2: Season and window (TDD)

**Files:** create `lib/discovery/season.ts`, `scripts/test-discovery.ts`; modify `package.json`.

- [ ] Tests first in `scripts/test-discovery.ts` (async `main()`, `assert/strict`, prints `ok` lines, exits 1 on failure):
  - `seasonFor` at Pacific dates: 2026-11-30 fall, 2026-12-01 winter, 2027-02-28 winter, 2027-03-01 spring, 2027-06-01 summer, 2027-09-01 fall. 2026-12-01T07:30Z (Nov 30 23:30 Pacific) is still fall.
  - `windowIndex`: same index for three consecutive Pacific days starting at the epoch, next index on day four; stable across UTC midnight inside one Pacific day.
- [ ] Run `npm run test:discovery`, watch it fail on the missing module.
- [ ] Implement: `type Season = "spring"|"summer"|"fall"|"winter"`; `pacificDay(date)` via `Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles"})` to a `YYYY-MM-DD` then day number; `EPOCH = "2026-11-01"`; `windowIndex = floor((day - epochDay)/3)`; month to season map.
- [ ] Run tests green. Commit.

### Task 3: Rotation (TDD)

**Files:** create `lib/discovery/rotation.ts`; modify `scripts/test-discovery.ts`.

Contract:

```ts
export interface PoolItem { id: string; score: number; unisex: boolean }
export interface RotateOpts {
  size?: number;      // 10
  anchors?: number;   // 3, top by score
  cooldown?: number;  // 2 windows for non-anchors
  power?: number;     // 1.5
  maxUnisex?: number; // undefined = no cap; 3 for gendered lists
  replay?: number;    // 6 prior windows replayed to derive cooldowns
}
export function rotate(pool: PoolItem[], listKey: string, window: number, opts?: RotateOpts): string[];
```

Algorithm: sort pool by score desc; anchors = first `anchors`. Replay windows `window-replay .. window` in order with empty history at the start. For each window k: eligible = pool minus non-anchors that appeared in any of the previous `cooldown` windows, minus anchors that appeared in both of the previous 2 windows. Draw `size` by weighted sampling without replacement, weight `max(score, 1e-6) ** power`, PRNG `mulberry32(fnv1a(listKey + ":" + k))`; skip a unisex item once `maxUnisex` is reached. If fewer than `size` are drawable, top up from excluded items by score (cooldown relaxed before the unisex cap; the unisex cap is never relaxed). Return window `window`'s picks sorted by score desc.

- [ ] Tests first, on a synthetic 30-item pool with descending scores and 8 unisex items:
  1. Determinism: `rotate(p,"m",5)` deep-equals a second call; `rotate(p,"m",6)` differs.
  2. Over windows 0..29: no non-anchor appears in two windows within `cooldown`; each anchor appears in 15 to 20 windows (50% to 67%); every pool item appears at least once.
  3. `maxUnisex: 3`: no window has more than 3 unisex.
  4. Pool of 7: returns 7 ids, no throw. Empty pool returns `[]`.
  5. Consecutive windows share at most 4 ids (acceptance: at least 6 of 10 change).
- [ ] Run, watch fail. Implement. Run green. Commit.

### Task 4: Scoring and research file (TDD)

**Files:** create `lib/discovery/score.ts`, `lib/discovery/research.ts`; modify `scripts/test-discovery.ts`.

```ts
export type ListKey = "men" | "women" | `seasonal-${"men"|"women"}-${Season}`;
export interface Signals {
  research: Map<string, number>;      // decayed mention weight per fragrance id
  popularityRank: Map<string, number>; // 1 = most popular
  trends: Map<string, number>;        // collector score
  inApp: Map<string, number>;         // adds + clicks, 30 days
}
export const WEIGHTS = { research: 0.45, popularity: 0.30, trends: 0.10, inApp: 0.15 };
export function combineScores(ids: string[], s: Signals, w = WEIGHTS): Map<string, number>;
```

Normalizers: research, trends, inApp divide by the max among `ids` (0 if max is 0). Popularity is `1 - (rank - 1) / (maxRank)` among ranked ids, 0 if unranked.

Research file shape:

```json
{ "generated_at": "2026-11-01", "entries": [
  { "name": "Bleu de Chanel", "house": "Chanel", "fragrance_id": "uuid-or-null",
    "lists": ["men", "seasonal-fall"],
    "citations": [ { "source": "sephora", "url": "https://...", "date": "2026-10-28" } ] } ] }
```

`researchMentions(file, list, now)`: for entries whose `lists` include the list (seasonal lists match `seasonal-<season>` regardless of gender), weight = number of distinct `source` values, each source's contribution halved if its newest citation is older than 90 days. Entries without `fragrance_id` are skipped.

- [ ] Tests first: weights sum to 1; a fragrance with only popularity scores > 0 and is not dropped; normalization puts the max at the full weight; two citations from one source count once; a 120-day-old source counts half; unmatched entries ignored.
- [ ] Run, fail, implement, green, commit.

### Task 4b (only if Task 1 gates it in): season inference

- [ ] Test first: `inferSeasons(families, accords)` maps citrus/aquatic/green/fresh to spring+summer, amber/gourmand/oud/leather/spicy to fall+winter, floral to spring, woody to fall. Returns `[]` when nothing matches (never guesses).
- [ ] Used only when `season_tags` is empty. Implement, green, commit.

### Task 5: First research pass and matcher

**Files:** create `data/scent-research.json`, `scripts/research-match.ts`; modify `package.json`.

- [ ] Research (WebSearch/WebFetch, no scraping): current men's and women's bestseller pages at Sephora, Ulta, Nordstrom, Macy's; fall 2026 recommendation threads on r/fragrance; 2 to 4 current fall roundups from established outlets. Record each fragrance once with all its citations. Target 40+ men, 40+ women, 25+ per gender tagged `seasonal-fall`.
- [ ] `research-match.ts` resolves `fragrance_id` with `joinTrendingToCatalog` (feed entries mapped to `TrendingEntry`), writes the file back, prints matched/unmatched with names. Josh runs it on the Mac (needs Supabase).
- [ ] Unmatched entries stay in the file with `fragrance_id: null`; report them, do not drop them. Commit the file with the match results.

### Task 6: Loaders

**Files:** create `lib/discovery/lists.ts`.

- [ ] `loadCandidates()`: fragrances with `bottle_image_url` not null and non-empty `top_notes`, select `id, name, house, bottle_image_url, gender, season_tags, family, popularity_rank`. Cached 1 hour.
- [ ] `loadSignals()`: research file (import JSON), trends from `trends-collector/data/latest.json` joined via the existing cached join, in-app from `getMostAddedToCollection`/`most_clicked_fragrances` counts (extend `db-trending.ts` with a counts variant rather than re-querying). Cached 1 hour.
- [ ] `eligible(list, season)`: gender rule (masculine or unisex for men, feminine or unisex for women); seasonal adds `season_tags` includes season, or research lists it for `seasonal-<season>`, or Task 4b inference when tags are empty.
- [ ] Pool = top 30 eligible by `combineScores`; `rotate` with `maxUnisex: 3`; map ids back to `ScrollerRow`.
- [ ] `getTopScents(gender)` cached on `["discovery", list, String(windowIndex(now))]`; `getSeasonalPicks(gender)` on `["discovery", list, season, String(window)]`, revalidate 3600. Wrap in try/catch, return `[]` on error with a `console.warn`.
- [ ] Typecheck (`npx tsc --noEmit`). Commit.

### Task 7: Components and copy

**Files:** create `components/top-scents.tsx`, `components/seasonal-suggestions.tsx`, `components/seasonal-toggle.tsx`.

- [ ] `TopScentsForMen` / `TopScentsForWomen`: titles "Top scents for men" / "Top scents for women", `showRank={false}`.
- [ ] `SeasonalSuggestions`: server; loads both sides in parallel; heading `${Season} picks` capitalized, subline "What people are reaching for this season."; self-hides if both sides are empty; if one side is empty, the toggle hides and the other side shows alone.
- [ ] `SeasonalToggle`: client; two buttons "Men" / "Women", `aria-pressed`, default Men; spacing on the 8px scale; one stroke job (no card around the section).
- [ ] Typecheck. Commit.

### Task 8: Placement

- [ ] `for-you-feed.tsx`: `<SeasonalSuggestions />` after the "Based on what you wear" recs block.
- [ ] `marketing-home.tsx`: `<SeasonalSuggestions />` above `<PopularOnFragrantica />`.
- [ ] `app/library/page.tsx`: `<SeasonalSuggestions />`, `<TopScentsForMen />`, `<TopScentsForWomen />` next to the popular section.
- [ ] Typecheck. Commit.

### Task 9: Verification

- [ ] `npm run test:discovery` green; `npx tsc --noEmit` clean; `npx next build` succeeds.
- [ ] Josh, on the Mac with `.env.local`: `npm run dev`, open `/library` and `/`, confirm acceptance 1 and 2 (headings, 10 bottles with images, no wrong-gender bottles). Spot-check 3 seasonal picks' tags in Supabase.
- [ ] Rotation check without waiting 3 days: a temporary `?window=` override readable only in development, then removed before merge.
- [ ] Build log entry.

### Task 10: Monthly research refresh

- [ ] Scheduled task, cron `0 16 1 * *` (1st of month, 9 AM Pacific): fresh session re-runs Task 5's research for the current season, updates `data/scent-research.json`, hands Josh a patch and the `npm run research:match` command, reports unmatched entries and any list under 30 eligible.

---

## Self-review

Spec coverage: placement (T8), weights (T4), research with citations, decay and one-per-source (T4/T5), unisex cap (T3/T6), strict in-season with immediate switch on Dec 1 (T2/T6 cache key), quality floor (T6), coverage gate (T1/T4b), copy (T7), tests 1 to 6 (T2 to T4), acceptance (T9), monthly refresh (T10). No placeholders remain except the research content itself, which is Task 5's output by design.

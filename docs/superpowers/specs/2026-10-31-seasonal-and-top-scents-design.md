# Seasonal Suggestions, Top Scents for Men, Top Scents for Women

**Status:** approved by Josh 2026-10-31, with one change: seasonal picks are strictly in-season (no lead-in to the next season).
**Decisions from Josh (2026-10-31):** research = blend of existing signals plus a monthly cited research file; placement = home feed and Library; unisex = eligible for both gendered lists, capped.

## What ships

Three discovery sections, free for everyone (not Pro):

1. **Seasonal Suggestions.** One section titled for the current season ("Fall picks"), with a Men / Women toggle. 10 fragrances per side.
2. **Top Scents for Men.** A horizontal scroller of 10.
3. **Top Scents for Women.** A horizontal scroller of 10.

Each list rotates every 3 days. The strongest fragrances come back often; the rest of the pool cycles through, and nothing outside the top few repeats in back-to-back windows.

Placement: Seasonal Suggestions on the signed-in home feed, after "Based on what you wear", and on the signed-out marketing home. All three on the Library page, next to "Most popular right now".

## Where the ranking comes from

Every candidate fragrance gets one score per list, built from four signals:

| Signal | What it is | How fresh | Weight |
|---|---|---|---|
| Research | Mentions in the monthly research file (below) | Monthly | 0.45 |
| Catalog popularity | `fragrances.popularity_rank`, inverted and normalized | Static (catalog build) | 0.30 |
| Search interest | Weekly trends collector (Google Trends) | Weekly | 0.10 |
| In-app behavior | Collection adds and buy clicks, last 30 days | Live | 0.15 |

Each signal is normalized to 0..1 before weighting, and a fragrance missing a signal scores 0 for it rather than being dropped. The weights live in one config object so they can be tuned without touching logic. Research leads because it is the only signal that is both current and gender- and season-aware; catalog popularity keeps the lists anchored to genuinely well-known bottles; in-app behavior gets more weight later, as the user base grows.

### The research file

`data/scent-research.json`, refreshed on the 1st of each month by a scheduled task (a fresh Claude session that does web research, writes the file, and hands Josh a commit to push). Each entry records the fragrance, the list it supports (men, women, or seasonal with a season), and its citations: source name, URL, and date.

Sources, in priority order: current retail bestseller lists (Sephora, Ulta, Nordstrom, Macy's, split by men's and women's), community consensus threads (r/fragrance and similar, recent season-specific threads), and current editorial seasonal roundups. A mention counts once per source, not once per article, so a single outlet cannot dominate. Mentions older than 90 days decay to half weight.

Entries are matched to catalog ids with the same name and house matcher the trending feed already uses (`lib/trending/join.ts`). The refresh reports unmatched entries instead of silently dropping them.

Citations stay internal. No user-facing string names a source, which is the same rule as the store listings and "Most popular right now".

## Eligibility

- **Gendered lists:** `gender` is masculine (men) or feminine (women), or unisex for either. At most 3 of the 10 picks in a window can be unisex.
- **Seasonal:** the season is meteorological, Northern Hemisphere: Dec to Feb winter, Mar to May spring, Jun to Aug summer, Sep to Nov fall. A fragrance qualifies only for the season it belongs to: `season_tags` contains the current season, or the research file lists it for that season. Fall fragrances appear only in fall, spring only in spring. A fragrance tagged for two seasons (fall and winter, say) qualifies in both. The list switches on the first day of the new season, including the heading ("Fall picks" becomes "Winter picks" on Dec 1). The Men and Women sides follow the same gender rules as above.
- **Quality floor:** a bottle image is required, and the fragrance must have notes. A list without pictures reads as broken.

**Coverage check (first implementation task):** an audit query counts how many fragrances in the top 300 by popularity have `gender` and `season_tags` filled. If season coverage is under 60%, the plan adds a fallback that infers season from families and accords (citrus, aquatic and green lean spring and summer; amber, gourmand, oud and leather lean fall and winter). That fallback is decided from real numbers, not built speculatively.

## Rotation

Each list has a **pool**: the top 30 eligible fragrances by score. Time is cut into 3-day windows counted from a fixed epoch, and each window shows 10 picks from the pool. For the seasonal lists, a season change ends the current window early: the cache key includes the season, so a window that straddles Dec 1 shows fall picks through Nov 30 and the new season's picks from Dec 1, with the rotation starting fresh for that season.

- **Anchors** (top 3 in the pool) are eligible in any window but sit out at least one window in every three, so the best bottles recur roughly two windows out of three.
- **Everyone else** gets a cooldown: after appearing, a fragrance sits out the next 2 windows (6 days).
- Picks are drawn by weighted sampling without replacement. The weight is the score raised to a power (1.5), so stronger fragrances come up more often but the lower half of the pool still shows.
- The draw is seeded from the list name and window number, so every visitor sees the same picks during a window, and a window's picks never change between requests.

The rotation is a pure function: pool, scores and window number in, 10 ids out. To respect cooldowns it replays the previous few windows from the same pool, which is cheap at 30 items. When the monthly research file changes the pool, the replay simply starts from the new pool; a one-time reshuffle at the start of the month is acceptable.

Within a window the 10 picks are ordered by score, without "#1" rank chips, because a rotating list is not a strict ranking.

## Architecture

Computed on request, then cached until the window ends. There is no cron, no new table and no migration.

- `lib/discovery/score.ts`: loads the signals and returns scores per list. Server-only.
- `lib/discovery/rotation.ts`: the pure rotation function, with no I/O.
- `lib/discovery/season.ts`: the current season from a date (Pacific time, matching the rest of the app's day boundaries).
- `lib/discovery/lists.ts`: `getSeasonalPicks(gender)`, `getTopScents(gender)`. Wrapped in `unstable_cache`, keyed by list, season (seasonal lists only) and window number. They never throw: on error a section self-hides, same as the existing trending sections.
- `components/seasonal-suggestions.tsx`: section with the Men / Women toggle, following `popular-by-house-tabs.tsx`.
- `components/top-scents.tsx`: two exports rendering through the shared `FragranceScroller`.
- `data/scent-research.json` plus `scripts/research-match.ts`, which matches entries to catalog ids and prints coverage.

### Alternatives considered

- **Precomputed table written by a cron every 3 days.** Easier to inspect in Supabase, but adds a migration, a job to monitor, and a failure mode where the lists go stale silently. Not worth it at this scale.
- **Fully hand-curated JSON.** Highest editorial control, but every rotation becomes manual work, and it ignores the in-app signal.

## Copy (in-product, ux-microcopy voice)

- Seasonal heading: "Fall picks". Subline: "What people are reaching for this season." Toggle: "Men" / "Women".
- "Top scents for men" / "Top scents for women". No subline: the heading carries it.
- No "updated every 3 days" line. Rotation should feel like freshness, not a mechanism.

## Tests (`npm run test:discovery`)

1. The same window always gives the same picks; the next window differs.
2. Over 30 consecutive windows: every non-anchor respects the 2-window cooldown; each anchor appears in at least 50% and at most 67% of windows; every pool member appears at least once.
3. A gendered list never has more than 3 unisex picks.
4. Season boundaries: Nov 30 is fall and Dec 1 is winter. On Nov 30 the seasonal pool contains no fragrance tagged only winter; on Dec 1 it contains no fragrance tagged only fall. A fragrance tagged fall and winter qualifies on both days.
5. Scoring: a missing signal scores 0 and does not exclude the fragrance; the weights sum to 1.
6. A pool smaller than 10 returns everything it has without crashing.

## Acceptance

1. On the home feed (signed in), Seasonal Suggestions shows "Fall picks" with 10 bottles per side, every bottle with an image, and none of them tagged only for another season. On Dec 1 it shows "Winter picks" without waiting for a rotation window to end.
2. Library shows all three sections. Men's shows no feminine-only bottle, and women's no masculine-only bottle.
3. On the same day, two devices see identical lists; three days later at least 6 of the 10 have changed.
4. `npm run test:discovery` passes; typecheck is clean.
5. The first research file is committed with citations, and the match script reports coverage, with unmatched entries listed.
6. The monthly research refresh is set up as a scheduled task.

## Out of scope

Personalization (the For You feed already covers it), the Southern Hemisphere, Pro gating, push notifications for new picks, and any user-facing source attribution.

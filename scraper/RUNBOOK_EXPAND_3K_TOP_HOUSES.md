# Runbook — +3,000 fragrances from the top 300 houses

Adds the **next 10 most popular unscraped fragrances from each of the 300 most popular houses**.
Run everything from `scraper/` (`DATA_DIR` resolves from CWD).

---

## What changed, and why you need this instead of `discover:brands`

Three things were verified against live Fragrantica on 2026-07-28. All three break the old path:

1. **`/designers-N.html` returns 404 for every N.** The real index is `/designers-N/` — trailing slash, and there are **11** of them, not 26. `discover:brands` has been firing 26 dead requests every run and falling back to the 120 brands on `/designers/`. Fixed in `scrape-fragrantica.ts`.

2. **`/designers/` is alphabetical**, not popularity-ordered, despite its "Some of The Most Popular Designers" heading. So `BRANDS_MAX` / `BRANDS_OFFSET` have been slicing an alphabetical list.

3. **Brand pages list fragrances alphabetically too.** `FRAGRANCES_PER_BRAND_MAX=30` took each brand's first 30 *by name* — Amouage's "Beach Hut Man" and "Cristal & Gold" (6 votes) got in while **Reflection Man (1,391 votes) did not**. Any rows harvested through `discover:brands` are alphabetically biased, not popularity-biased.

Fragrantica publishes no ranked list of houses anywhere. The workaround: brand-page cards carry a per-fragrance **community vote count** inside the anchor text (`"Beach Hut Man Amouage 2017 666"`). That single number gives both a real house ranking and a real per-house fragrance ordering.

New pipeline in `src/discover-houses.ts`. Verified: Creed → Aventus (4,358), Chanel → Coco Mademoiselle (2,384), Parfums de Marly → Layton (2,525), Xerjoff → Naxos (2,305). All correct.

---

## Pre-flight

```bash
cd scraper
cp data/queue.json        "data/queue.backup-20260728.json"
cp data/scrape-state.json "data/scrape-state.backup-20260728.json"
```

`scrape-state.json` is the dedup map. Do not delete it.

---

## Step 1 — Harvest the house universe (~1 min)

```bash
npm run discover:houses
```

Walks the 11 real indexes and writes `data/houses.json` — every brand plus its fragrance count.

**Expect:** ~8,041 houses. ~2,100 with ≥8 fragrances (the ranking pool).
**If you see ~120**, the index fix didn't take — check `BRAND_INDEX_COUNT` in `discover-houses.ts`.

---

## Step 2 — Rank houses by vote mass (~1.5-2 hrs)

```bash
npm run rank:houses
```

Fetches each candidate brand page once and parses every fragrance's vote count. Writes `data/houses-ranked.json` plus a per-house popularity-ordered list in `data/house-fragrances/`.

Score = sum of votes over each house's **top 10** fragrances. Summing the top slice rather than the whole catalogue is deliberate: it stops The Dua Brand (2,034 releases) and Avon (1,373) from outranking Creed (103) on sheer volume.

If you get rate limited, the run pauses and retries on its own. If it aborts, wait 15-30 minutes and re-run — progress is saved. Persistent 429s mean slowing down:

```bash
FETCH_CONCURRENCY=1 FETCH_DELAY_MIN=3000 FETCH_DELAY_MAX=6000 npm run rank:houses
```

**Watch the coverage line at the end.** It prints `✓ coverage complete: N/N` or a loud `⚠ COVERAGE: x/y ranked — z MISSING`. If anything is missing, just re-run — cached houses are skipped. Do not move to Step 3 until coverage is complete; `discover:top` will now refuse to run against a partial ranking rather than quietly under-delivering.

**Resumable.** Every house is cached to disk as it completes, and the ranking file is checkpointed every 100 houses. Crash, sleep, or Ctrl-C, then re-run.

**Sanity check:** the top 20 printed at the end should be houses you recognise — Dior, YSL, Lattafa, Armani, Guerlain, Chanel, Creed, Parfums de Marly. If Avon, Jequiti, Dzintars or O Boticário are near the top, `HOUSE_SCORE_TOP_N` isn't being applied and you're ranking on catalogue size.

Knobs: `HOUSE_MIN_FRAGRANCES` (8, set 0 to rank all 8,041), `MEGA_HOUSE_COUNT` (600), `FETCH_CONCURRENCY` (3), `FETCH_DELAY_MIN`/`MAX` (400/1200ms), `MAX_HOUSE_MB` (20), `FETCH_TIMEOUT_MS` (45000).

### Why the first run of this step failed

v1 returned each brand page's full HTML from `page.evaluate` to Node. Mega-catalogue pages are huge (Avon is 9.1 MB) and pushing that through CDP froze the renderer past 45 s per house. The candidate pool was also ordered by fragrance count descending, so the run led with Avon, The Dua Brand, Jequiti, Oriflame and Yves Rocher — the slowest pages, and none of them anywhere near a popularity top 300. Result: 69 minutes, 30 houses ranked, and a `discover:top` that produced 260 URLs instead of 3,000 without complaining.

Three fixes, all in `src/discover-houses.ts`:

- **Parse inside the page, return only the compact array.** The body is consumed as a stream and never materialised as one giant string. Avon now takes 7.7 s. Verified byte-identical to whole-string parsing on a 4.32 MB page under randomised chunk boundaries.
- **Mega-catalogues (>600 fragrances) go last**, so an interrupted run leaves you with Dior rather than Avon. Each worker also gets its own tab, since `evaluate` calls on a shared page serialise on the renderer.
- **Coverage is now loud**, and `discover:top` aborts on a partial ranking instead of silently slicing 300 from a 30-entry list.

### Why the second run failed

Every house returned `ReferenceError`, then HTTP 429, then a dead browser. Three causes, one of them subtle:

1. **`ReferenceError` — tsx + `page.evaluate`.** The streaming rewrite introduced a named inner function (`const flush = …`) inside the evaluate callback. tsx runs esbuild with `keepNames`, which rewrites that to `__name(() => {…}, "flush")`. `__name` is a module-scope esbuild helper that does not exist in the browser, so the callback died before doing any work — on every house. v1 had no named inner function, which is why it ran at all. **The parse loop in `harvestHouse` is inlined specifically to avoid this. Do not refactor it into a helper.** Check with `npx esbuild src/discover-houses.ts --keep-names --outfile=/tmp/out.js` and confirm the callback contains no `__`-prefixed helpers.
2. **HTTP 429.** 3 workers at 400-1200 ms is ~2.5 req/s; Fragrantica cut us off after about 30 requests. Defaults are now 2 workers at 1200-2500 ms (~1 req/s), with exponential backoff (30 s, doubling to 5 min) that pauses *every* worker and re-queues the house.
3. **Dead browser, 3,600 identical errors.** The workers kept going after the context died. There's now a circuit breaker: browser-closed aborts immediately, and 8 consecutive failures of any kind stops the run with a resume hint.

---

## The shortlist path (recommended)

Steps 2 and 3 above rank all 3,703 candidate houses, which needs ~30 sessions at Fragrantica's rate limit. The curated shortlist does the same job in two.

`data/house-shortlist-input.json` holds 360 hand-picked houses: 300 core across tiers 1-6, plus 60 ultra-niche in tier 7. Both `rank:houses` and `discover:top` read `HOUSE_SOURCE`, so the shortlist slots into the existing pipeline rather than replacing it.

### 2b.1 — Resolve names to slugs (instant, no network)

```bash
npm run match:shortlist
```

Resolves each name against the local `houses.json`, marks catalogue status, and lists anything unmatched. **Zero Fragrantica requests**, safe to run while blocked. Read `data/house-shortlist.md` and fix or drop anything in the unmatched table before continuing.

First run resolved 344 of 360. Fragrantica names brands in ways no normaliser will guess (`Frederic Malle` is filed under `Editions-de-Parfums-Frederic-Malle`, `Heeley` under `James-Heeley`, `Cire Trudon` under `Trudon`), so for the stragglers:

```bash
npm run find:slugs                # suggests candidates for every unmatched row
npm run find:slugs -- "Heeley"    # or one name at a time
```

Also local-only. It ranks real slugs from `houses.json` by trigram and token similarity. `***` means the top hit is clearly ahead of the runner-up; `**` means it's close and you should pick by eye. Copy good hits into `ALIASES` in `src/match-shortlist.ts`, keyed by the lowercased shortlist name:

```ts
"heeley": "James-Heeley",
```

Then re-run `npm run match:shortlist`. Anything with no plausible hit isn't on Fragrantica; drop it from `house-shortlist-input.json` rather than forcing a match.

> If `4711` and `4160 Tuesdays` both come back with no plausible hit, that's not a naming problem. It means digit-leading brands are missing from `houses.json` because `discover:houses` walks `/designers-1/` through `/designers-11/` and never probes a numeric index. Check whether `/designers-0/` exists (one request) and bump `BRAND_INDEX_COUNT` accordingly.

### 2b.2 — Rank just those houses

```bash
HOUSE_SOURCE=shortlist MAX_TIER=6 npm run rank:houses
```

~300 houses, minus the ~128 already cached, so roughly 170 to fetch. That is one to two sessions. Drop `MAX_TIER=6` to include the 60 ultra-niche houses in tier 7.

Priority here is the curated tier order rather than vote mass, since you're taking every house on the list anyway. The ordering only decides what an interrupted run leaves you holding, and tier 1 first means that's Dior rather than Hexennacht.

### 2b.3 — Build the queue

```bash
HOUSE_SOURCE=shortlist MAX_TIER=6 npm run discover:top
```

Aborts if any target house lacks a cached fragrance list, naming the first ten. Finish ranking, or pass `ALLOW_PARTIAL=1` to proceed with what's cached and take the smaller result knowingly.

Expect roughly 3,000 URLs at the default `NEW_PER_HOUSE=10`. Then `npm run scrape` as normal.

---

## Step 3 — Build the queue (instant)

```bash
npm run discover:top
```

Takes the top 300 houses and appends each one's next 10 highest-vote fragrances that aren't already queued or scraped.

**Expect:** `+~3,000 new URLs`. It prints every house that yielded fewer than 10 and why — no silent truncation.

To resize without re-ranking: `HOUSES_TOP_N=200 NEW_PER_HOUSE=15 npm run discover:top`.

---

## Step 4 — Scrape (~10-13 hrs, leave overnight)

```bash
npm run scrape
```

Unchanged. Resumes per URL, so sleep or a crash costs nothing. Monitor with `tail -f data/scrape.log`.

Watch for 3+ clustered failures — that's Cloudflare noticing, not a parser break. Pause 30 min and resume. The scraper self-aborts after 5 consecutive challenges. Current `.env` is `DELAY_MIN=2 / DELAY_MAX=5`; if the failure rate climbs above 5%, raise to 8/15 before assuming anything else is wrong.

---

## Step 5 — Pipeline

```bash
npm run parse
npm run vectorize
```

### ⚠ Then STOP and read this before uploading

**Do not run `npm run upload`.** It upserts on `(name, house)` and rewrites `popularity_rank` from queue order, which would clobber the AI-inferred ranking across all 7,113 existing rows.

Use the surgical importer instead — it matches on `fragrantica_url`, updates in place or inserts, and never touches the popularity columns:

```bash
npm run import:targets
```

New rows land with `popularity_rank` / `popularity_score` NULL. Backfill them:

```bash
npm run popularity          # gpt-4o-mini, resumable via WHERE score IS NULL
```

Then recompute the ordinal ranks over the full catalogue with `scripts/rank-popularity.sql` (window function, tie-break by id).

### Finally

```bash
npm run compute-dupes       # ~10k rows now — expect 15-25 min
npm run mirror:images
```

---

## Verify

```sql
select count(*) from fragrances;                                  -- ~10,100
select count(*) from fragrances where popularity_rank is null;    -- 0 after backfill
select count(distinct house) from fragrances;                     -- was 236, expect 400+
select house, count(*) from fragrances group by house order by 2 desc limit 10;
```

Spot-check that the new rows are the *popular* ones: Amouage should now have Reflection Man and Guidance, not just the alphabetical head of its catalogue.

---

## When to stop

Two stop conditions that aren't "we hit the number", both worth checking after this batch lands:

1. **Match rate plateaus.** If scan-success rate (`scan_events` where `matched_fragrance_id` is non-null / total) hasn't moved in two weeks, the catalogue is deep enough and further expansion isn't paying.
2. **Editorial debt outpaces capacity.** Editorial coverage is ~21 entries against a soon-to-be ~10k catalogue. A 3k catalogue with 300 editorial entries beats a 10k catalogue with 21. If the gap keeps widening, shift effort to writing.

# Catalog Expansion Plan — 1k → 10k

The mechanics of running the scraper live in `SCRAPER_LAUNCH.md`. This doc is the **plan** for getting from where we are now (1,009 fragrances) to the v1 target (10,000).

---

## Current state (snapshot)

| Stage             | Count |
| ----------------- | ----- |
| Scrape completed  | 1,009 |
| Scrape failed     |    12 |
| Parsed JSON files | 1,010 |
| Raw HTML files    | 1,009 |
| **Gap to 10k**    | **~8,990** |

Distribution skews heavily toward Lattafa (66 fragrances — clones-heavy, low cost-per-acquisition for our editorial dupes feature) and the major designer + niche houses (Dior, YSL, Tom Ford, Chanel, Parfums de Marly, Amouage all ≥20). This matches what users will actually scan.

---

## Decision: do we want raw 10k, or quality 10k?

Worth pausing on before we run anything. Two failure modes for an aggressive expansion:

1. **Quality cliff at depth.** The first 1k is concentrated in popular houses. The next 9k will increasingly include obscure indies, regional designers, and discontinued bottles with sparse Fragrantica data (sometimes no notes, no longevity, no community votes). These rows make the encyclopedia look thin when a user scans one of them.

2. **Editorial debt.** We currently have hand-written editorial content for ~21 fragrances. 10k catalog rows × 0% editorial coverage hurts the "informative, not suggestive" positioning. The catalog is the foundation, but editorial is the moat.

**Recommendation**: phase the expansion. Don't try to do all 9k in one weekend.

### Phase 1 — Next 2k (1k → 3k total)
Mainstream + popular niche extension. Target: top 3k by Fragrantica popularity. Expected quality: high. Time: ~6 hours of scraping + ~30 min of pipeline.

### Phase 2 — Next 4k (3k → 7k total)
Niche, indie, regional. Where editorial differentiation pays off most — these are the bottles users have heard of but can't find good info on elsewhere. Target: top 7k by popularity. Time: ~12 hours scraping + 1 hour pipeline.

### Phase 3 — Long tail (7k → 10k total)
Optional. Low-popularity rows. Diminishing returns on scan-match rate. Time: ~6 hours scraping + 30 min pipeline.

Phases 1 + 2 cover ~99% of likely user scans. Phase 3 is for the "we have everything" marketing line.

---

## Pre-flight: investigate the 12 failures first

Before pushing for more URLs, look at the existing failures. Pattern in the list:

- 3× Lattafa/Afnan/Zimaya/MAISON-ASRAR (Middle East clone houses — often page-template variants)
- 2× Maison Martin Margiela (older URL slug variant)
- 1× Jean Paul Gaultier (recent release — Vue rendering)
- 1× Dior Sauvage Parfum (very heavy page, anti-bot triggered)
- 1× Guerlain Petite Robe Noire (Cloudflare challenge — most-popular pages get extra scrutiny)
- 1× ZARKOPERFUME, 1× Juliette Has A Gun, 1× Kerosene, 1× Zara, 1× Zoologist

Likely root causes, ranked: (a) Cloudflare challenge under the popularity ceiling, (b) page-template variants the three-strategy parser didn't catch, (c) Vue-rendered fields not present in our v1 extraction (we punted this to v2).

**Recommended sequence:**

1. Pick three from the failed list, manually open them in a browser, confirm the page renders cleanly.
2. Build a one-line `queue.json` containing just those three URLs.
3. `npm run scrape` against the small queue — observe the failure mode live.
4. If it's Cloudflare: bump the per-page delay in `.env` (`DELAY_MIN=10000`, `DELAY_MAX=18000`) and retry with `HEADLESS=false` to mimic a real session.
5. If it's parser: dump the raw HTML and add a fourth strategy. If it's the Vue-rendered fields specifically: defer (we're not pushing v2 yet).

Time: ~30 min. Skip this step and Phase 1 + 2 + 3 will all carry the same blind spots.

---

## Phase 1 — Execution plan (top 1k → 3k)

### 1.1 Re-discover from the popularity feed

The scraper's `discover` mode pulls from Fragrantica's search page, ordered by popularity. We already have the top ~1k completed. Re-running `discover` will yield the same URLs in roughly the same order plus the next slice.

```bash
cd scraper
DISCOVER_TARGET=3000 npm run discover
```

`scrape-state.json`'s `completed` array dedupes automatically, so a re-run only enqueues new URLs.

Expected output:
```
[discover] initial load: 30 URLs
[discover] click 1: +30 (total 60/3000)
…
[discover] target reached: 3000 URLs
[discover] new in queue: ~1991
```

If the count of "new in queue" is much lower than ~1990, Fragrantica's "Show more" loop is being throttled mid-way. Restart with a longer post-click delay and confirm queue grew.

### 1.2 Scrape the new URLs

```bash
npm run scrape
```

Throughput at the proven hygiene settings (HEADLESS=false, 8-15s delays, scroll-mimic): ~150-200 pages/hour. For 2k new URLs, expect ~10-13 hours. Leave it overnight. The scraper persists state per URL, so a crash or sleep just resumes on the next run.

Monitor periodically: `tail -f data/scrape.log` from another terminal. Look for clustered failures (3+ in a row) — those usually mean Cloudflare has noticed. Pause for 30 min and resume.

### 1.3 Parse + vectorize + upload + dupes

```bash
npm run parse
npm run vectorize
npm run upload
npm run compute-dupes
```

Each step independent. Parse is fast (~5 min for 2k pages). Vectorize is fast (~1 min). Upload is bound by Supabase write throughput (~2-3 min for 2k upserts). compute-dupes recalculates against the *full* catalog (now ~3k rows = ~150k pairs, ~5 min).

Reference: `RUNBOOK_REPOPULATE_DUPES.md` for sanity-check queries at each step.

### 1.4 Backfill bottle images

```bash
npm run mirror:images
```

~5 min for 2k new rows. Reference: `RUNBOOK_BACKFILL_BOTTLE_IMAGES.md` for class A vs class B handling if some rows orphan.

### 1.5 Editorial backfill (optional but recommended)

For the new top ~50 fragrances by popularity, hand-write editorial entries in `editorial/fragrances/*.md`. This is what makes Spritz feel like an encyclopedia rather than a database. Budget: ~2 hours per batch of 50.

---

## Phase 2 + 3 — Same pattern at larger scale

Phase 2 = repeat Phase 1 with `DISCOVER_TARGET=7000`. Expect ~12 hours scraping (4k new URLs). Same pipeline steps, longer compute-dupes pass (~15 min for 350k pairs).

Phase 3 = `DISCOVER_TARGET=10000`. Long tail. Quality drops sharply — expect a higher failure rate, more `null` notes, more orphan images. Consider whether the diminishing returns are worth the cost.

---

## Checkpoint cadence

The scraper writes `scrape-state.json` after every URL. Recovery from a crash is automatic on the next `npm run scrape` invocation. **Do not delete `scrape-state.json` between phases** — it's the dedup map.

Backup the state file before each phase kickoff:

```bash
cp data/scrape-state.json "data/scrape-state.backup-$(date +%Y%m%d).json"
```

That way if something goes sideways mid-Phase-2, you can restore the Phase-1 completion state and re-run cleanly.

---

## Cloudflare hygiene — what we know works

From the SCRAPER_LAUNCH.md battle log, these settings get through Fragrantica's protection consistently:

- `HEADLESS=false` — visible browser, real window
- `DELAY_MIN=8000`, `DELAY_MAX=15000` — 8-15s between page loads, randomized
- Scroll-after-navigate (built into the scraper)
- `navigator.webdriver=false` patch (built in)
- Residential IP (your home network, not VPS)

If failure rate climbs above 5% in a phase, lengthen delays before assuming the parser broke.

---

## When to stop

Two stop conditions that aren't "we hit 10k":

1. **Match rate plateaus.** If the scan-success rate (rows in `scan_events` where `matched_fragrance_id` is non-null divided by total) hasn't moved meaningfully in two weeks, the catalog is "deep enough." Investing further in the long tail isn't paying.
2. **Editorial debt outpaces capacity.** If editorial coverage stays below ~5% of catalog and the gap is widening, slow down catalog expansion and shift effort to writing. A 3k catalog with 300 editorial entries beats a 10k catalog with 21.

Both worth tracking from week 1 — set up the queries in Metabase or just run them as one-offs in the Supabase SQL editor monthly.

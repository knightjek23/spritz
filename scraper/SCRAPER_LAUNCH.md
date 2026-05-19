# Spritz Scraper — Launch Runbook

Get from "code on disk" to "10k fragrances in Supabase" in roughly 16 hours of mostly-unattended work. Total active time: ~30 minutes (setup, dry-run validation, kickoff).

> **Run this on YOUR machine, not on a cloud VPS.** Residential IP is a hard requirement. Fragrantica fingerprints datacenter IPs and will rate-limit hard. If you only have a VPS, run it through your home network via a VPN/SSH tunnel.

---

## Step 0 — Setup (one-time, ~5 min)

```bash
cd scraper
npm install
npx playwright install chromium
cp .env.example .env
```

Fill `.env` — minimum required:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

Same Supabase URL + service role key as `../.env.local`. Service role bypasses RLS so the scraper can bulk-insert.

The discovery, pacing, and selector knobs (`DISCOVER_URL`, `DISCOVER_BUTTON_TEXT`, `DISCOVER_RESULT_SELECTOR`, `DELAY_MIN/MAX`, `SCRAPE_LIMIT`) all have working defaults — only override them in `.env` if Fragrantica changes its DOM.

---

## Step 1 — Discover (~20–30 min, click-loop)

Fragrantica's `/search/` page has no URL pagination — it uses a "+ Show more results" button that loads more results into the same page. The scraper opens the search page once, then clicks that button in a loop until it has 10k URLs.

```bash
npm run discover
```

Expected output:

```
[discover] URL:        https://www.fragrantica.com/search/
[discover] Button:     "Show more results"
[discover] Selector:   a[href*="/perfume/"]
[discover] Target:     10000 URLs

[discover] initial load: 30 URLs
[discover] click 1: +30 (total 60/10000)
[discover] click 2: +30 (total 90/10000)
...
[discover] wrote 10000 URLs → data/queue.json
```

**If discover returns 0 URLs:** run the debug command (Step 1.5 below) before doing anything else.

### Step 1.5 — Debug (only if Step 1 failed)

```bash
npm run discover:debug
```

Opens the search page, takes a full-page screenshot, dumps the raw HTML, tries the load-more button several ways, attempts ONE click, and tells you exactly what was found. Output saved to `data/debug/`:

- `discover-debug-report.json` — the diagnosis
- `search-initial.html` — open in your browser to inspect the DOM directly
- `search-initial.png` — screenshot of what the headless browser sees
- `search-after-click.png` — same, after one click attempt

Common failures and fixes:
| What you see in report | Likely cause | Fix |
|---|---|---|
| `looks_like_cloudflare_block: true` | Cloudflare challenged the headless browser | Wait 24h, increase `DELAY_MIN/MAX` to 5/10s, retry. Consider a residential proxy. |
| `total_anchors_on_page < 50` | Page didn't fully load | Increase the `goto` timeout in `src/scrape-fragrantica.ts` (the 60_000 in `runDiscoverDebug`) |
| `regex_validated_fragrance_urls: 0` but anchors > 100 | Selector doesn't match | Inspect `search-initial.html` for actual `<a>` patterns, set `DISCOVER_RESULT_SELECTOR` in `.env` |
| `button_locator_trials.getByRole: 0` everywhere | Button text changed or it's not a `<button>` | Open `search-initial.png`, find the load-more control, update `DISCOVER_BUTTON_TEXT` |
| `click_test.grew_by: 0` | Click registered but no new content loaded | Increase `DISCOVER_CLICK_WAIT_MS` to 8000, retry |

---

## Step 2 — Dry-run (~3 min, validate parser)

Scrape only the first 10 URLs from the queue, then parse one of them so you can spot-check.

```bash
npm run scrape:dry
```

Output should show 10 successful fetches. Then:

```bash
npm run parse:one
```

This prints the parsed JSON for the first raw HTML file to stdout. Inspect it carefully — these are the fields you should actually see populated:

| Field | Expectation |
|---|---|
| `name`, `house` | Required. If null, the parser is broken — don't proceed. |
| `gender`, `year` | Should be present for >90% of mainstream fragrances. |
| `family` | Array of accord names ("woody", "amber", etc.). 3–6 entries typical. |
| `top_notes`, `mid_notes`, `base_notes` | Each should have 3–10 notes with weights. |
| `longevity_score`, `sillage_score` | Floats 0–10. Confidence 0–1. |
| `season_tags`, `time_tags` | A few tags each. |
| `similar_urls` | 5–20 URLs typically. |
| `perfumer` | A name string, sometimes null for older fragrances. |
| `bottle_image_url` | Should be a real URL. |

If a field comes back null when it shouldn't, fix the corresponding `extract*()` function in `src/parser.ts`. The TODO markers flag the most likely-fragile selectors. Re-run `npm run parse:one` until you're satisfied.

---

## Step 3 — Real scrape (~10–14 hours, mostly unattended)

```bash
npm run scrape
```

This is the long phase. Pacing is `DELAY_MIN`–`DELAY_MAX` seconds between each fetch (default 2–5s). At 3.5s average, 10k pages = ~10 hours. Add overhead for retries.

**Resume safety:**

The script writes state to `data/scrape-state.json` every 25 fetches. If you Ctrl+C, kill the terminal, lose power, whatever — just re-run `npm run scrape` and it picks up where it left off.

If a URL has already been written to `data/raw/`, it's auto-skipped. So you can also just delete `data/scrape-state.json` if you want to re-walk the queue — completed pages are still detected by file existence.

**Monitoring:**

In another terminal:

```bash
tail -f data/scrape.log              # live log
ls data/raw/ | wc -l                 # how many pages saved
du -sh data/raw/                     # disk used (~500MB at 10k pages)
```

**Watch for:**
- Many consecutive `FAIL`s in the log → Fragrantica is rate-limiting or has changed DOM. Stop, wait 24h, increase `DELAY_MIN/MAX` to 5/10s, then resume.
- Cloudflare challenges (HTML files that are tiny / contain "Just a moment...") → same: stop, wait, retry with longer delays. Consider a residential proxy if persistent.
- 429 status codes → definitely rate-limited. Stop immediately, wait 24h.

---

## Step 4 — Parse all (~10 min)

After Step 3 finishes:

```bash
npm run parse
```

Walks every `data/raw/*.html`, writes `data/parsed/*.json`. Decoupled from scrape so a parser bug = re-run this stage, not re-scrape.

---

## Step 5 — Vectorize (~5 min)

Build the canonical note dictionary (~500 most common notes) and add a `note_vector: number[500]` to every parsed fragrance.

```bash
npm run vectorize
```

Outputs `data/parsed/note_dictionary.json` and rewrites every fragrance JSON file with its vector.

---

## Step 6 — Upload (~10 min)

Push every parsed fragrance into Supabase via service-role key. Idempotent (upserts on `(name, house)`).

```bash
npm run upload
```

Watch:

```
[upload] uploaded 500 so far
[upload] uploaded 1000 so far
...
[upload] DONE — 10000 fragrances upserted
```

Verify in the Supabase dashboard → Table Editor → `fragrances` → row count should be ~10,000.

---

## Step 7 — Pre-compute similar pairs (~30 min)

Run the cosine-similarity pass that fills the `dupe_pairs` table (top-50 similars per fragrance).

```bash
npm run compute-dupes
```

10k × 10k = 100M pair comparisons; the script keeps only top-50 per fragrance (~500k rows) for fast O(1) lookup at request time. Single-threaded JS — expect ~20–40 min on a modern laptop.

---

## Or: do it all (after dry-run passes)

```bash
npm run all
```

= discover → scrape → parse → vectorize → upload → compute-dupes, in order. Use after you've validated the parser on a dry-run.

---

## Fallback: hand-curated queue.json (if discovery is hopeless)

If Cloudflare keeps blocking the headless browser and discovery refuses to work, you can hand-write a starter queue and proceed with the rest of the pipeline. This is good enough to get the app demoable while you figure out the discovery problem.

1. Open Fragrantica in your normal browser.
2. Walk a few popular brand pages (`/designers/Tom-Ford.html`, `/designers/Dior.html`, etc.) — these are static HTML and don't have the JS-button problem.
3. Right-click each fragrance card → Copy Link → paste into a text file.
4. Save the file as `scraper/data/queue.json` in this format:

```json
[
  "https://www.fragrantica.com/perfume/Tom-Ford/Tobacco-Vanille-1825.html",
  "https://www.fragrantica.com/perfume/Creed/Aventus-9828.html",
  "https://www.fragrantica.com/perfume/Dior/Sauvage-25179.html"
]
```

100 URLs is enough to validate the parser end-to-end. 500 is enough to make the app feel real for a demo. Once you have URLs in `queue.json`, skip Step 1 and start at `npm run scrape:dry`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Queue not found at data/queue.json` | Skipped Step 1 | `npm run discover` first |
| Parser returns mostly-null fields | Selectors stale | Edit `src/parser.ts`, run `npm run parse:one` to iterate |
| Many `FAIL` in scrape.log | Rate-limited / Cloudflare | Stop, wait 24h, increase `DELAY_MIN`/`DELAY_MAX` to 5/10 |
| Tiny HTML files in `data/raw/` (~5KB) | Cloudflare challenge page | Same as above, plus consider residential proxy |
| Browser hangs on `goto` | Slow page / network issue | Increase the 45s timeout in `scrapeOne()` |
| `compute-dupes` runs out of memory | Loading 10k × 500-dim vectors | Run on a machine with ≥8GB free RAM |
| Upload fails with `Database error: row has 24 columns but 22 were provided` | Schema drift between scraper and Supabase | Pull the latest `0001_initial_schema.sql`, push migration |

---

## After it's done

You should have, in Supabase:
- `fragrances`: ~10,000 rows with notes, scores, family, perfumer, bottle image
- `dupe_pairs`: ~500,000 rows (top-50 similars per fragrance)

Encyclopedia *content* (house history, wear guidance, note flavor descriptions) is NOT scraped — it's authored in `/editorial` and ingested separately. See `editorial/README.md`.

The app at `localhost:3000/scan` should now actually return matches.

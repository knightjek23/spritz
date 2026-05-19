# Cologne Scan — Scraper

> **PRIVATE.** This subproject scrapes a third-party site whose ToS prohibits scraping.
> It is gitignored from public release. Do not push to a public repo. Do not deploy to Vercel.

## What it does

Bootstraps the `fragrances` table with the top 10,000 most-popular fragrances from Fragrantica, plus a derived 500-dim weighted note vector per fragrance. Also pre-computes the top-50 dupes per fragrance into `dupe_pairs`.

See PRD §6 P0.11, §8, §9.

## Pipeline

```
src/scrape-fragrantica.ts   →  data/raw/<house>/<fragrance>.html
src/parser.ts               →  data/parsed/<house>/<fragrance>.json
src/note-vector.ts          →  data/parsed/note_dictionary.json + vectors in each .json
src/upload-to-supabase.ts   →  Supabase fragrances table
src/compute-dupe-pairs.ts   →  Supabase dupe_pairs table (top 50 per fragrance)
```

Each stage is independent — re-running a downstream stage doesn't require re-scraping. **Always store raw HTML separately** so a parser bug doesn't force a re-scrape (PRD §6).

## Setup

```bash
cd scraper
npm install
npx playwright install chromium
cp .env.example .env
# Fill in NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
```

## Run

```bash
# Scrape (long; expect 10–14h for 10k at safe pacing)
npm run scrape

# Parse raw HTML → JSON
npm run parse

# Build canonical note dictionary + vectorize
npm run vectorize

# Upload to Supabase (idempotent; upserts on (house, name))
npm run upload

# Pre-compute pairwise dupes
npm run compute-dupes

# Or: end to end
npm run all
```

## Hygiene (PRD Appendix B)

- Run from a residential IP, not a cloud VPS, to start.
- Rotate user agents (`src/scrape-fragrantica.ts` ships with a small pool — expand it).
- Random 2–5s delays between page loads.
- Scrape alphabetically by house, not by popularity rank, to look like a normal browse pattern.
- If the source returns 429 / Cloudflare, **stop**. Wait 24h. Reduce pacing.
- Never make this code public. Never credit the source in app UI.

## Troubleshooting

- **JS-heavy pages render blank.** Increase `page.waitForLoadState("networkidle")` timeout.
- **Note dictionary is too noisy.** Tune `normalizeNoteName()` in `note-vector.ts` to merge variants ("Bergamot", "bergamot oil", "Italian bergamot").
- **Dupe pre-compute is slow.** 10k × 10k = 100M pairs. Batch by 1k slices and use a worker pool. Output is top-50 per fragrance only (~500k rows).

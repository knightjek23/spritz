# Runbook: Re-vectorize + repopulate `dupe_pairs`

Run this when:
- The parser has improved (Vue rendering, three-strategy extractor, etc.) and existing rows have stale/empty note vectors
- New fragrances were scraped after the last `compute-dupes` run
- The "If you like this, explore" section is still backed mostly by the runtime pgvector fallback (migration 0003) and you want the fast `dupe_pairs` path to do the heavy lifting again

Total time: ~10-30 minutes depending on catalog size. None of these steps require Cloudflare evasion or a real browser, so they run fast.

---

## Pre-flight: how bad is it?

Open the Supabase SQL editor and run:

```sql
-- How many fragrances are in the catalog?
select count(*) as total from public.fragrances;

-- How many are missing a note_vector? These contribute nothing to dupe_pairs.
select count(*) as null_vectors
from public.fragrances
where note_vector is null;

-- How many dupe_pairs rows exist? Should be ~ (total - null_vectors) × 50.
select count(*) as dupe_pair_rows from public.dupe_pairs;
```

If `null_vectors` is more than ~5% of `total`, or `dupe_pair_rows` is well below `total × 30`, you need this runbook.

---

## Step 1 — Re-vectorize the parsed corpus

`note-vector.ts` reads every JSON file in `scraper/data/parsed/`, builds a canonical note dictionary (capped at 500 to match the `vector(500)` column), and writes a `note_vector` field back into each parsed JSON file. It does NOT touch Supabase yet.

```bash
cd scraper
npm run vectorize
```

**Expected output:**
```
[vectorize] dictionary: ~250-500 canonical notes
[vectorize] updated <N> fragrance files
```

**Sanity check:** open one of the files in `data/parsed/` and confirm a `note_vector` array of 500 numbers appears at the top level.

If it fails with "ENOENT data/parsed" — the parser hasn't run since the last scrape. Run `npm run parse` first.

---

## Step 2 — Upload re-vectorized rows to Supabase

`upload-to-supabase.ts` upserts every parsed JSON into `public.fragrances`, including the freshly computed `note_vector`.

```bash
npm run upload
```

**Expected output:**
```
[upload] DONE — <N> fragrances upserted
```

**Sanity check** in Supabase SQL editor:
```sql
select count(*) as null_vectors
from public.fragrances
where note_vector is null;
```

This number should drop dramatically (ideally to zero, or to just the rows that genuinely have no notes in the source).

---

## Step 3 — Recompute `dupe_pairs`

`compute-dupe-pairs.ts` pulls every fragrance row with a non-null `note_vector`, computes a weighted similarity score for each pair (70% note cosine, 20% family overlap, 10% season overlap), keeps the top 50 per source fragrance, **wipes the existing table**, and bulk inserts in 5k-row chunks.

```bash
npm run compute-dupes
```

**Expected output:**
```
[dupes] writing <N>×50 pairs…
[dupes] inserted 5000/<N>
[dupes] inserted 10000/<N>
…
[dupes] done
```

For 1000 fragrances, expect ~50k pairs and ~2 minutes. For 10k fragrances, expect ~500k pairs and ~15 minutes. The job is single-pass and memory-resident — no real risk of running out, but don't background it on a low-spec box.

**Sanity check:**
```sql
select count(*) as dupe_pair_rows from public.dupe_pairs;
-- should be roughly (count(*) with non-null note_vector) × 50

-- spot-check one fragrance has its 50 pairs
select count(*) from public.dupe_pairs
where fragrance_a = (select id from public.fragrances limit 1);
-- should be 50 (or close to it)
```

---

## Step 4 — Verify in the app

Reload any fragrance detail page → expand **"If you like this, explore"** → you should see 5 results within ~50ms. Hit a few different fragrances; if `dupe_pairs` is doing the work, results are stable across refreshes (the pgvector fallback can have minor ordering jitter because of `ivfflat` recall).

To explicitly confirm the fast path is winning: tail Vercel logs (or local dev console) while hitting the route. You should NOT see `[api/dupes] find_similar_fragrances RPC failed:` or any RPC-level activity — only the simple `dupe_pairs` select.

---

## Troubleshooting

**`note-vector.ts` says "0 fragrance files"** — `data/parsed/` is empty or the path doesn't resolve. From `scraper/`, run `ls data/parsed | head` to confirm. If it's empty but `data/raw/` is full, run `npm run parse` first.

**`upload-to-supabase.ts` 401/403** — wrong `SUPABASE_SERVICE_ROLE_KEY` in `scraper/.env`. The anon key won't work — uploads bypass RLS.

**`compute-dupe-pairs.ts` says "skipping, no note_vector"** for hundreds of rows — the upload step didn't refresh existing rows. Open one of those rows in Supabase Table Editor and check the `note_vector` column. If it's null, the corresponding parsed JSON probably has no notes (failed parse). Re-scrape and re-parse those specific URLs via `queue.json`.

**Job runs but the app still falls back to pgvector** — `dupe_pairs` is keyed by `fragrance_a`, not by both directions. If you query the route for a fragrance ID that's only ever a `fragrance_b`, you'll get no rows. The compute script writes both `(a, b)` and `(b, a)` by design, so if this is happening, check the bulk insert didn't error mid-flight.

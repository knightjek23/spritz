# Runbook: Backfill `bottle_image_url`

Run this when the search typeahead or detail pages are showing empty beige placeholder squares where bottle thumbnails should be. The cause is `fragrances.bottle_image_url` being `NULL` (or pointing at a fimgs.net URL that never got mirrored to Supabase Storage).

There are two distinct failure classes — they need different fixes. Diagnose first, then pick the right step.

---

## Step 0 — Diagnose

In the Supabase SQL editor:

```sql
-- Total catalog
select count(*) as total from public.fragrances;

-- Class A: row has a URL but it points at fimgs.net (not yet mirrored)
select count(*) as fimgs_unmirrored
from public.fragrances
where bottle_image_url like '%fimgs.net%';

-- Class B: row has no image URL at all
select count(*) as null_image
from public.fragrances
where bottle_image_url is null;

-- Spot-check a few of each class
select id, name, house, bottle_image_url
from public.fragrances
where bottle_image_url is null
limit 5;
```

- **Class A non-zero** → run **Step 1**. Cheap and automatic.
- **Class B non-zero** → run **Step 2**. Slower; requires either a re-upload of parsed JSON or a targeted re-scrape.

---

## Step 1 — Mirror fimgs.net URLs to Supabase Storage (Class A)

`mirror-images.ts` walks the whole catalog, skips rows that are already on a Supabase Storage URL, and downloads everything else into the `bottles` bucket, updating the row's `bottle_image_url` on success.

```bash
cd scraper
npm run mirror:images
```

**Expected output:**
```
[mirror] scanning page 0…
[mirror]   ✓ <house> / <name>  →  bottles/<uuid>.jpg
[mirror] scanning page 1…
…
[mirror] DONE — scanned <N>, mirrored <M>, skipped <S>, failed <F>
```

Throughput: ~3-5 images/sec depending on fimgs.net latency. For 1000 unmirrored rows, expect ~5 minutes.

**Sanity check:**
```sql
select count(*) as still_unmirrored
from public.fragrances
where bottle_image_url like '%fimgs.net%';
-- should be 0 (or close to it — failures get retried on the next run)
```

If any rows failed (network blip, 404, content-type mismatch), just re-run the command. The script is idempotent and skips rows already on Supabase Storage.

---

## Step 2 — Backfill rows with NULL image URLs (Class B)

These rows exist in Supabase but their parsed JSON either never had an image URL captured, or the upload happened before the parser was fixed.

### 2a. Confirm which scenario

The orphan IDs come from your Step 0 query. Cross-reference with the parsed JSON files:

```bash
cd scraper
# From the orphan ID, find its parsed file by name + house slug.
# Easiest path: grep the parsed corpus for one of the missing names.
grep -l "Tobacco Vanille" data/parsed/*.json | head -3
```

Open the matching JSON. Look for a `bottle_image_url` field at the top level.

- **Field present + non-empty** → parser is fine, upload is stale. Go to **Step 2b**.
- **Field missing or empty** → parser failed to capture this fragrance's image. Go to **Step 2c**.

### 2b. Stale upload — re-run upload only

```bash
npm run upload
```

This is the same `upload-to-supabase.ts` from the dupes runbook. It upserts every parsed JSON, so any rows where the parsed file has a `bottle_image_url` but the DB row doesn't will be brought into alignment.

After it finishes, return to **Step 1** to mirror the freshly-uploaded fimgs.net URLs onto Supabase Storage.

### 2c. Parser miss — targeted re-scrape

The source page wasn't a clean parse on the first pass. Build a small `queue.json` containing only the affected URLs:

```sql
-- In Supabase, get the Fragrantica URLs for orphan rows
select id, name, house, fragrantica_url
from public.fragrances
where bottle_image_url is null
  and fragrantica_url is not null
order by popularity_rank asc nulls last
limit 50;
```

Copy the URLs into `scraper/data/queue.json` (one URL per line in the array form expected by the scraper — see `SCRAPER_LAUNCH.md` for the schema). Then:

```bash
cd scraper
npm run scrape           # re-fetches HTML into data/raw/
npm run parse            # re-extracts into data/parsed/
npm run vectorize        # recomputes note vectors
npm run upload           # writes back to Supabase
npm run mirror:images    # downloads bottles to Supabase Storage
```

Don't run the full `npm run all` — that re-discovers from scratch. The `queue.json` route narrows scope to exactly the orphans.

---

## Verifying the fix in the app

1. Reload `/search`, type a query that previously had blank placeholders. Thumbnails should populate.
2. Hit a detail page for one of the formerly-orphan fragrances. The hero card should render the bottle.
3. Network panel: image requests should go to `*.supabase.co/storage/v1/object/public/bottles/...`, NOT to `fimgs.net`. The Next.js `Image` component is configured for both hosts via `next.config.mjs`, but Supabase Storage gives us cache control + zero risk of Fragrantica breaking links.

---

## When to give up on a fragrance

If a row's Fragrantica page genuinely doesn't have an image we can extract (deleted, geo-blocked, redirect loop, anti-bot page that doesn't yield even after the three-strategy parser), set `bottle_image_url` to a placeholder Supabase asset rather than leaving it `NULL`. The UI handles `NULL` gracefully, but a uniform fallback bottle image looks better than empty squares scattered through search results.

```sql
update public.fragrances
set bottle_image_url = 'https://<your-project>.supabase.co/storage/v1/object/public/bottles/_placeholder.png'
where id in ('<orphan-id-1>', '<orphan-id-2>', …);
```

Upload `_placeholder.png` to the `bottles` bucket manually once. Anything in the catalog that we genuinely can't source gets pointed at it.

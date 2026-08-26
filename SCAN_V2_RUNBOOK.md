# Scan v2 runbook: exact commands, in order

Run everything from Git Bash (or PowerShell; the commands are the same unless noted). Every step says what "good" looks like before you move on. Stop and tell me at the first step that doesn't.

Repo: `C:\Users\knigh\OneDrive\Documents\Fragrance APP`

---

## Step 0. Get the Voyage API key (5 minutes, browser)

Voyage AI is now part of MongoDB, and new keys are minted inside MongoDB Atlas. Two things to know before you click anything:

- **Free tier is generous and covers this whole project.** 200M text tokens and **150 billion image pixels** free per account. The entire Spritz catalog (~7k images at ~375×500) is ~1.9 B pixels, and each scan is ~0.8 M pixels. You will not pay for the visual layer for a very long time.
- **A payment method is what unlocks the normal rate limits** (Tier 1: 2,000 requests/min and 2M tokens/min for `voyage-multimodal-3.5`). The free tokens still apply after you add a card; the card is a rate-limit gate, not a charge. Without it, expect throttling during the backfill. Add it.

Steps:

1. Go to `https://www.mongodb.com/cloud/atlas/register?onboardingScenario=voyage` and sign up (or sign in if you already have an Atlas account). Atlas creates an organization and a project for you. You do **not** need to create a database cluster; ignore any prompt to deploy one.
2. In the left nav of your project, click **AI Model APIs** (under "Services").
3. Click **Model API Keys** → **Create model API key**. Name it `spritz-scan`. Click **Create**.
4. **Copy the key now.** Atlas won't show it again. It starts with `al-`.
5. Billing: Organization → **Billing** → add a payment method. (Rate limits only; see above.)

If you already have a key from the older `dashboard.voyageai.com`, it starts with `pa-` and works too. The code reads the prefix and routes `al-` keys to `ai.mongodb.com` and `pa-` keys to `api.voyageai.com` automatically. If either host ever changes, `VOYAGE_BASE_URL` in `.env.local` overrides it.

Where the key goes (three places, plain `KEY=value`, no quotes, no trailing comments):

- `.env.local` (app, dev): `VOYAGE_API_KEY=al-...`
- Vercel → Project → Settings → Environment Variables: `VOYAGE_API_KEY` for Production and Preview
- `scraper/.env` (the backfill script): `VOYAGE_API_KEY=al-...`

---

## Step 1. Install + typecheck (no keys needed)

```bash
cd "/c/Users/knigh/OneDrive/Documents/Fragrance APP"
npm install
npm run typecheck
cd scraper && pnpm install && cd ..
```

Good looks like: `npm install` adds `@vercel/functions`, `tsx`, `sharp`; `npm run typecheck` prints nothing and exits 0. If `sharp` fails to install on Windows, run `npm install --include=optional sharp` once.

PowerShell users: replace the first line with `cd "C:\Users\knigh\OneDrive\Documents\Fragrance APP"`.

---

## Step 2. Baseline numbers (Supabase SQL editor, not bash)

Paste into the Supabase SQL editor and save the output somewhere. This is what v2 has to beat.

```sql
select
  percentile_cont(0.5) within group (order by latency_ms) as p50_ms,
  percentile_cont(0.95) within group (order by latency_ms) as p95_ms,
  round(100.0 * count(*) filter (where matched_fragrance_id is not null) / greatest(count(*), 1), 1) as match_rate_pct,
  count(*) as scans
from scan_events
where created_at > now() - interval '30 days';
```

---

## Step 3. Phase 1 on its own (no new keys)

```bash
npm run dev
```

Open `http://localhost:3002/scan` on your phone (same Wi-Fi, or via the tunnel you normally use) and scan three bottles, plus upload one photo from the gallery.

Good looks like: the frozen frame shows a checklist that fills with the real house and name ("Read 'Dior · Sauvage'"), then "Found it. Opening …" and the detail page lands almost immediately. The detail page shows a small grey line under the bottle: "Matched from your scan by label text." Gallery uploads are noticeably faster than before.

If a scan resolves in under ~300 ms you won't see the checklist at all. That's intended.

---

## Step 4. Push the migration

```bash
npm run db:migrate
```

Good looks like: `0023_scan_v2_visual_layer.sql` listed as applied. If `supabase` asks you to link the project first: `npx supabase link --project-ref <your-ref>` then rerun.

Then in the Supabase dashboard, one-time: **Storage → New bucket → name `scan-images` → Private → Create.** (Only used by the Phase 3 web fallback, but do it now so enabling Phase 3 later is just an env flag.)

---

## Step 5. Add the Voyage key

Edit `.env.local` and `scraper/.env`, add the line `VOYAGE_API_KEY=al-...` to each. Add it to Vercel too.

Confirm the scraper can see it:

```bash
cd scraper
grep VOYAGE_API_KEY .env
```

Good looks like: one line, starts with `VOYAGE_API_KEY=al-`, nothing after the key.

---

## Step 6. Backfill the embeddings (from `scraper/`)

```bash
pnpm embed:images --dry --limit=20
```

Good looks like: `[embed] model=voyage-multimodal-3.5 source=catalog … (DRY RUN)` and a few `[dry] catalog <uuid> https://fimgs.net/...` lines. Nothing written.

```bash
pnpm embed:images --limit=20
```

Good looks like: `embedded=20 failed=0` at the end and a coverage line. If you see `voyage HTTP 401`, the key is wrong or has a stray character. `voyage HTTP 429` means rate-limited: add the payment method (Step 0) or set `EMBED_CONCURRENCY=1`.

```bash
pnpm embed:images
```

Full catalog. A few minutes. The last line is coverage, e.g. `coverage: 6900 of 7113 fragrances with an image have a vector`. If coverage is far below the total, scroll up for `HTTP 404` / `fetch failed` lines before trusting the visual layer. Re-running only retries what failed.

Later, whenever you approve user photos in `fragrance_photos`:

```bash
pnpm embed:images --source=user_photo
```

```bash
cd ..
```

---

## Step 7. Confirm the visual layer is live

```bash
npm run dev
```

Scan a bottle with the label turned away from the camera.

Good looks like: the checklist says "Couldn't read the label clearly. Going by the bottle's shape and color instead" → "Comparing the bottle's shape and color across the whole Library" → either "Found it" or a picker whose rows say "by bottle shape". If instead you get "Couldn't place this one yet" with no candidates every time, check the dev-server log for `match_bottle_images failed` (migration not pushed) or `[image-embed]` warnings (key/host problem).

---

## Step 8. Build the eval set (your phone + 10 minutes)

```bash
mkdir -p eval/scans
```

Put ~30 photos in `eval/scans/` (any size, any names). Mix: good light, bad light, a few flankers (Sauvage EDT vs EDP vs Elixir, Bleu de Chanel EDT vs Parfum), and at least 5 with the label hidden.

Create `eval/scans/labels.csv`:

```csv
file,house,name
IMG_0001.jpg,Dior,Sauvage Eau de Parfum
IMG_0002.jpg,Creed,Aventus
IMG_0003.jpg,Chanel,Bleu de Chanel Parfum
```

Use the house and name as they appear in the Library (search the app if unsure). The harness resolves each row to a catalog id and tells you which ones it couldn't; those are excluded, never silently counted as misses.

`eval/` is gitignored.

---

## Step 9. Run the eval

```bash
npm run eval:scan -- --json=eval/scan-eval.json
```

Takes a few minutes (4 models × 30 photos, plus the visual pass). Read the output like this:

```
[ocr] gpt-4o          top-1  93%  auto-match  87% (wrong: 0)  null-read 2  p50 2100ms  p95 3900ms  ~$0.0021/scan
[ocr] gpt-4.1-mini    top-1  93%  auto-match  87% (wrong: 0)  null-read 2  p50  900ms  p95 1700ms  ~$0.0004/scan
[ocr] gpt-5.4-mini    top-1  90%  auto-match  83% (wrong: 1)  ...
[ocr] gpt-5-nano      top-1  77%  ...
[visual] voyage  top-1 74%  top-5 96%  no-result 0  p50 380ms  p95 610ms
[visual] cosine when top-1 CORRECT: p10 0.812  p50 0.887   when WRONG: p50 0.702  p90 0.781
[visual] margin over #2: p50 0.061  p10 0.018
[fused]  text(gpt-4o) + visual, weight 0.6: top-1 96%
```

Decision rules:

- **OCR model:** the fastest row within 2 points of gpt-4o's top-1 **and** with `wrong:` not higher than gpt-4o's. In the example that's gpt-4.1-mini. Set in `.env.local` and Vercel:
  ```
  SCAN_OCR_MODEL=gpt-4.1-mini
  ```
  If the winner is gpt-5.4-mini, also set `SCAN_OCR_REASONING=none`.
- **Visual thresholds:** `SCAN_VISUAL_AUTOMATCH` = just above the WRONG p90 (example: `0.80`); `SCAN_VISUAL_CEIL` = near the CORRECT p50 (`0.89`); `SCAN_VISUAL_FLOOR` = near the WRONG p50 (`0.70`). Set those three in `.env.local` and Vercel.
- **Kill check:** if `[visual] top-1` is under ~70%, stop here and tell me. That's the signal to switch to a vision-only model, not to tune thresholds.

Rerun once with the new env to confirm `[fused] top-1` is at or above the text-only top-1:

```bash
npm run eval:scan -- --json=eval/scan-eval-2.json
```

---

## Step 10. Commit and deploy

```bash
git add -A
git status
```

Check the list: it should be the scan v2 files plus `package.json`, `package-lock.json`, `scraper/package.json`, `scraper/pnpm-lock.yaml`, `.gitignore`. Nothing from `eval/` or `_to_delete/`.

```bash
git commit -m "Scan v2: streamed checklist, image prep, bottle-embedding visual layer, eval harness"
git push
```

Vercel deploys on push. Make sure these are set in Vercel before the deploy finishes: `VOYAGE_API_KEY`, `SCAN_OCR_MODEL`, the three `SCAN_VISUAL_*` values, and `SCAN_OCR_REASONING` if you picked a gpt-5.x model.

Delete the stray folder whenever: `_to_delete/` (one empty test file, gitignored).

---

## Step 11 (later, optional). Phase 3 web fallback

Only after two weeks of watching the miss rate. Sign up at `https://serpapi.com` (250 free searches/month; $25/mo for 1,000). Then in `.env.local` and Vercel:

```
SCAN_WEB_FALLBACK=true
SERPAPI_API_KEY=...
SCAN_WEB_DAILY_BUDGET=100
```

Watch spend with:

```sql
select count(*) from scan_events where web_lookup and created_at > now() - interval '1 day';
```

---

## Step 12. Two weeks in: are the thresholds right?

```sql
select match_method, count(*),
       round(avg(latency_ms)) as avg_ms,
       percentile_cont(0.95) within group (order by latency_ms) as p95_ms
from scan_events
where created_at > now() - interval '14 days'
group by 1 order by 2 desc;
```

Compare `p95_ms` to Step 2. Send me the table and I'll re-fit the thresholds from `scan_events.candidates`.

# Scan v2 design: faster, transparent, and bottle-aware

Status: **approved 1–6 by Josh on 2026-08-25; Phases 1–3 implemented, see the implementation log at the bottom**
Date: 2026-08-25
Scope: `app/api/scan/route.ts`, `lib/vision.ts`, `app/scan/page.tsx`, `components/camera-capture.tsx`, one new migration, one new backfill script, one eval harness.

---

## 0. The decisions I need from you

1. **Streaming stages + Dynamic Checklist** as the wait UI (section 3). Yes/no.
2. **OCR model swap is eval-gated, not blind.** I build the harness; you run it on ~30 of your own bottle photos; we flip `SCAN_OCR_MODEL` to whichever fast model matches gpt-4o accuracy. Candidates: `gpt-4.1-mini`, `gpt-5.4-mini` (reasoning off), `gpt-5-nano`. Yes/no.
3. **Visual layer = image embeddings in pgvector, provider Voyage `voyage-multimodal-3.5`** (section 4). Alternative is Cohere Embed v4. Pick Voyage unless you object.
4. **Embed the fimgs.net-hotlinked catalog images now, tagged by source so they can be purged in one statement later.** This is derived data (a vector), not a display or a copy, so it's lower exposure than the mirror bucket you already built. Still your call; the fully clean alternative is to embed only affiliate-fed + approved user photos, which today is a small fraction of the catalog.
5. **Google Lens fallback (via SerpApi) as Phase 3, flag-gated, off by default.** This is the "outside of Spritz" reference. It sends the user's photo to a third party, so it needs a privacy-policy line. Approve the phase, not the launch.
6. **Retire the GPT-4o "look at 6 images" disambiguation as the primary visual step.** It stays as a narrow tiebreaker (2-3 images, 6s cap) only when text + embeddings still can't separate same-house variants (Sauvage EDT vs EDP vs Elixir). Yes/no.

If you reply "approve 1-6" I start Phase 1 immediately. Anything you strike, I drop.

---

## 1. Where the time goes today

Pipeline as built (`app/api/scan/route.ts`): parse body → users lookup → rate-limit query → **GPT-4o OCR** → `search_fragrances` RPC → (if 0.40 ≤ top < 0.85 and ≥2 candidates have images) **GPT-4o visual disambiguation with 1 + 5 images** → `scan_events` insert → JSON → client `router.push('/fragrance/[id]')`.

No latency telemetry beyond `scan_events.latency_ms`, so these are engineering estimates. Run `select percentile_cont(0.5) within group (order by latency_ms), percentile_cont(0.95) within group (order by latency_ms) from scan_events where created_at > now() - interval '30 days'` to get the real number before we start; I want a baseline to beat.

| Step | Est. cost | Why it's slow / what's wrong |
| --- | --- | --- |
| Gallery upload | 1–6 s on cellular | `handleFile` in `camera-capture.tsx` sends the file **at full resolution**. A 12 MP phone JPEG is 3–5 MB → 4–7 MB base64. The camera path is capped at 1280×720, the gallery path isn't. |
| Cold start | 0.5–1.5 s | Node runtime + `openai` SDK. Not fixable outside of keeping the function warm; fluid compute helps. |
| users + rate limit | 0.2–0.4 s | Two sequential Supabase round trips before any AI work starts. |
| GPT-4o OCR, `detail: auto` | 2–5 s | Full gpt-4o for two words. **SDK defaults are `timeout: 10 min, maxRetries: 2`**, so one slow OpenAI response silently becomes three attempts inside the 45 s `maxDuration`. This is the likeliest cause of the "takes forever" scans. |
| `search_fragrances` RPC | 0.1–0.3 s | Fine. |
| GPT-4o disambiguation | 4–8 s, sometimes a timeout | OpenAI must fetch 5 remote catalog URLs (mostly fimgs.net, which is slow and referrer-sensitive). Same missing timeout problem. |
| `scan_events` insert | ~0.1 s | Sequential, blocks the response. |
| `router.push` to detail page | 0.3–2 s | ISR page; first hit on a not-yet-cached fragrance is a full SSR + Supabase pass. Nothing is prefetched. |

The user sees one pulsing line ("Reading the label…") for the entire 4–15 s. That's the trust problem: they can't tell a hard bottle from a hung request.

**Target after v2:** p50 ≤ 3 s photo-to-decision, p95 ≤ 7 s, detail page visible within ~0.5 s of the decision. PRD P0.1 says 5 s; we're aiming under it.

---

## 2. Speed plan (Phase 1, no new infra)

Ordered by payoff.

**2.1 Client-side normalize every image before upload.** One helper `lib/image-prep.ts` (client): decode → longest edge 1024 px → JPEG q0.8 → base64. Applies to both camera and gallery paths. Payload drops to ~120–250 KB for every scan. At 1024 px, `detail: "high"` costs ~765 image tokens, so there's no accuracy reason to send more; `auto` already resolves to high at this size.

**2.2 Hard timeouts and no silent retries on every OpenAI call.** Construct the client with `timeout` and `maxRetries: 1`, and pass per-call `timeout`: OCR 9 s, tiebreaker 6 s. A timed-out OCR becomes an honest, fast error ("the label reader didn't answer in time") instead of a 30 s stall.

**2.3 Parallelize what's independent.** `users` lookup and the anonymous-IP rate check run concurrently; the signed-in rate check still waits on the user id (it needs it). The embedding call (Phase 2) starts at t=0 alongside OCR, so the visual layer adds ~0 wall-clock.

**2.4 Log after responding.** Generate the `scan_events` id up front (`crypto.randomUUID()`), return it immediately, insert via `waitUntil` from `@vercel/functions` (works on Next 14 on Vercel; local dev falls back to a plain await). `ReportMiss` keeps working because it already has the id.

**2.5 Prefetch the destination while the server is still deciding.** Because the response is streamed (section 3), the client gets the candidate list ~1 s before the final decision and calls `router.prefetch('/fragrance/[id]')` on the top 3. The final `router.push` lands on a warm route. This is the single biggest *perceived* win.

**2.6 OCR model swap, gated by the eval harness.** `SCAN_OCR_MODEL` is already env-driven. Today's pricing (Aug 2026): gpt-4o $2.50/M in; gpt-4.1-mini $0.40; gpt-5-mini $0.25; gpt-5.4-mini $0.75 (OpenAI says "more than 2x faster" than its predecessor; supports `reasoning_effort: "none"`); gpt-5-nano $0.05. The harness (`scripts/scan-eval.ts`, runs on your machine because the sandbox can't reach OpenAI or your Supabase) takes a folder of photos + `labels.csv` (`file,fragrance_id`) and reports top-1 accuracy, p50/p95 latency, and cost per config. We flip to the fastest config that is within 2 points of gpt-4o's accuracy. I will not pick the model on vibes; label OCR on refractive glass is exactly where small models fall over.

**2.7 Tighten the GPT-4o tiebreaker** (keep, don't kill, per decision 6): fires only when the fused top-2 are within 0.05 of each other *and* share a house, sends at most 3 candidate images, 6 s cap, and streams its own stage line so the user knows why the extra second is happening.

**2.8 Minor:** `export const preferredRegion` on the route set to your Supabase region; `max_tokens` on OCR down to 120.

---

## 3. Transparency: Dynamic Checklist driven by real server stages

Per the ai-transparency-patterns rule: pick the container by stakes, then write copy as *Action word + specific item + limit*. A scan is multi-step with unpredictable timing, and the stakes are moderately high (a wrong ID poisons notes, dupes, and the Buy link that follow). That's the **Dynamic Checklist**, with a **Partial Success** layout and a small **Audit Trail** receipt afterwards. Tone: precise but warm; no "thinking hard" cuteness.

### 3.1 Wire protocol

`POST /api/scan` with `Accept: application/x-ndjson` returns a streamed NDJSON body from the Node runtime (`ReadableStream`, one JSON object per line). Without that header it returns the existing single JSON `ScanResult`, so the Capacitor shell and any old client keep working.

Frames, in order (fields beyond `type` are optional):

```
{"type":"stage","stage":"reading"}
{"type":"stage","stage":"read","brand":"Dior","name":"Sauvage","ok":true}
{"type":"stage","stage":"matching","name":"Sauvage","catalog_size":7113}
{"type":"candidates","items":[{"id":"…","name":"Sauvage Eau de Parfum","house":"Dior","image":"…"}, …]}   ← client prefetches these
{"type":"stage","stage":"comparing","house":"Dior"}
{"type":"stage","stage":"deciding"}                         ← only if the tiebreaker fires
{"type":"result", …ScanResult…}                             ← always the last frame
```

Errors are also frames (`{"type":"error","code":"ocr_timeout"}`), so the client never has to parse a half-written body. `ScanResult` gains `match_method: "text" | "visual" | "text+visual" | "tiebreak" | "none"` and per-candidate `text_score` / `visual_score`.

### 3.2 Copy (the actual strings)

Checklist rows, each filled with real data the moment the server has it. Rows appear only once their stage starts; nothing is shown for waits under 300 ms.

| Stage | Line |
| --- | --- |
| reading | **Reading the label** for the house and fragrance name |
| read (ok) | Read **“Dior · Sauvage”** |
| read (fail) | Couldn't read the label clearly. **Going by the bottle's shape and color instead.** |
| matching | **Matching “Sauvage”** against 7,113 fragrances in the Library (count fetched once and cached for an hour, never hardcoded) |
| comparing (house known) | **Comparing the bottle's shape and color** with Dior's bottles |
| comparing (house unknown) | **Comparing the bottle's shape and color** across the whole Library |
| deciding | Two close matches. **Checking the cap and label layout** to separate them |
| result: matched | **Found it.** Opening Sauvage Eau de Parfum |
| result: candidates | **Close, but not certain.** Pick the one in your hand |
| result: none | **Couldn't place this one yet.** Search by name or tell us what it is |

Partial success (OCR failed, visual matched): the result page shows *"Label unreadable, but the bottle shape matches Sauvage Eau de Parfum (91%)."* with the candidate list one tap away, so a confident-looking wrong answer is never a dead end.

Tool failure copy (name the real cause, keep trust in the app): *"The label reader didn't answer in time. Your photo is fine. Try once more."* / *"We couldn't reach the Library just now. Try again in a moment."* Never the raw `scan_failed` slug.

### 3.3 Audit trail

After a match, navigate to `/fragrance/[id]?scan=<event_id>`. The detail page shows a one-line receipt under the hero: *"Matched from your scan by label text + bottle shape · Not it? See 4 other close matches."* The link reopens the picker from the stored candidates. This is the persistent "why" for the person who tapped, looked away, and came back to a page they don't trust. Storing candidates on `scan_events` (section 4.3) is what makes it possible.

### 3.4 UI mechanics

Overlay on the frozen frame in `CameraCapture`: three to four rows, completed rows get a check, the current row a gentle pulse, pending rows dimmed. Each row holds for at least 400 ms so fast stages don't flicker. `prefers-reduced-motion` drops the pulse. On the picker page, candidates get bottle thumbnails (`BottleImage`) since the visual layer makes "which of these is in my hand" a visual question.

---

## 4. Visual layer (Phase 2): bottle shape and color as a first-class signal

### 4.1 Why embeddings, not "ask GPT to look at pictures"

The current Layer 1b sends the user photo plus five catalog URLs to GPT-4o and asks it to pick. It's slow (5–8 s), fetches fimgs.net at request time, and only fires when text is already ambiguous. It can never help when OCR returns nothing.

Instead: precompute one vector per catalog bottle image, store in pgvector (already installed for `note_vector`), and at scan time embed the user photo once (~300–500 ms, in parallel with OCR) and run a cosine kNN. This gives a shape/color signal on **every** scan for a fraction of a cent, and it works when the label is unreadable.

### 4.2 Provider

**Voyage `voyage-multimodal-3.5`** (released Jan 2026): 1024-dim default, base64 image input, official `voyageai` npm package, $0.60 per billion pixels with a **150 B-pixel free tier**. A 512×512 catalog image is 262 k pixels, so the whole 7,113-row catalog is ~1.9 B pixels ≈ $1.12, i.e. free. Per scan (1024×768 user photo) ≈ $0.0005. Cohere Embed v4 (1536-dim, $0.47/M tokens, ~1,610 tokens per 512² image) is the fallback provider if Voyage's rate limits or latency disappoint; the adapter is one file (`lib/image-embed.ts`) so swapping is a config change plus a re-run of the backfill.

Known limitation, stated up front: cross-modal (CLIP-style) models are better at "this is a perfume bottle" than at "this is *that* bottle." Two mitigations are built in: the house filter (4.4) collapses the search space to a few dozen bottles whenever OCR gets the house, and the score is fused with text rather than trusted alone. If the eval shows visual-only top-1 below ~70% on the OCR-fail set, Plan B is a vision-only model (DINOv2 / SigLIP-2) self-hosted on Modal. The `model` column on the table exists so that re-embedding is a script re-run, not a migration.

### 4.3 Schema (migration `0023_bottle_image_embeddings.sql`)

```sql
create table public.bottle_image_embeddings (
  id            uuid primary key default gen_random_uuid(),
  fragrance_id  uuid not null references public.fragrances(id) on delete cascade,
  source        text not null check (source in ('catalog','affiliate','user_photo')),
  image_url     text not null,
  model         text not null,              -- 'voyage-multimodal-3.5'
  embedding     vector(1024) not null,
  created_at    timestamptz default now(),
  unique (fragrance_id, image_url, model)
);
create index on public.bottle_image_embeddings using hnsw (embedding vector_cosine_ops);
create index on public.bottle_image_embeddings (fragrance_id);

-- RPC: match_bottle_images(query vector(1024), p_limit int, p_house text default null)
-- returns fragrance_id, best similarity (max over that fragrance's images), house, name, bottle_image_url.
-- p_house applies `f.house ilike p_house` when non-null.

alter table public.scan_events
  add column match_method text,
  add column candidates   jsonb,            -- [{fragrance_id, text_score, visual_score, fused}]
  add column visual_provider text;
```

One row per image, not per fragrance, on purpose: approved user photos from `fragrance_photos` (migration 0020) get embedded too, and those are *real* photos of *real* bottles in hands, the exact domain a user scan lives in. That turns the moderation queue you already built into training data for the scanner. Purging the hotlinked set later is `delete from bottle_image_embeddings where source = 'catalog'`.

### 4.4 Scoring

Let `T` = trigram `match_score` from `search_fragrances` (0–1), `V` = cosine similarity from `match_bottle_images` (0–1), computed over the union of the top 5 text candidates and the top 5 visual candidates (missing side = 0).

1. **Confident text:** `T ≥ 0.85` and visual either agrees or has nothing strongly contradicting (`V_top` for a *different* fragrance < 0.92) → match, `text`.
2. **Ambiguous text:** `0.40 ≤ T_top < 0.85` → `fused = 0.6·T + 0.4·V`; match if `fused_top ≥ 0.75`, `text+visual`.
3. **No text:** OCR returned nulls or no candidates → match if `V_top ≥ 0.90` and `V_top − V_second ≥ 0.05`, `visual`. Otherwise return the visual top 5 as the picker with thumbnails.
4. **Tiebreaker:** top-2 fused within 0.05, same house, both have images → GPT-4o with ≤3 images, 6 s cap, `tiebreak`.

House filter: when OCR returns a brand and `search_fragrances` puts that house in its top candidates, the visual kNN runs scoped to that house (`p_house`). That's where shape matters most and where labels are least helpful: flankers and concentrations share a name and differ by bottle.

All four thresholds start at these values and are **calibrated on the eval set**, not hand-tuned in production. Every scan writes `T`, `V`, `fused`, and `match_method` to `scan_events.candidates`, so a month in we can re-fit them from real traffic.

### 4.5 Backfill script

`scraper/src/embed-bottle-images.ts` (`pnpm embed:images`), same shape as `mirror-images.ts` after its rewrite: keyset pagination on `fragrances.id`, `--dry`, `--limit=N`, `--source=catalog|user_photo`, `EMBED_CONCURRENCY`, resumable (`left join … where e.id is null`), placeholder-URL skipping using the scraper's own `image-clean.ts` copy (the scraper is a separate ESM package; no cross-package imports). Downloads the image server-side (the mirror script already proved fimgs fetches work from your machine), resizes to 512 px with `sharp` (new dev dependency in `scraper/`), embeds, upserts. Runs on your machine, not the sandbox.

### 4.6 Legal note

A 1024-float vector is not a copy or a display of the image, and nothing in it is shown to users, so this is materially lower exposure than the mirror bucket. It is still derived from images you don't hold rights to, which is why every row carries `source` and why affiliate-fed and user-photo rows should replace catalog rows as they arrive. I'm not a lawyer; this is a risk framing, not advice.

---

## 5. Outside Spritz (Phase 3): Google Lens fallback

When both layers fail (no text match, no confident visual match), the only remaining source of truth is the open web. Google Lens has no official API; SerpApi's Google Lens engine accepts an uploaded image and returns `visual_matches` and `exact_matches` with page titles in ~2.75 s (their example), at $0.01–0.025 per search depending on plan (250/month free). Flow: upload → take the top ~10 titles → extract brand/name with the same fuzzy match we already use for trending feeds (`lib/trending/join.ts` deterministic name+house lookup, then `search_fragrances`) → if it lands a candidate ≥ 0.85, return it as `match_method: "web"`, otherwise use the best title as a better `detected_name` for the catalog-gap report.

Gates: env `SCAN_WEB_FALLBACK=true`, signed-in users only, counts double against the rate limit, its own daily budget. Needs a privacy policy sentence ("if we can't identify a bottle, we may send the photo to a visual-search provider"). I'd ship Phases 1 and 2, watch the miss rate for two weeks, then decide whether Phase 3 earns its cost. It's also the cleanest source of "what did the user actually scan" for the scraper queue.

---

## 6. Phasing, effort, and what I can't do from here

| Phase | Contents | Effort | Needs you for |
| --- | --- | --- | --- |
| 1 | Image prep, timeouts, waitUntil, NDJSON stages, Dynamic Checklist UI, prefetch, scan receipt, eval harness | ~1.5 days | Run the eval on ~30 photos; flip `SCAN_OCR_MODEL` |
| 2 | Migration 0023, `lib/image-embed.ts`, `match_bottle_images` RPC, fusion scoring, backfill script, picker thumbnails, user-photo embedding on approval | ~2 days | Voyage API key, `supabase db push`, run `pnpm embed:images` on your machine |
| 3 | SerpApi Lens fallback, flag-gated | ~0.5 day | SerpApi key, privacy policy line, decision to enable |

Sandbox constraints (same as every Spritz session): no network to OpenAI, Voyage, or your Supabase, so I write and typecheck code, you run the backfill, the eval, and `db push`. Runbook lines for each will be at the bottom of `SCAN_V2_DESIGN.md` once code lands. Git stays in your terminal.

Per-scan cost after v2: OCR $0.0006–0.003 depending on the eval winner (vs ~$0.003–0.01 today), embedding ~$0.0005, tiebreaker ~$0.02 on the small fraction of scans that need it, Lens $0.01–0.025 only on the residual misses.

## 7. What this does not change

The PRD §7 stance that pure shape recognition is rejected still holds: text remains the primary signal and shape is fused in, not swapped in. Rate limits, the global daily budget, `ReportMiss`, and the `ScanResult` JSON contract for non-streaming clients are untouched.

---

# Implementation log + runbook (2026-08-25)

Status: **all six decisions approved; Phases 1–3 written and typechecked.** Everything below the line is what landed and what's left for your hands.

## What changed

| Area | Files | Notes |
| --- | --- | --- |
| Stage protocol + copy | `lib/scan-stages.ts` (new) | Frame types, every checklist string, error copy, receipt labels. Shared by server and client. |
| Client image prep | `lib/image-prep.ts` (new), `components/camera-capture.tsx` | Both camera and gallery paths normalize to ≤1024 px JPEG q0.8 before upload. Gallery photos used to go up untouched. |
| Dynamic Checklist | `components/scan-checklist.tsx` (new), `app/globals.css` | Rows driven by real server frames; 300 ms hold before showing anything, ≥400 ms per row, reduced-motion aware. |
| Scan page | `app/scan/page.tsx` | Streams NDJSON, prefetches top-3 candidate pages the moment they're known, pushes with `?scan=<event>`; picker has bottle thumbnails and names partial success ("label wasn't readable, so these are the bottles whose shape and color come closest"); `?event=<id>` reopens a past picker. |
| Route | `app/api/scan/route.ts` | Rewritten. NDJSON stream on `Accept: application/x-ndjson`, JSON otherwise. Embedding runs in parallel with OCR. Fusion rules §4.4. Tiebreaker narrowed (same house, ≤3 images, 6 s). Web fallback flag-gated. `scan_events` insert after the response via `waitUntil`. |
| Vision | `lib/vision.ts` | `timeout` + `maxRetries: 1` on the client and per call; gpt-5.x support (`max_completion_tokens`, `reasoning_effort`); OCR overrides + token usage for the eval; tiebreaker capped at 3 images. |
| Visual layer | `lib/image-embed.ts` (new), `supabase/migrations/0023_scan_v2_visual_layer.sql` (new), `scraper/src/embed-bottle-images.ts` (new), `lib/supabase/database.types.ts` | Voyage adapter over fetch (no SDK dep). Table + HNSW + `match_bottle_images(p_embedding, p_limit, p_house)` + `count_embedded_fragrances`. Backfill script: keyset paged, resumable, `--dry/--limit/--source/--refresh`, batches of 8, reports coverage. |
| Audit trail | `app/api/scan/[id]/route.ts` (new), `components/scan-receipt.tsx` (new), `app/fragrance/[id]/page.tsx` | GET returns stored candidates; receipt renders client-side only when `?scan=` is present so ISR HTML is unchanged. |
| Web fallback | `lib/web-lookup.ts` (new), `app/legal/privacy/page.tsx` | SerpApi Lens via a signed URL on a private `scan-images` bucket, object deleted after. Privacy policy names Voyage and SerpApi. |
| Eval | `scripts/scan-eval.ts` (new), `package.json` (`eval:scan`, `tsx`, `sharp`, `@vercel/functions`) | Per-model OCR top-1 / auto-match / wrong-auto / p50 / p95 / $ per scan; visual top-1/top-5 with cosine distributions for correct vs wrong; fused top-1. Excludes unresolved labels explicitly. |

Deliberately not done from the plan: §2.3's users/rate-limit parallelization (the signed-in path needs the user id first, and the anonymous path is one query; saving ~100 ms wasn't worth a second code path) and §2.8's `preferredRegion` (I don't know your Supabase region; add `export const preferredRegion = "<region>"` to the route yourself if the two are far apart).

Verified in the sandbox: `tsc --noEmit` clean on every touched file; a mocked end-to-end run of the route covering confident text, visual flip to a flanker, ambiguous → picker, label-unreadable (confident and weak), nothing, OCR timeout (stream + JSON), tiebreaker, and the web fallback (miss and hit). Not verified here: a real browser render of the checklist, real model latency, real cosine ranges. Those are the runbook.

## Runbook (your machine)

1. **Install + typecheck.**
   ```
   npm install            # adds @vercel/functions, tsx, sharp
   npm run typecheck
   cd scraper && pnpm install && cd ..
   ```
2. **Baseline, before anything else.** In the Supabase SQL editor:
   ```sql
   select percentile_cont(0.5) within group (order by latency_ms) as p50,
          percentile_cont(0.95) within group (order by latency_ms) as p95,
          count(*) filter (where matched_fragrance_id is not null)::float / count(*) as match_rate
   from scan_events where created_at > now() - interval '30 days';
   ```
3. **Phase 1 on its own first** (no new keys needed). `npm run dev`, scan a few bottles at localhost:3002. You should see the checklist rows fill with the real house/name, and the detail page should land near-instantly after "Found it." Gallery uploads should feel dramatically faster on a phone. If the checklist never appears on a fast scan, that's the 300 ms rule working.
4. **Migration.** `npm run db:migrate` (pushes 0023). Then in the dashboard: Storage → New bucket → `scan-images` → **Private** (only needed for Phase 3, but do it now so the flag flip later is just env).
5. **Voyage key.** https://dash.voyageai.com → API key → `VOYAGE_API_KEY` in `.env.local`, Vercel, and `scraper/.env` (plain `KEY=value`).
6. **Backfill.** From `scraper/`:
   ```
   pnpm embed:images --dry --limit=20
   pnpm embed:images --limit=20
   pnpm embed:images                    # ~7k images, a few minutes, inside the free tier
   pnpm embed:images --source=user_photo # whenever you approve photos
   ```
   The last line of output is coverage ("N of M fragrances with an image have a vector"). If it's far below M, look at the HTTP errors above it before trusting the visual layer.
7. **Eval set.** Make `eval/scans/`, drop ~30 photos in, write `labels.csv` (`file,house,name`). Include flankers and 5+ with the label hidden. Then:
   ```
   npm run eval:scan -- --json=eval/scan-eval.json
   ```
   Pick the OCR model: fastest one within 2 points of gpt-4o top-1 **and** with no more wrong auto-matches. Set `SCAN_OCR_MODEL` (+ `SCAN_OCR_REASONING=none` for gpt-5.4-mini). Set `SCAN_VISUAL_AUTOMATCH` just above the wrong-p90 cosine, `SCAN_VISUAL_CEIL` near the correct-p50, `SCAN_VISUAL_FLOOR` near the wrong-p50. Re-run to confirm fused top-1 ≥ text-only top-1. If visual-only top-1 is under ~70%, stop and tell me; that's the Plan B trigger (vision-only model), not a threshold problem.
8. **Phase 3 (optional, later).** SerpApi key → `SERPAPI_API_KEY`, `SCAN_WEB_FALLBACK=true`. Watch `select count(*) from scan_events where web_lookup and created_at > now() - interval '1 day'` against `SCAN_WEB_DAILY_BUDGET`.
9. **Git** (your terminal, not the sandbox):
   ```
   git add -A && git commit -m "Scan v2: streamed checklist, image prep, bottle-embedding visual layer, eval harness"
   ```
   Note `eval/scans/` should be gitignored (photos + labels are yours, not the repo's).

## Env reference

See the "Vision" block in `.env.example`. Nothing new is required for Phase 1; `VOYAGE_API_KEY` turns on Phase 2; `SCAN_WEB_FALLBACK=true` + `SERPAPI_API_KEY` turn on Phase 3. With no Voyage key the route behaves exactly like Phase 1 (fused == text), so it's safe to deploy before the backfill.

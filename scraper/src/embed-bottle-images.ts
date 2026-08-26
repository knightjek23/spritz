// Embed bottle images into bottle_image_embeddings — scan v2 visual layer.
//
// One vector per IMAGE (SCAN_V2_DESIGN.md §4.3). Sources:
//   catalog     fragrances.bottle_image_url (mostly fimgs.net hotlinks today;
//               tagged so they can be purged in one statement later)
//   affiliate   same column once backfill:images has replaced a row with a
//               licensed feed image (detected by URL host, see isAffiliate)
//   user_photo  fragrance_photos rows with status='approved' — real bottles
//               in real hands, the exact domain a scan lives in
//
// Provider: Voyage voyage-multimodal-3.5 (1024-dim). Images are sent as
// base64 without resizing: Voyage downsizes anything over 2 MP itself and
// bills by pixel, and catalog images are ~375×500. The whole 7k catalog
// sits inside the 150 B-pixel free tier. No sharp dependency needed.
//
// This file duplicates the request shape in lib/image-embed.ts on purpose:
// the scraper is a separate ESM package and can't import from ../../lib at
// runtime under tsx (same reason image-clean.ts is a copy). Keep MODEL and
// DIMENSIONS in sync with the app.
//
// Prerequisites:
//   supabase db push          (migration 0023)
//   VOYAGE_API_KEY in scraper/.env (plain KEY=value, no arrows, no comments;
//   `al-…` from MongoDB Atlas or `pa-…` from the Voyage dashboard both work)
//
// Usage (run from scraper/):
//   pnpm embed:images --dry --limit=20       # what would be embedded
//   pnpm embed:images --limit=20             # smoke test
//   pnpm embed:images                        # full catalog run
//   pnpm embed:images --source=user_photo    # approved user photos only
//   pnpm embed:images --source=all           # catalog + user photos
//
// Flags:
//   --dry              no downloads, no API calls, no DB writes
//   --limit=N          stop after N candidate images
//   --source=catalog|user_photo|all   default catalog
//   --refresh          re-embed rows that already have a vector for MODEL
//
// Env:
//   EMBED_MODEL          default voyage-multimodal-3.5
//   EMBED_CONCURRENCY    parallel downloads+embeds (default 4)
//   EMBED_BATCH          images per Voyage request (default 8, max 1000/req
//                        but keep payloads small)
//   USER_PHOTO_BUCKET    default user-bottle-images
//   EMBED_HEADED=1       visible Chromium for the browser fallback (beats
//                        headless-detection bot walls; slower, keep for retries)
//
// Idempotent + resumable: candidates are rows with no embedding for MODEL
// (left anti-join via the RPC-free two-query approach below), keyset-paged
// on id. Safe to Ctrl-C.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";
import { isPlaceholderBottleUrl } from "./image-clean";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const VOYAGE_KEY = process.env.VOYAGE_API_KEY ?? "";
const MODEL = process.env.EMBED_MODEL ?? "voyage-multimodal-3.5";
const DIMENSIONS = 1024;
const CONCURRENCY = Math.max(1, Number(process.env.EMBED_CONCURRENCY ?? 4));
const BATCH = Math.max(1, Math.min(32, Number(process.env.EMBED_BATCH ?? 8)));
const USER_PHOTO_BUCKET = process.env.USER_PHOTO_BUCKET ?? "user-bottle-images";
// Atlas-minted keys (`al-…`) live on ai.mongodb.com, Voyage-dashboard keys
// (`pa-…`) on api.voyageai.com. Same path and request shape on both.
const VOYAGE_URL = `${(
  process.env.VOYAGE_BASE_URL ??
  (VOYAGE_KEY.startsWith("al-") ? "https://ai.mongodb.com/v1" : "https://api.voyageai.com/v1")
).replace(/\/$/, "")}/multimodalembeddings`;
const PAGE = 200;

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const REFRESH = args.includes("--refresh");
const LIMIT = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0");
const SOURCE = (args.find((a) => a.startsWith("--source="))?.split("=")[1] ?? "catalog") as
  | "catalog"
  | "user_photo"
  | "all";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[embed] missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!VOYAGE_KEY && !DRY) {
  console.error("[embed] missing VOYAGE_API_KEY (or pass --dry)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// Hand-synced with lib/bottle-image.ts BLOCKED_SOURCE_PATTERNS: anything
// on Fragrantica's CDN or our mirror bucket is 'catalog'; any other host
// is assumed to be a licensed affiliate feed image.
const FIMGS_PATTERN = /(^|[.\/])fimgs\.net\//i;
function sourceFor(url: string): "catalog" | "affiliate" {
  if (FIMGS_PATTERN.test(url)) return "catalog";
  if (url.includes("/storage/v1/object/public/bottle-images/")) return "catalog";
  return "affiliate";
}

interface Candidate {
  fragrance_id: string;
  image_url: string;
  source: "catalog" | "affiliate" | "user_photo";
}

const stats = { candidates: 0, embedded: 0, skippedPlaceholder: 0, failed: 0, pixels: 0 };
// Why things failed, tallied so the DONE line can say "3,000 were dead
// links" instead of just "3,000 failed". A dead link is a catalog problem
// (run `pnpm audit:images`), a 429 is a rate-limit problem (add a payment
// method / lower EMBED_CONCURRENCY), and they need different fixes.
const reasons = new Map<string, number>();
function fail(reason: string, n = 1): void {
  stats.failed += n;
  reasons.set(reason, (reasons.get(reason) ?? 0) + n);
}
// Failed downloads by host, so a 403 bucket names the CDN behind it.
const failedHosts = new Map<string, number>();
function failHost(url: string): void {
  try {
    const h = new URL(url).hostname;
    failedHosts.set(h, (failedHosts.get(h) ?? 0) + 1);
  } catch {
    /* ignore */
  }
}

// ---- download -------------------------------------------------------------
type Downloaded = { b64: string; mime: string } | { error: string };

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// Referer matters in two opposite ways. fimgs.net wants to see Fragrantica.
// Retailer CDNs (the licensed affiliate images) reject a Fragrantica
// referer outright — that was the whole 403 bucket on the first run — and
// are happiest with their own origin, as if the image were loaded from a
// page on their site.
function refererFor(url: string): string {
  if (FIMGS_PATTERN.test(url)) return "https://www.fragrantica.com/";
  try {
    return `${new URL(url).origin}/`;
  } catch {
    return "";
  }
}

function browserHeaders(url: string): Record<string, string> {
  return {
    "User-Agent": UA,
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "image",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Site": "same-origin",
    Referer: refererFor(url),
  };
}

function checkBody(url: string, mime: string, buf: Buffer): Downloaded {
  if (!mime.startsWith("image/")) {
    console.log(`[embed]   ! not an image (${mime}) for ${url}`);
    return { error: `not an image (${mime})` };
  }
  if (buf.length < 1000) {
    console.log(`[embed]   ! tiny image (${buf.length}b) for ${url}`);
    return { error: "tiny image (<1 KB)" };
  }
  return { b64: buf.toString("base64"), mime };
}

// Second line of defence: a real Chromium network stack. Some retailer
// CDNs (Akamai, Cloudflare bot rules) 403 anything whose TLS fingerprint
// isn't a browser's, whatever headers it sends. Playwright is already a
// scraper dependency; the browser is launched lazily on the first 403 and
// shared. Uses context.request (no page, no evaluate — see the tsx
// keepNames gotcha in memory) so it's cheap per image.
let browserCtx: import("playwright").BrowserContext | null = null;
let browser: import("playwright").Browser | null = null;
let browserUnavailable = false;

async function browserFetch(url: string): Promise<Downloaded> {
  if (browserUnavailable) return { error: "download HTTP 403 (browser fallback unavailable)" };
  try {
    if (!browserCtx) {
      const { chromium } = await import("playwright");
      // EMBED_HEADED=1 opens a visible window. Some bot walls (fragranceshop.com
      // as of Aug 2026) fingerprint headless Chromium specifically; a headed
      // one usually passes. Only worth it for the last few hundred rows.
      browser = await chromium.launch({ headless: process.env.EMBED_HEADED !== "1" });
      browserCtx = await browser.newContext({ userAgent: UA, locale: "en-US" });
    }
    const res = await browserCtx.request.get(url, {
      headers: { Referer: refererFor(url), Accept: browserHeaders(url).Accept },
      timeout: 20_000,
      maxRedirects: 5,
    });
    if (!res.ok()) {
      console.log(`[embed]   ! HTTP ${res.status()} (browser) for ${url}`);
      return { error: `download HTTP ${res.status()} (browser fallback too)` };
    }
    const mime = (res.headers()["content-type"] ?? "image/jpeg").split(";")[0];
    return checkBody(url, mime, Buffer.from(await res.body()));
  } catch (err) {
    const msg = String(err);
    if (/Executable doesn't exist|browserType\.launch|npx playwright install/i.test(msg)) {
      browserUnavailable = true;
      console.log(
        `[embed]   ! Playwright Chromium not installed — run \`npx playwright install chromium\` in scraper/ and re-run`,
      );
      return { error: "download HTTP 403 (browser fallback unavailable)" };
    }
    console.log(`[embed]   ! browser fetch failed: ${msg}`);
    return { error: "download browser fetch error" };
  }
}

async function closeBrowser(): Promise<void> {
  await browserCtx?.close().catch(() => {});
  await browser?.close().catch(() => {});
  browserCtx = null;
  browser = null;
}

async function download(url: string): Promise<Downloaded> {
  try {
    const res = await fetch(url, {
      headers: browserHeaders(url),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 403 || res.status === 429 || res.status === 503) {
      // Bot-blocked, most likely. Go through a real browser.
      return browserFetch(url);
    }
    if (!res.ok) {
      console.log(`[embed]   ! HTTP ${res.status} for ${url}`);
      return { error: `download HTTP ${res.status}` };
    }
    const mime = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0];
    return checkBody(url, mime, Buffer.from(await res.arrayBuffer()));
  } catch (err) {
    const msg = err instanceof Error ? err.name : String(err);
    console.log(`[embed]   ! fetch failed: ${String(err)}`);
    return { error: `download ${msg === "TimeoutError" ? "timeout" : "network error"}` };
  }
}

// ---- embed (batched) ------------------------------------------------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One Voyage request per batch. 429 / 5xx / timeouts are retried with
// backoff (3 attempts) before the whole batch is counted as failed; a
// 4xx other than 429 is a payload problem and is not retried.
async function embedBatch(
  images: Array<{ b64: string; mime: string }>,
): Promise<{ vectors: Array<number[] | null>; error?: string }> {
  let lastError = "voyage: unknown";
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(VOYAGE_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${VOYAGE_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          input_type: "document",
          output_dimension: DIMENSIONS,
          inputs: images.map((img) => ({
            content: [{ type: "image_base64", image_base64: `data:${img.mime};base64,${img.b64}` }],
          })),
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      lastError = "voyage: network/timeout";
      console.log(`[embed]   ! voyage request failed (attempt ${attempt}): ${String(err)}`);
      await sleep(2_000 * attempt);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      const text = await res.text().catch(() => "");
      lastError = `voyage HTTP ${res.status}`;
      console.log(`[embed]   ! voyage HTTP ${res.status} (attempt ${attempt}): ${text.slice(0, 160)}`);
      await sleep(res.status === 429 ? 10_000 * attempt : 2_000 * attempt);
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.log(`[embed]   ! voyage HTTP ${res.status}: ${text.slice(0, 200)}`);
      return { vectors: images.map(() => null), error: `voyage HTTP ${res.status}` };
    }
    return { vectors: await parseVectors(res) };
  }
  return { vectors: images.map(() => null), error: lastError };
}

async function parseVectors(res: Response): Promise<Array<number[] | null>> {
  const json = (await res.json()) as {
    data?: Array<{ index?: number; embedding?: number[] }>;
    usage?: { image_pixels?: number };
  };
  stats.pixels += json.usage?.image_pixels ?? 0;
  const out: Array<number[] | null> = [];
  (json.data ?? []).forEach((d, i) => {
    const idx = typeof d.index === "number" ? d.index : i;
    out[idx] = Array.isArray(d.embedding) && d.embedding.length === DIMENSIONS ? d.embedding : null;
  });
  return out;
}

async function processBatch(batch: Candidate[]): Promise<void> {
  if (DRY) {
    stats.embedded += batch.length;
    for (const c of batch.slice(0, 3)) console.log(`[embed]   [dry] ${c.source} ${c.fragrance_id} ${c.image_url}`);
    return;
  }
  const downloaded = await Promise.all(batch.map((c) => download(c.image_url)));
  const ready: Array<{ c: Candidate; img: { b64: string; mime: string } }> = [];
  downloaded.forEach((d, i) => {
    if ("error" in d) {
      fail(d.error);
      failHost(batch[i].image_url);
    } else ready.push({ c: batch[i], img: d });
  });
  if (ready.length === 0) return;

  const { vectors, error: embedError } = await embedBatch(ready.map((r) => r.img));
  if (embedError) {
    fail(embedError, ready.length);
    return;
  }
  const rows: Array<{ fragrance_id: string; source: string; image_url: string; model: string; embedding: string }> = [];
  ready.forEach((r, i) => {
    const v = vectors[i];
    if (!v) {
      fail("voyage: no vector for image");
      return;
    }
    rows.push({
      fragrance_id: r.c.fragrance_id,
      source: r.c.source,
      image_url: r.c.image_url,
      model: MODEL,
      embedding: JSON.stringify(v),
    });
  });
  if (rows.length === 0) return;

  const { error } = await supabase
    .from("bottle_image_embeddings")
    .upsert(rows, { onConflict: "fragrance_id,image_url,model" });
  if (error) {
    console.log(`[embed]   ! upsert failed: ${error.message}`);
    fail(`upsert: ${error.message.slice(0, 60)}`, rows.length);
    return;
  }
  stats.embedded += rows.length;
  if (stats.embedded % 50 < rows.length) {
    console.log(
      `[embed] embedded=${stats.embedded} failed=${stats.failed} placeholders=${stats.skippedPlaceholder} (of ${stats.candidates} seen, ~${(stats.pixels / 1e9).toFixed(3)} B pixels)`,
    );
  }
}

async function pool(batches: Candidate[][], size: number): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, batches.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= batches.length) return;
      await processBatch(batches[i]);
    }
  });
  await Promise.all(workers);
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

// Which (fragrance_id, image_url) pairs already have a vector for MODEL.
async function alreadyEmbedded(ids: string[]): Promise<Set<string>> {
  if (REFRESH || ids.length === 0) return new Set();
  const { data } = await supabase
    .from("bottle_image_embeddings")
    .select("fragrance_id, image_url")
    .eq("model", MODEL)
    .in("fragrance_id", ids);
  return new Set((data ?? []).map((r) => `${r.fragrance_id}|${r.image_url}`));
}

// ---- sources --------------------------------------------------------------
async function runCatalog(): Promise<void> {
  let cursor = "";
  while (true) {
    if (LIMIT && stats.candidates >= LIMIT) break;
    let q = supabase
      .from("fragrances")
      .select("id, bottle_image_url")
      .not("bottle_image_url", "is", null)
      .order("id", { ascending: true })
      .limit(PAGE);
    if (cursor) q = q.gt("id", cursor);
    const { data: rows, error } = await q;
    if (error) {
      console.error("[embed] DB read error:", error.message);
      process.exit(1);
    }
    if (!rows || rows.length === 0) break;

    const done = await alreadyEmbedded(rows.map((r) => r.id));
    let batch: Candidate[] = [];
    for (const r of rows) {
      const url = r.bottle_image_url as string | null;
      if (!url) continue;
      if (isPlaceholderBottleUrl(url)) {
        stats.skippedPlaceholder++;
        continue;
      }
      if (done.has(`${r.id}|${url}`)) continue;
      batch.push({ fragrance_id: r.id, image_url: url, source: sourceFor(url) });
    }
    if (LIMIT) batch = batch.slice(0, Math.max(0, LIMIT - stats.candidates));
    stats.candidates += batch.length;
    await pool(chunk(batch, BATCH), CONCURRENCY);

    cursor = rows[rows.length - 1].id;
    if (rows.length < PAGE) break;
  }
}

async function runUserPhotos(): Promise<void> {
  const { data: rows, error } = await supabase
    .from("fragrance_photos")
    .select("fragrance_id, storage_path")
    .eq("status", "approved")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[embed] DB read error:", error.message);
    process.exit(1);
  }
  const all = (rows ?? []).map((r) => ({
    fragrance_id: r.fragrance_id as string,
    image_url: `${SUPABASE_URL}/storage/v1/object/public/${USER_PHOTO_BUCKET}/${r.storage_path}`,
    source: "user_photo" as const,
  }));
  const done = await alreadyEmbedded([...new Set(all.map((c) => c.fragrance_id))]);
  let batch = all.filter((c) => !done.has(`${c.fragrance_id}|${c.image_url}`));
  if (LIMIT) batch = batch.slice(0, Math.max(0, LIMIT - stats.candidates));
  stats.candidates += batch.length;
  console.log(`[embed] approved user photos to embed: ${batch.length}`);
  await pool(chunk(batch, BATCH), CONCURRENCY);
}

async function main() {
  console.log(
    `[embed] model=${MODEL} source=${SOURCE} batch=${BATCH} concurrency=${CONCURRENCY}${REFRESH ? " (REFRESH)" : ""}${DRY ? " (DRY RUN)" : ""}`,
  );
  try {
    if (SOURCE === "catalog" || SOURCE === "all") await runCatalog();
    if (SOURCE === "user_photo" || SOURCE === "all") await runUserPhotos();
  } finally {
    await closeBrowser();
  }

  console.log(
    `\n[embed] DONE  candidates=${stats.candidates}  embedded=${stats.embedded}  placeholders_skipped=${stats.skippedPlaceholder}  failed=${stats.failed}  pixels=${(stats.pixels / 1e9).toFixed(3)}B`,
  );
  if (stats.failed > 0) {
    console.log(`[embed] ${stats.failed} failed — by reason:`);
    for (const [reason, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`[embed]   ${String(n).padStart(6)}  ${reason}`);
    }
    if (failedHosts.size > 0) {
      console.log(`[embed] failed downloads by host:`);
      for (const [host, n] of [...failedHosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
        console.log(`[embed]   ${String(n).padStart(6)}  ${host}`);
      }
    }
    console.log(
      `[embed] dead links (HTTP 404/410) are a catalog problem: run \`pnpm audit:images\` to null them. ` +
        `403s that survive the browser fallback are hosts that block scripted fetches entirely — send me the host list. ` +
        `Voyage 429s mean rate limiting: add a payment method in Atlas or set EMBED_CONCURRENCY=1. ` +
        `Everything else: just re-run, only failures are retried.`,
    );
  }
  if (DRY) console.log(`[embed] dry run: nothing was downloaded, embedded, or written.`);

  // Coverage, so the next stage (the scan route) knows what it's standing on.
  if (!DRY) {
    const { count: total } = await supabase
      .from("fragrances")
      .select("id", { count: "exact", head: true })
      .not("bottle_image_url", "is", null);
    const { data: covered } = await supabase.rpc("count_embedded_fragrances", { p_model: MODEL });
    if (typeof covered === "number") {
      console.log(`[embed] coverage: ${covered} of ${total ?? "?"} fragrances with an image have a vector for ${MODEL}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

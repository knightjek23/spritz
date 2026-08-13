// Mirror Fragrantica bottle images to Supabase Storage.
//
// Why: bottle_image_url currently points at fimgs.net (Fragrantica's CDN).
// Hotlinking works for now but they could block by referrer at any time. This
// script copies every image into our own Supabase Storage bucket and updates
// the DB row to point at the new URL — so we own the host.
//
// READ THIS BEFORE RUNNING. Mirroring solves a RELIABILITY problem, not a
// legal one. Hotlinking means Fragrantica serves the bytes; mirroring means
// we serve copies of them from our own bucket, which is more copyright
// exposure, not less. That is why lib/bottle-image.ts lists the
// bottle-images bucket in BLOCKED_SOURCE_PATTERNS alongside fimgs.net.
// This script is insurance for the pre-launch / affiliate-review window.
// The launch answer is still licensed affiliate feeds — see
// AFFILIATE_IMAGE_PLAYBOOK.md. The two compose: backfill-affiliate-images.ts
// treats a bucket URL as unlicensed, so licensed images still overwrite
// mirrored rows later. Nothing here burns that bridge.
//
// Prerequisites (one-time, in Supabase dashboard):
//   1. Storage → New bucket → name: "bottle-images" → set Public
//   2. Storage → bottle-images → Policies → confirm "Public read access"
//      template applies (or add a SELECT policy for `anon`)
//
// Usage (run from scraper/):
//   pnpm mirror:images --dry --limit=20     # preview, no network writes, no DB writes
//   pnpm mirror:images --limit=20           # smoke test: 20 real images
//   pnpm mirror:images                      # full run
//
// Flags:
//   --dry       Report what would be mirrored. No downloads, no uploads, no DB writes.
//   --limit=N   Stop after N candidate rows (smoke test).
//
// Env:
//   IMAGE_BUCKET        bucket name (default "bottle-images")
//   IMAGE_DELAY_MIN/MAX per-request jitter in seconds (default 0.4 / 1.0)
//   IMAGE_CONCURRENCY   parallel downloads (default 3; raise carefully)
//
// Idempotent + resumable: only rows whose bottle_image_url still points at
// fimgs.net are candidates, so a re-run picks up exactly what failed last
// time. Safe to Ctrl-C at any point.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";
import { isPlaceholderBottleUrl } from "./image-clean";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BUCKET = process.env.IMAGE_BUCKET ?? "bottle-images";
const DELAY_MIN = Number(process.env.IMAGE_DELAY_MIN ?? 0.4);
const DELAY_MAX = Number(process.env.IMAGE_DELAY_MAX ?? 1.0);
const CONCURRENCY = Math.max(1, Number(process.env.IMAGE_CONCURRENCY ?? 3));
const PAGE = 200;

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const LIMIT = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => DELAY_MIN * 1000 + Math.random() * (DELAY_MAX - DELAY_MIN) * 1000;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[mirror] missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// Public URL pattern for Supabase Storage objects in a public bucket
function publicUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

// Only fimgs.net rows are candidates. The previous version mirrored ANY URL
// that wasn't already in our bucket, which would silently overwrite a
// licensed affiliate image with a copied one the moment backfill:images had
// run — turning a shippable image back into a blocked source. Be explicit.
const FIMGS_PATTERN = /(^|[.\/])fimgs\.net\//i;

function isFragranticaCdn(url: string | null): boolean {
  if (!url) return false;
  return FIMGS_PATTERN.test(url);
}

function detectExt(url: string, contentType: string | null): string {
  // Prefer URL extension; fall back to content-type
  const m = url.toLowerCase().match(/\.(jpe?g|png|webp|gif|avif)(\?|$)/);
  if (m) return m[1].replace("jpeg", "jpg");
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("avif")) return "avif";
  return "jpg";
}

async function downloadImage(
  url: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        // Pretend to be a browser; some CDNs block bare fetch UAs
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: "https://www.fragrantica.com/",
      },
    });
    if (!res.ok) {
      console.log(`[mirror]   ! HTTP ${res.status} for ${url}`);
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length < 1000) {
      console.log(`[mirror]   ! tiny image (${buffer.length}b) for ${url}`);
      return null;
    }
    return { buffer, contentType };
  } catch (err) {
    console.log(`[mirror]   ! fetch failed: ${String(err)}`);
    return null;
  }
}

interface Row {
  id: string;
  bottle_image_url: string | null;
}

const stats = {
  candidates: 0,
  mirrored: 0,
  skippedPlaceholder: 0,
  failed: 0,
};

async function mirrorOne(row: Row): Promise<void> {
  const src = row.bottle_image_url;
  if (!src) return;

  // Fragrantica serves a shared "IMAGE COMING SOON" graphic in the same slot
  // as a real photo. Copying it wastes a request and stores a fake bottle.
  if (isPlaceholderBottleUrl(src)) {
    stats.skippedPlaceholder++;
    return;
  }

  if (DRY) {
    stats.mirrored++;
    if (stats.mirrored <= 20) console.log(`[mirror]   [dry] ${row.id}  ${src}`);
    return;
  }

  const downloaded = await downloadImage(src);
  if (!downloaded) {
    stats.failed++;
    return;
  }

  const ext = detectExt(src, downloaded.contentType);
  const path = `bottles/${row.id}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, downloaded.buffer, {
      contentType: downloaded.contentType,
      upsert: true,
      cacheControl: "31536000", // 1 year — bottles don't change
    });

  if (upErr) {
    console.log(`[mirror]   ! upload failed for ${row.id}: ${upErr.message}`);
    stats.failed++;
    return;
  }

  const { error: updErr } = await supabase
    .from("fragrances")
    .update({ bottle_image_url: publicUrl(path) })
    .eq("id", row.id);

  if (updErr) {
    console.log(`[mirror]   ! row update failed for ${row.id}: ${updErr.message}`);
    stats.failed++;
    return;
  }

  stats.mirrored++;
  if (stats.mirrored % 25 === 0) {
    console.log(
      `[mirror] mirrored=${stats.mirrored} failed=${stats.failed} placeholders=${stats.skippedPlaceholder} (of ${stats.candidates} seen)`,
    );
  }

  await sleep(jitter());
}

/** Run tasks with a fixed-size worker pool. */
async function pool(rows: Row[], size: number): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, rows.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= rows.length) return;
      await mirrorOne(rows[i]);
    }
  });
  await Promise.all(workers);
}

async function main() {
  console.log(
    `[mirror] bucket=${BUCKET} pacing=${DELAY_MIN}-${DELAY_MAX}s concurrency=${CONCURRENCY}${DRY ? " (DRY RUN)" : ""}`,
  );

  // How much work is there? Cheap count so the run has a denominator.
  const { count: totalCandidates } = await supabase
    .from("fragrances")
    .select("id", { count: "exact", head: true })
    .ilike("bottle_image_url", "%fimgs.net%");
  console.log(`[mirror] rows still pointing at fimgs.net: ${totalCandidates ?? "?"}`);
  if (!totalCandidates) {
    console.log("[mirror] nothing to do.");
    return;
  }

  // Keyset pagination on id. Offset paging would be WRONG here: mirroring a
  // row removes it from the `ilike fimgs` filter, so every processed row
  // shifts the window and offset paging would silently skip rows. A forward-
  // only id cursor is stable under those updates.
  let cursor = "";

  while (true) {
    if (LIMIT && stats.candidates >= LIMIT) break;

    let q = supabase
      .from("fragrances")
      .select("id, bottle_image_url")
      .ilike("bottle_image_url", "%fimgs.net%")
      .order("id", { ascending: true })
      .limit(PAGE);
    if (cursor) q = q.gt("id", cursor);

    const { data: rows, error } = await q.returns<Row[]>();
    if (error) {
      console.error(`[mirror] DB read error:`, error.message);
      process.exit(1);
    }
    if (!rows || rows.length === 0) break;

    // Defensive: the filter should guarantee this, but never touch a row
    // whose URL isn't actually Fragrantica's CDN.
    let batch = rows.filter((r) => isFragranticaCdn(r.bottle_image_url));
    if (LIMIT) batch = batch.slice(0, Math.max(0, LIMIT - stats.candidates));

    stats.candidates += batch.length;
    await pool(batch, CONCURRENCY);

    cursor = rows[rows.length - 1].id;
    if (rows.length < PAGE) break;
  }

  console.log(
    `\n[mirror] DONE  candidates=${stats.candidates}  mirrored=${stats.mirrored}  placeholders_skipped=${stats.skippedPlaceholder}  failed=${stats.failed}`,
  );
  if (stats.failed > 0) {
    console.log(
      `[mirror] ${stats.failed} failed rows still point at fimgs.net — just re-run to retry only those.`,
    );
  }
  if (DRY) console.log(`[mirror] dry run: nothing was downloaded, uploaded, or written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

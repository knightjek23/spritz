// Mirror Fragrantica bottle images to Supabase Storage.
//
// Why: bottle_image_url currently points at fimgs.net (Fragrantica's CDN).
// Hotlinking works for now but they could block by referrer at any time. This
// script copies every image into our own Supabase Storage bucket and updates
// the DB row to point at the new URL — so we own the host.
//
// Prerequisites (one-time, in Supabase dashboard):
//   1. Storage → New bucket → name: "bottle-images" → set Public
//   2. Storage → bottle-images → Policies → confirm "Public read access"
//      template applies (or add a SELECT policy for `anon`)
//
// Idempotent + resumable: re-running skips rows that already point at Supabase.
// Pacing: small delay between fetches so we don't hammer fimgs.net.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BUCKET = process.env.IMAGE_BUCKET ?? "bottle-images";
const DELAY_MIN = Number(process.env.IMAGE_DELAY_MIN ?? 0.4);
const DELAY_MAX = Number(process.env.IMAGE_DELAY_MAX ?? 1.0);
const PAGE = 200;

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

function isAlreadyMirrored(url: string | null): boolean {
  if (!url) return false;
  return url.startsWith(SUPABASE_URL) && url.includes(`/${BUCKET}/`);
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

async function main() {
  console.log(`[mirror] bucket=${BUCKET} pacing=${DELAY_MIN}-${DELAY_MAX}s`);

  // Stream rows page by page
  let from = 0;
  let totalScanned = 0;
  let mirrored = 0;
  let skipped = 0;
  let failed = 0;

  while (true) {
    const { data: rows, error } = await supabase
      .from("fragrances")
      .select("id, bottle_image_url")
      .range(from, from + PAGE - 1)
      .order("id", { ascending: true });
    if (error) {
      console.error(`[mirror] DB read error:`, error);
      process.exit(1);
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows as Array<{ id: string; bottle_image_url: string | null }>) {
      totalScanned++;
      const src = row.bottle_image_url;
      if (!src) {
        skipped++;
        continue;
      }
      if (isAlreadyMirrored(src)) {
        skipped++;
        continue;
      }

      const downloaded = await downloadImage(src);
      if (!downloaded) {
        failed++;
        continue;
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
        failed++;
        continue;
      }

      const newUrl = publicUrl(path);
      const { error: updErr } = await supabase
        .from("fragrances")
        .update({ bottle_image_url: newUrl })
        .eq("id", row.id);

      if (updErr) {
        console.log(`[mirror]   ! row update failed for ${row.id}: ${updErr.message}`);
        failed++;
        continue;
      }

      mirrored++;
      if (mirrored % 25 === 0) {
        console.log(
          `[mirror] mirrored=${mirrored} skipped=${skipped} failed=${failed} (scanned ${totalScanned})`,
        );
      }

      await sleep(jitter());
    }

    from += rows.length;
    if (rows.length < PAGE) break;
  }

  console.log(
    `\n[mirror] DONE  scanned=${totalScanned}  mirrored=${mirrored}  skipped=${skipped}  failed=${failed}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

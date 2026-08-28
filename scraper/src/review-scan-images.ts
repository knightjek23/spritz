// Review retained scan photos and nominate good ones as library images.
//
// Why this exists: ~30% of the catalog has no bottle image, and every legally
// clean source (affiliate feeds) is missing exactly the houses users care
// about most — luxury houses refuse discount-retailer distribution. Photos
// users take of bottles they own are the one image source we can actually
// license, via the ToS clause under "Content and ownership".
//
// This does NOT publish anything. It copies a candidate into the public
// `user-bottle-images` bucket and inserts a fragrance_photos row with
// status='pending', which is the same queue as a deliberate user upload
// (migration 0020). Nothing renders until a human approves it. Keeping one
// moderation path means one place to get moderation right.
//
// Candidates are deliberately narrow — only scans that CONFIDENTLY matched a
// fragrance that currently has NO image. A scan that missed is a scan whose
// subject we cannot name, so it is useless as a catalog image and is left to
// the 30-day purge.
//
// Usage:
//   cd scraper && pnpm review:scans                 # list candidates + signed URLs
//   cd scraper && pnpm review:scans --promote=<scan_event_id>
//   cd scraper && pnpm review:scans --limit=50
//
// The listed signed URLs expire in 10 minutes. Open them, look at the photo,
// then promote the good ones. You still approve the fragrance_photos row
// afterwards (see the SQL at the bottom of migration 0020).

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const PROMOTE = args.find((a) => a.startsWith("--promote="))?.split("=")[1];
const LIMIT = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "25");

const SCAN_BUCKET = "scan-images";
const PUBLIC_BUCKET = "user-bottle-images";
// Only scans the pipeline was sure about. Below this the photo may not even
// be the bottle we'd be attaching it to.
const MIN_CONFIDENCE = 0.85;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

type Candidate = {
  id: string;
  image_url: string;
  confidence: number | null;
  matched_fragrance_id: string;
  user_id: string | null;
  created_at: string;
  fragrances: { id: string; name: string; house: string; bottle_image_url: string | null } | null;
};

async function listCandidates(): Promise<Candidate[]> {
  const { data, error } = await supabase
    .from("scan_events")
    .select(
      "id, image_url, confidence, matched_fragrance_id, user_id, created_at, fragrances:matched_fragrance_id (id, name, house, bottle_image_url)",
    )
    .not("image_url", "is", null)
    .not("matched_fragrance_id", "is", null)
    .gte("confidence", MIN_CONFIDENCE)
    .order("created_at", { ascending: false })
    .limit(LIMIT * 4)
    .returns<Candidate[]>();

  if (error) throw new Error(error.message);
  // Filter to fragrances that still have no image. Doing this in JS rather
  // than the query keeps the join simple and the volume here is tiny.
  return (data ?? []).filter((r) => r.fragrances && !r.fragrances.bottle_image_url).slice(0, LIMIT);
}

async function promote(scanEventId: string) {
  const { data: ev, error } = await supabase
    .from("scan_events")
    .select("id, image_url, matched_fragrance_id, user_id")
    .eq("id", scanEventId)
    .maybeSingle<{
      id: string;
      image_url: string | null;
      matched_fragrance_id: string | null;
      user_id: string | null;
    }>();

  if (error) throw new Error(error.message);
  if (!ev) throw new Error(`no scan_event ${scanEventId}`);
  if (!ev.image_url) throw new Error("that scan has no retained photo (purged, or never stored)");
  if (!ev.matched_fragrance_id) throw new Error("that scan never matched a fragrance");

  // Download from the private bucket, re-upload to the public one. Supabase
  // has no cross-bucket copy.
  const { data: blob, error: dlErr } = await supabase.storage
    .from(SCAN_BUCKET)
    .download(ev.image_url);
  if (dlErr || !blob) throw new Error(`download failed: ${dlErr?.message ?? "no body"}`);

  const destPath = `from-scan/${ev.id}.jpg`;
  const bytes = Buffer.from(await blob.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from(PUBLIC_BUCKET)
    .upload(destPath, bytes, { contentType: "image/jpeg", upsert: true });
  if (upErr) throw new Error(`upload failed: ${upErr.message}`);

  const { error: insErr } = await supabase.from("fragrance_photos").insert({
    fragrance_id: ev.matched_fragrance_id,
    // fragrance_photos.clerk_user_id is NOT NULL. An anonymous scan has no
    // user, so record the provenance explicitly rather than inventing an id.
    clerk_user_id: ev.user_id ?? "scan:anonymous",
    storage_path: destPath,
    status: "pending",
  });
  if (insErr) throw new Error(`queue insert failed: ${insErr.message}`);

  console.log(`  queued for moderation: ${destPath}`);
  console.log(`  fragrance_id: ${ev.matched_fragrance_id}`);
  console.log(`\n  Nothing is public yet. Approve it with the SQL at the`);
  console.log(`  bottom of supabase/migrations/0020_fragrance_photos.sql.`);
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in scraper/.env");
    process.exit(1);
  }

  if (PROMOTE) {
    await promote(PROMOTE);
    return;
  }

  const rows = await listCandidates();
  console.log("--- Scan photos for fragrances with no image ---");
  console.log(`  confidence >= ${MIN_CONFIDENCE}, showing ${rows.length}\n`);
  if (rows.length === 0) {
    console.log("  Nothing to review.");
    return;
  }

  for (const r of rows) {
    const { data: signed } = await supabase.storage
      .from(SCAN_BUCKET)
      .createSignedUrl(r.image_url, 600);
    console.log(`  ${r.fragrances?.house} — ${r.fragrances?.name}`);
    console.log(`    scan:  ${r.id}  (${Math.round((r.confidence ?? 0) * 100)}%, ${r.created_at.slice(0, 10)})`);
    console.log(`    photo: ${signed?.signedUrl ?? "(sign failed)"}`);
    console.log("");
  }
  console.log(`  Promote one with:  pnpm review:scans --promote=<scan id>`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

import "server-only";

// Persist the scan photo so a match can be diagnosed after the fact, and so
// a good bottle shot can eventually become a catalog image.
//
// Storage: the PRIVATE `scan-images` bucket (already used, transiently, by
// lib/web-lookup.ts). Private is load-bearing — these are photos taken in
// users' homes and stores, and nothing here should be reachable by URL
// guessing. Anything that becomes public gets copied to the public
// `user-bottle-images` bucket by an explicit review step, never served from
// here.
//
// Retention: indefinite. Scan photos are the only bottle image source we can
// actually license (affiliate feeds structurally exclude the luxury houses),
// so the archive is an asset and is kept. NOTE this contradicts the stale
// comment in migration 0001 ("retained 30d") — that was the original intent,
// changed deliberately. Do not add a purge back without also changing
// /legal/privacy and the camera-permission copy, which now state that we
// keep photos.
//
// The one deletion path that must still work is an erasure request. Because
// scan_events.user_id is `on delete set null`, a photo becomes unlinkable to
// its owner the moment their account row goes away — so an erasure has to
// delete the photos BEFORE the user row, or it can't be honoured at all.
//
// The path is the scan_event id, so a stored photo always maps back to the
// row that describes what the model read and what it matched.
//
// The `scans/` prefix is NOT cosmetic. lib/web-lookup.ts uploads the same
// photo to the SAME bucket at the bare path `<id>.jpg` for Google Lens, then
// fires an un-awaited `.remove()` on it in a finally block. That delete can
// land after this upload and silently erase the retained copy. A separate
// prefix makes the two objects incapable of colliding.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { SCAN_IMAGE_BUCKET } from "./web-lookup";

/** Folder for retained scans, kept clear of web-lookup's transient objects. */
export const SCAN_RETAIN_PREFIX = "scans/";

/**
 * Upload the scan frame and return its storage path (not a URL — the bucket
 * is private). Returns null on any failure: retaining the photo is a
 * nice-to-have and must never break or slow a scan.
 */
export async function storeScanImage(
  supabase: SupabaseClient<Database>,
  scanEventId: string,
  base64Image: string,
): Promise<string | null> {
  try {
    const bytes = Buffer.from(base64Image, "base64");
    // Sanity ceiling. The client already downscales to ~250 KB; anything
    // wildly larger is a malformed or hostile payload and isn't worth keeping.
    if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) return null;

    const path = `${SCAN_RETAIN_PREFIX}${scanEventId}.jpg`;
    const { error } = await supabase.storage
      .from(SCAN_IMAGE_BUCKET)
      .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
    if (error) {
      console.warn("[scan-image] upload failed:", error.message);
      return null;
    }
    return path;
  } catch (err) {
    console.warn(
      "[scan-image] upload threw:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Short-lived signed URL for reviewing a stored scan. Used by the (manual,
 * service-role) review flow — never handed to the browser for a public page.
 */
export async function signScanImage(
  supabase: SupabaseClient<Database>,
  path: string,
  expiresInSeconds = 600,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(SCAN_IMAGE_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

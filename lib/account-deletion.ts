import "server-only";

// The single implementation of "erase this person from Spritz."
//
// Called from two places, and they must never drift:
//   1. app/api/account/delete/route.ts — the in-app control on /account.
//      Apple Guideline 5.1.1(v) requires deletion to be INITIATED IN THE APP,
//      so this is the path that actually satisfies review.
//   2. app/api/webhooks/clerk/route.ts — the `user.deleted` webhook, which
//      also fires for deletions started in Clerk's own hosted UI or dashboard,
//      and acts as a backstop if the in-app purge half-failed.
//
// Both call purgeAppUserData(). It is idempotent on purpose: running it twice
// is normal, because the in-app path purges synchronously and then deletes the
// Clerk user, which fires the webhook, which purges again.
//
// ORDER IS LOAD-BEARING. scan_events.user_id is `on delete set null`, so the
// moment the users row goes away every photo that person scanned becomes
// unlinkable to them. Scan photos are retained indefinitely (see
// lib/scan-image-store.ts), so an unlinkable photo is a permanently
// undeletable one. Photos are deleted FIRST, while we can still find them,
// or the promise on /support/delete-account is a lie.
//
// What survives, deliberately:
//   - scan_events rows, with user_id nulled by the FK and image_url nulled
//     here. They carry no personal data once the photo is gone, and they are
//     what the scan-accuracy metric is computed from. Deleting them would
//     silently degrade that metric every time somebody leaves.
//   - affiliate_clicks rows, user_id nulled by the FK. Same reasoning.
//   - fragrance_photos rows that were APPROVED into the catalog. Those are
//     library images now, not account data. Their clerk_user_id is scrubbed
//     so the image is no longer attached to a person, which is exactly what
//     /support/delete-account promises.
//
// What cascades automatically when the users row is deleted:
//   - collection_items (on delete cascade)
//   - user_reactions   (on delete cascade)

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { SCAN_IMAGE_BUCKET } from "./web-lookup";

/** Public bucket holding user-submitted catalog photos. */
const BOTTLE_IMAGE_BUCKET = "user-bottle-images";

/** Placeholder written over the owner of a photo kept as a library image. */
const SCRUBBED_OWNER = "deleted-account";

export interface PurgeResult {
  /** False when there was no app user row to purge (already gone, or never created). */
  found: boolean;
  scanPhotosDeleted: number;
  submittedPhotosDeleted: number;
  libraryPhotosScrubbed: number;
  /** Non-fatal failures. The purge continues past these; they are for logging. */
  warnings: string[];
}

async function removeInBatches(
  supabase: SupabaseClient<Database>,
  bucket: string,
  paths: string[],
  warnings: string[],
): Promise<number> {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (error) warnings.push(`${bucket} remove failed: ${error.message}`);
    else removed += batch.length;
  }
  return removed;
}

/**
 * Delete everything Spritz holds about one person, except the anonymized
 * remnants documented above. Does NOT touch Clerk and does NOT touch Stripe;
 * the callers own those, because the webhook must not try to delete the Clerk
 * user that just triggered it.
 *
 * Safe to call repeatedly.
 */
export async function purgeAppUserData(
  supabase: SupabaseClient<Database>,
  clerkUserId: string,
): Promise<PurgeResult> {
  const warnings: string[] = [];
  let scanPhotosDeleted = 0;
  let submittedPhotosDeleted = 0;
  let libraryPhotosScrubbed = 0;

  // ---- 1. Photos submitted as catalog images (keyed by clerk id, not user id,
  // so this works whether or not the users row still exists).
  const { data: submitted, error: photoErr } = await supabase
    .from("fragrance_photos")
    .select("id, storage_path, status")
    .eq("clerk_user_id", clerkUserId)
    .returns<Array<{ id: string; storage_path: string; status: string }>>();

  if (photoErr) warnings.push(`fragrance_photos read failed: ${photoErr.message}`);

  const unapproved = (submitted ?? []).filter((p) => p.status !== "approved");
  const approved = (submitted ?? []).filter((p) => p.status === "approved");

  if (unapproved.length > 0) {
    submittedPhotosDeleted = await removeInBatches(
      supabase,
      BOTTLE_IMAGE_BUCKET,
      unapproved.map((p) => p.storage_path),
      warnings,
    );
    const { error } = await supabase
      .from("fragrance_photos")
      .delete()
      .in("id", unapproved.map((p) => p.id));
    if (error) warnings.push(`fragrance_photos delete failed: ${error.message}`);
  }

  // Approved photos stay in the catalog, but stop being attached to a person.
  if (approved.length > 0) {
    const { error } = await supabase
      .from("fragrance_photos")
      .update({ clerk_user_id: SCRUBBED_OWNER })
      .in("id", approved.map((p) => p.id));
    if (error) warnings.push(`fragrance_photos scrub failed: ${error.message}`);
    else libraryPhotosScrubbed = approved.length;
  }

  // ---- 2. The app user row, and everything hanging off it.
  const { data: appUser, error: userErr } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (userErr) warnings.push(`users read failed: ${userErr.message}`);
  if (!appUser) {
    return {
      found: false,
      scanPhotosDeleted,
      submittedPhotosDeleted,
      libraryPhotosScrubbed,
      warnings,
    };
  }

  // Scan photos MUST go before the users row. See the header comment.
  const { data: scans, error: scanErr } = await supabase
    .from("scan_events")
    .select("id, image_url")
    .eq("user_id", appUser.id)
    .not("image_url", "is", null)
    .returns<Array<{ id: string; image_url: string }>>();

  if (scanErr) warnings.push(`scan_events read failed: ${scanErr.message}`);

  const paths = (scans ?? []).map((s) => s.image_url).filter(Boolean);
  if (paths.length > 0) {
    scanPhotosDeleted = await removeInBatches(
      supabase,
      SCAN_IMAGE_BUCKET,
      paths,
      warnings,
    );
    const { error } = await supabase
      .from("scan_events")
      .update({ image_url: null })
      .eq("user_id", appUser.id);
    if (error) warnings.push(`scan_events image_url clear failed: ${error.message}`);
  }

  // Cascades collection_items and user_reactions; nulls scan_events.user_id
  // and affiliate_clicks.user_id.
  const { error: delErr } = await supabase
    .from("users")
    .delete()
    .eq("clerk_user_id", clerkUserId);
  if (delErr) {
    warnings.push(`users delete failed: ${delErr.message}`);
    throw new Error(`Account purge failed at the users row: ${delErr.message}`);
  }

  return {
    found: true,
    scanPhotosDeleted,
    submittedPhotosDeleted,
    libraryPhotosScrubbed,
    warnings,
  };
}

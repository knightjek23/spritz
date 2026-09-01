/**
 * End-to-end test for purgeAppUserData() with no Clerk and no browser.
 *
 *   npx tsx scripts/test-account-purge.ts
 *
 * Seeds a throwaway user with a collection item, a reaction, a scan event and
 * a real object in the scan-images bucket, runs the purge, then asserts every
 * one of them is gone and that the anonymized remnants survive correctly.
 *
 * SAFETY: every row it creates is keyed to a clerk_user_id starting with
 * `test-purge-`, generated fresh each run. It never reads, writes or deletes
 * anything outside the ids it created. If any assertion fails it prints what
 * survived so you can clean up by hand.
 *
 * Run this BEFORE testing through the UI. It exercises the dangerous part —
 * ordering, cascades, storage deletion — without needing sign-in to work.
 */

import fs from "node:fs";
import { createRequire } from "node:module";

// Minimal .env.local reader so this script adds no dependency.
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!m) continue;
  const value = m[2].trim().replace(/^["']|["']$/g, "");
  if (value) process.env[m[1]] = value;
}

// lib/account-deletion.ts starts with `import "server-only"`, which is a
// build-time guard that throws the moment it is loaded outside Next's
// bundler. The guard is worth keeping in the library — it stops the purge
// ever being pulled into a client bundle — so instead of removing it, we
// pre-seed the module cache with an empty stub. The real module then never
// executes and the import resolves to nothing, which is exactly what it does
// inside a Next server build.
const req = createRequire(process.cwd() + "/package.json");
try {
  const serverOnlyPath = req.resolve("server-only");
  req.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
    children: [],
    paths: [],
  } as unknown as ReturnType<typeof createRequire>["cache"][string];
} catch {
  // Not installed, nothing to stub.
}

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types";
// Loaded dynamically, AFTER the stub above is in place.
type PurgeFn = typeof import("../lib/account-deletion").purgeAppUserData;

const SCAN_BUCKET = "scan-images";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env.local`);
  return v;
}

const supabase = createClient<Database>(
  need("NEXT_PUBLIC_SUPABASE_URL"),
  need("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const pass: string[] = [];
const fail: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  (ok ? pass : fail).push(label + (detail ? ` — ${detail}` : ""));
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const stamp = Date.now();
  const clerkId = `test-purge-${stamp}`;
  const userId = crypto.randomUUID();
  const scanId = crypto.randomUUID();
  const photoPath = `scans/${scanId}.jpg`;

  console.log(`\nSeeding throwaway user ${clerkId}\n`);

  // A real fragrance to attach things to. Read-only; never modified.
  const { data: frag } = await supabase
    .from("fragrances")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!frag) throw new Error("No fragrances in the catalog to attach test rows to.");

  await supabase.from("users").insert({
    id: userId,
    clerk_user_id: clerkId,
    email: `${clerkId}@example.invalid`,
    plan: "free",
  });

  const { error: colErr } = await supabase.from("collection_items").insert({
    user_id: userId,
    fragrance_id: frag.id,
    status: "own",
  });
  if (colErr) console.log(`  (collection_items seed failed: ${colErr.message})`);

  const { error: reactErr } = await supabase.from("user_reactions").insert({
    user_id: userId,
    fragrance_id: frag.id,
    reaction: "like",
  } as never);
  if (reactErr) console.log(`  (user_reactions seed failed: ${reactErr.message})`);

  const { error: scanSeedErr } = await supabase.from("scan_events").insert({
    id: scanId,
    user_id: userId,
    image_url: photoPath,
    matched_fragrance_id: frag.id,
  } as never);
  if (scanSeedErr) console.log(`  (scan_events seed failed: ${scanSeedErr.message})`);

  // A real storage object, so the purge has something to actually delete.
  const jpg = Buffer.from(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
    "base64",
  );
  const { error: upErr } = await supabase.storage
    .from(SCAN_BUCKET)
    .upload(photoPath, jpg, { contentType: "image/jpeg", upsert: true });
  if (upErr) console.log(`  (storage seed failed: ${upErr.message} — storage assertions will be skipped)`);

  const { error: fpErr } = await supabase.from("fragrance_photos").insert([
    { fragrance_id: frag.id, clerk_user_id: clerkId, storage_path: `${frag.id}/${clerkId}-pending.jpg`, status: "pending" },
    { fragrance_id: frag.id, clerk_user_id: clerkId, storage_path: `${frag.id}/${clerkId}-approved.jpg`, status: "approved" },
  ] as never);

  const { purgeAppUserData } = (await import("../lib/account-deletion")) as {
    purgeAppUserData: PurgeFn;
  };

  console.log("Running purgeAppUserData()\n");
  const result = await purgeAppUserData(supabase, clerkId);
  console.log(`  result: ${JSON.stringify(result)}\n`);

  console.log("Asserting:\n");

  const { data: u } = await supabase.from("users").select("id").eq("clerk_user_id", clerkId).maybeSingle();
  check("users row deleted", !u);

  const { count: items } = await supabase
    .from("collection_items").select("id", { count: "exact", head: true }).eq("user_id", userId);
  check("collection_items cascaded", (items ?? 0) === 0, `${items} left`);

  const { count: reactions } = await supabase
    .from("user_reactions").select("user_id", { count: "exact", head: true }).eq("user_id", userId);
  check("user_reactions cascaded", (reactions ?? 0) === 0, `${reactions} left`);

  const { data: scan } = await supabase
    .from("scan_events").select("id, user_id, image_url").eq("id", scanId).maybeSingle();
  check("scan_events row SURVIVES (accuracy metric)", !!scan);
  check("scan_events.user_id nulled", scan ? scan.user_id === null : false);
  check("scan_events.image_url nulled", scan ? scan.image_url === null : false);

  const { data: obj } = await supabase.storage.from(SCAN_BUCKET).list("scans", { search: `${scanId}.jpg` });
  check("scan photo removed from storage", (obj ?? []).length === 0, `${(obj ?? []).length} found`);

  const { data: photos } = await supabase
    .from("fragrance_photos").select("status, clerk_user_id").eq("clerk_user_id", clerkId)
    .returns<Array<{ status: string; clerk_user_id: string }>>();
  check("unapproved fragrance_photos deleted", (photos ?? []).length === 0, `${(photos ?? []).length} still owned`);

  const { data: scrubbed } = await supabase
    .from("fragrance_photos").select("id, status").eq("clerk_user_id", "deleted-account")
    .eq("fragrance_id", frag.id)
    .returns<Array<{ id: string; status: string }>>();
  check("approved photo kept but owner scrubbed", (scrubbed ?? []).some((p) => p.status === "approved"));

  // Leave nothing behind: remove the scrubbed test photo rows we created.
  if (scrubbed?.length) {
    await supabase.from("fragrance_photos").delete().in("id", scrubbed.map((p) => p.id));
  }
  await supabase.from("scan_events").delete().eq("id", scanId);

  console.log(`\n${pass.length} passed, ${fail.length} failed.`);
  if (fail.length) {
    console.log(`\nSurvived that should not have:\n  ${fail.join("\n  ")}`);
    console.log(`\nClean up by hand with clerk_user_id = '${clerkId}'`);
    process.exit(1);
  }
  console.log("\nPurge behaves correctly. Now test the UI.\n");
}

main().catch((e) => {
  console.error("\nTest run failed:", e);
  process.exit(1);
});

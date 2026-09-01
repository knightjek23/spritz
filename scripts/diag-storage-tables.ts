/**
 * Read-only check of what actually exists in the live Supabase project:
 * which storage buckets are there, and which tables the service role can
 * reach. Writes nothing, deletes nothing.
 *
 *   npm run diag:infra
 *
 * Written after `npm run test:purge` reported "Bucket not found" for
 * scan-images and "Could not find the table 'public.fragrance_photos'".
 * Those are infrastructure gaps, not purge bugs, and both have consequences
 * well beyond account deletion.
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && m[2].trim()) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const EXPECTED_BUCKETS = ["scan-images", "user-bottle-images"];

async function main() {
  console.log("\n=== STORAGE BUCKETS ===");
  const { data: buckets, error: bErr } = await sb.storage.listBuckets();
  if (bErr) {
    console.log("  error:", bErr.message);
  } else {
    const names = buckets.map((b) => b.name);
    for (const b of buckets) console.log(`  ${b.name.padEnd(24)} public: ${b.public}`);
    for (const want of EXPECTED_BUCKETS) {
      if (!names.includes(want)) console.log(`  MISSING: ${want}`);
    }
  }

  console.log("\n=== TABLES REACHABLE BY THE SERVICE ROLE ===");
  const tables = [
    "users", "collection_items", "scan_events", "user_reactions",
    "fragrance_photos", "fragrances", "affiliate_clicks",
    "bottle_image_embeddings", "fragrance_offers",
  ];
  for (const t of tables) {
    const { count, error } = await sb.from(t as never).select("*", { count: "exact", head: true });
    console.log(`  ${t.padEnd(26)} ${error ? "UNREACHABLE — " + error.message : String(count) + " rows"}`);
  }

  console.log("\n=== APPLIED MIGRATIONS (last 12) ===");
  const { data: migs, error: mErr } = await sb
    .schema("supabase_migrations" as never)
    .from("schema_migrations" as never)
    .select("version")
    .order("version", { ascending: false })
    .limit(12)
    .returns<Array<{ version: string }>>();
  if (mErr) console.log("  could not read migration history:", mErr.message);
  else console.log("  " + (migs ?? []).map((m) => m.version).join(", "));

  console.log("\nDone. Nothing was written.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });

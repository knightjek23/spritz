// Stage 4: upsert parsed + vectorized fragrances into Supabase.
// Uses service-role key (bypasses RLS). Idempotent on (name, house).
//
// Fragrantica's catalog has occasional duplicates (same name+house listed under
// two URLs — usually re-releases or regional variants). Postgres rejects an
// upsert batch when it contains two rows with the same conflict key, so we
// dedup the in-memory batch by (name_lower, house_lower) before sending.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";
import type { ScrapedFragrance } from "./types";

const PARSED_DIR = path.resolve("data/parsed");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

async function* walkJson(dir: string): AsyncGenerator<string> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name === "note_dictionary.json") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkJson(full);
    else if (entry.name.endsWith(".json")) yield full;
  }
}

interface FragranceRow extends ScrapedFragrance {
  note_vector?: number[];
}

/** Score a row's "completeness" so we keep the richer one when deduping. */
function rowScore(f: FragranceRow): number {
  return (
    f.top_notes.length * 2 +
    f.mid_notes.length * 2 +
    f.base_notes.length * 2 +
    f.family.length +
    (f.perfumer ? 5 : 0) +
    (f.year ? 2 : 0) +
    (f.bottle_image_url ? 1 : 0)
  );
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[upload] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
  }

  // Load all parsed rows into memory + dedup globally before any upload.
  // 1010 rows × ~10KB each ≈ 10MB — fine to hold in memory.
  console.log(`[upload] loading parsed JSONs from ${PARSED_DIR}…`);
  const byKey = new Map<string, FragranceRow>();
  let loaded = 0;
  let dropped = 0;
  for await (const file of walkJson(PARSED_DIR)) {
    const f: FragranceRow = JSON.parse(await fs.readFile(file, "utf8"));
    loaded++;
    const key = `${(f.name || "").toLowerCase().trim()}|${(f.house || "").toLowerCase().trim()}`;
    if (!key.includes("|") || key === "|") continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, f);
    } else {
      // Dedup: keep the row with more data
      const winner = rowScore(f) > rowScore(existing) ? f : existing;
      const loser = winner === f ? existing : f;
      console.log(`[upload]   dedup ${loser.house} — ${loser.name} (kept richer copy)`);
      byKey.set(key, winner);
      dropped++;
    }
  }
  console.log(`[upload] loaded=${loaded} unique=${byKey.size} duplicates_dropped=${dropped}\n`);

  // Now upload in batches, with the deduped working set.
  const all = Array.from(byKey.values());
  let total = 0;
  const PAGE = 500;
  for (let off = 0; off < all.length; off += PAGE) {
    const batch = all.slice(off, off + PAGE);
    const { error } = await supabase.from("fragrances").upsert(
      batch.map((f) => ({
        name: f.name,
        house: f.house,
        family: f.family,
        gender: f.gender,
        year: f.year,
        top_notes: f.top_notes,
        mid_notes: f.mid_notes,
        base_notes: f.base_notes,
        note_vector: f.note_vector,
        longevity_score: f.longevity_score,
        longevity_confidence: f.longevity_confidence,
        sillage_score: f.sillage_score,
        sillage_confidence: f.sillage_confidence,
        season_tags: f.season_tags,
        time_tags: f.time_tags,
        perfumer: f.perfumer,
        house_history: f.house_history,
        wear_guidance: f.wear_guidance,
        notes_descriptions: f.notes_descriptions,
        bottle_image_url: f.bottle_image_url,
        editorial_notes: f.editorial_notes,
        fragrantica_url: f.fragrantica_url,
        popularity_rank: f.popularity_rank,
      })),
      { onConflict: "name,house" },
    );
    if (error) {
      console.error("[upload] batch error", error);
      process.exit(1);
    }
    total += batch.length;
    console.log(`[upload] uploaded ${total}/${all.length}`);
  }

  console.log(`\n[upload] DONE — ${total} fragrances upserted`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

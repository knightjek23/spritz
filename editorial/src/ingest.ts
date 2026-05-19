// Ingest editorial content into Supabase.
//
// Mapping rules:
// - Notes: built into a single dictionary blob, then merged into the
//   matching `fragrances.notes_descriptions` jsonb on every row whose
//   pyramid mentions the note (matching by aliases too).
// - Houses: matched against `fragrances.house` (case-insensitive). The body
//   is written into `house_history` for every fragrance by that house.
// - Fragrances: matched against `(name, house)`. Body → `editorial_notes`,
//   `how_to_wear` → `wear_guidance` jsonb, `perfumer` → `perfumer` (only if
//   the scraper didn't already fill it).
//
// Idempotent. --dry-run prints what would change without writing.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { loadNotes, loadHouses, loadFragrances } from "./load.js";

const DRY = process.argv.includes("--dry-run");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

async function main() {
  console.log(`\n--- Spritz Editorial — ingest ${DRY ? "(DRY RUN)" : ""} ---\n`);

  const { items: notes, errors: noteErr } = await loadNotes();
  const { items: houses, errors: houseErr } = await loadHouses();
  const { items: fragrances, errors: fragErr } = await loadFragrances();

  const allErr = [...noteErr, ...houseErr, ...fragErr];
  if (allErr.length > 0) {
    console.error("Validation errors — fix these before ingesting:");
    for (const e of allErr) console.error(`  - ${e}`);
    process.exit(1);
  }

  // ---------- 1. Build the canonical note dictionary ----------
  // Maps every alias → the canonical description.
  const noteDict: Record<string, string> = {};
  for (const n of notes) {
    const aliases = [n.frontmatter.name, ...(n.frontmatter.aliases ?? [])];
    for (const a of aliases) noteDict[a.toLowerCase()] = n.body;
  }
  console.log(
    `[ingest] Note dictionary: ${notes.length} entries → ${Object.keys(noteDict).length} aliases`,
  );

  // ---------- 2. House histories — keyed by lowercase house name ----------
  const houseHistories: Record<string, string> = {};
  for (const h of houses) houseHistories[h.frontmatter.name.toLowerCase()] = h.body;
  console.log(`[ingest] House histories: ${houses.length}`);

  // ---------- 3. Fragrance editorials — keyed by (house, name) ----------
  console.log(`[ingest] Fragrance editorials: ${fragrances.length}`);

  // ---------- 4. Apply to Supabase ----------

  // Apply note descriptions + house histories to every fragrance row that has
  // matching notes/house. Stream pages so we don't load 10k rows at once.
  console.log(`\n[ingest] Updating fragrance rows…`);
  let from = 0;
  const PAGE = 500;
  let updated = 0;

  while (true) {
    const { data: page, error } = await supabase
      .from("fragrances")
      .select("id, name, house, top_notes, mid_notes, base_notes, notes_descriptions, house_history, perfumer, wear_guidance, editorial_notes")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!page || page.length === 0) break;

    for (const row of page as any[]) {
      const updates: Record<string, unknown> = {};

      // notes_descriptions: union of existing + matches from dictionary
      const allNoteNames: string[] = [
        ...(row.top_notes ?? []),
        ...(row.mid_notes ?? []),
        ...(row.base_notes ?? []),
      ].map((n: { name: string }) => n.name.toLowerCase());

      const newDescriptions: Record<string, string> = { ...(row.notes_descriptions ?? {}) };
      let descChanged = false;
      for (const noteName of allNoteNames) {
        const desc = noteDict[noteName];
        if (desc && newDescriptions[noteName] !== desc) {
          newDescriptions[noteName] = desc;
          descChanged = true;
        }
      }
      if (descChanged) updates.notes_descriptions = newDescriptions;

      // house_history: only set if our editorial covers this house
      const hh = houseHistories[(row.house ?? "").toLowerCase()];
      if (hh && hh !== row.house_history) updates.house_history = hh;

      // Per-fragrance editorial overrides
      const fragMatch = fragrances.find(
        (f) =>
          f.frontmatter.name.toLowerCase() === row.name.toLowerCase() &&
          f.frontmatter.house.toLowerCase() === row.house.toLowerCase(),
      );
      if (fragMatch) {
        if (fragMatch.body !== row.editorial_notes) updates.editorial_notes = fragMatch.body;
        if (fragMatch.frontmatter.how_to_wear) {
          updates.wear_guidance = fragMatch.frontmatter.how_to_wear;
        }
        if (fragMatch.frontmatter.dupes && fragMatch.frontmatter.dupes.length > 0) {
          // Stamp source="editorial" on every dupe so the UI can show the right badge.
          updates.dupes = fragMatch.frontmatter.dupes.map((d) => ({
            ...d,
            source: "editorial" as const,
          }));
        }
        if (fragMatch.frontmatter.perfumer && !row.perfumer) {
          updates.perfumer = fragMatch.frontmatter.perfumer;
        }
      }

      if (Object.keys(updates).length === 0) continue;

      if (DRY) {
        console.log(`  [dry] ${row.house} — ${row.name} (${Object.keys(updates).join(", ")})`);
      } else {
        const { error: upErr } = await supabase
          .from("fragrances")
          .update(updates)
          .eq("id", row.id);
        if (upErr) {
          console.error(`  ! ${row.house} — ${row.name}: ${upErr.message}`);
        } else {
          updated++;
        }
      }
    }

    from += page.length;
    if (page.length < PAGE) break;
  }

  console.log(`\n[ingest] DONE — ${DRY ? "would update" : "updated"} ${updated} rows`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

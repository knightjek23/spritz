// Rebuild note_vector for fragrances whose notes were replaced in the
// database (notes_status = 'replaced'), reading the notes FROM THE DATABASE.
//
// WHY THIS EXISTS, AND WHY NOT `pnpm vectorize && pnpm upload`
//   The original pipeline builds vectors from the scraped files in
//   data/parsed and then `upload` upserts those files over the database
//   rows. For a row whose notes now come from another source, that would
//   write the old scraped notes straight back, undoing the replacement (and
//   clobbering popularity and images on the way; see the warning at the top
//   of upload-to-supabase.ts). Never run `pnpm upload` or `pnpm all` to
//   refresh similarity after a notes import. Run this, then `pnpm compute-dupes`.
//
// What it does
//   * Uses the EXISTING note dictionary (data/parsed/note_dictionary.json)
//     so the new vectors live in the same 500 dimensions as every other row.
//   * Same formula as note-vector.ts: weight x tier (top 0.4, heart 0.4,
//     base 0.2), then normalised to unit length.
//   * Writes ONLY the note_vector column, ONLY on replaced rows.
//   * A note can miss the dictionary (new wording, or a note outside the top
//     500). The script reports coverage per run and lists the weakest rows.
//     A row where no note maps at all is NOT written: an all-zero vector
//     would silently drop it out of "similar fragrances".
//
// Two modes, both reading notes from the database:
//   default     rows whose notes were replaced (notes_status = 'replaced')
//   --missing   rows that have no note_vector at all. These were added by
//               catalog expansions whose upload ran without the vector step,
//               so "similar fragrances" has nothing to show for them.
//
// Usage (run from scraper/):
//   pnpm revectorize:replaced            # dry run
//   pnpm revectorize:replaced --write
//   pnpm revectorize:missing             # dry run
//   pnpm revectorize:missing --write
//
// Then, to rebuild the similar-fragrance lists from the new vectors:
//   pnpm compute-dupes

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { normalizeNote } from "./notes-compare";

const WRITE = process.argv.includes("--write");
const MISSING = process.argv.includes("--missing");
const TARGET = MISSING ? "rows with no vector" : "replaced rows";
const DICT_FILE = path.resolve("data/parsed/note_dictionary.json");
const VECTOR_DIM = 500;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

// Copy of normalizeNoteName in note-vector.ts. It cannot be imported: that
// file runs its whole pipeline on import and would rewrite data/parsed.
function normalizeNoteName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+oil$/, "")
    .replace(/^(italian|moroccan|sicilian|french|indian)\s+/, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

interface Note { name: string; weight?: number }
interface Row {
  id: string;
  name: string;
  house: string;
  popularity_rank: number | null;
  top_notes: Note[] | null;
  mid_notes: Note[] | null;
  base_notes: Note[] | null;
}

async function main() {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[k]) {
      console.error(`[revectorize] missing ${k} in scraper/.env`);
      process.exit(1);
    }
  }

  let dict: Record<string, number>;
  try {
    dict = JSON.parse(await fs.readFile(DICT_FILE, "utf8")) as Record<string, number>;
  } catch {
    console.error(`[revectorize] cannot read ${DICT_FILE}. Run from scraper/. Do NOT run "pnpm vectorize" to create it.`);
    process.exit(1);
  }
  // Second lookup: dictionary keys under the wider normaliser, so a source
  // that writes "Blackcurrant" or "Cedarwood" still lands on the dictionary's
  // "black currant" / "cedar".
  const byAlias = new Map<string, number>();
  for (const [key, idx] of Object.entries(dict)) {
    const k = normalizeNote(key);
    if (k && !byAlias.has(k)) byAlias.set(k, idx);
  }
  const lookup = (name: string): number | undefined =>
    dict[normalizeNoteName(name)] ?? byAlias.get(normalizeNote(name));

  console.log(`--- Spritz: rebuild note vectors for ${TARGET} ---`);
  console.log(`  mode:        ${WRITE ? "WRITE" : "dry run (no DB writes)"}`);
  console.log(`  dictionary:  ${Object.keys(dict).length} notes`);

  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const base = supabase
      .from("fragrances")
      .select("id, name, house, popularity_rank, top_notes, mid_notes, base_notes");
    const scoped = MISSING ? base.is("note_vector", null) : base.eq("notes_status", "replaced");
    const { data, error } = await scoped
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<Row[]>();
    if (error) {
      console.error(`[revectorize] query failed: ${error.message}`);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  console.log(`  ${TARGET}: ${rows.length}\n`);
  if (rows.length === 0) return;

  // In --missing mode a written row leaves the "no vector" set, so paging by
  // offset while writing would skip rows. All rows are loaded above before
  // any write, which is why the loop below is safe.
  let notesTotal = 0;
  let notesMapped = 0;
  let noNotes = 0;
  let written = 0;
  let errors = 0;
  const unmappedCounts = new Map<string, number>();
  const weak: Array<{ label: string; mapped: number; total: number }> = [];
  const zero: string[] = [];

  for (const f of rows) {
    const vec: number[] = new Array(VECTOR_DIM).fill(0);
    let total = 0;
    let mapped = 0;
    const apply = (notes: Note[] | null, layer: number) => {
      for (const n of notes ?? []) {
        total++;
        const idx = lookup(n.name);
        if (idx === undefined || idx < 0 || idx >= VECTOR_DIM) {
          const k = normalizeNote(n.name) || n.name.toLowerCase();
          unmappedCounts.set(k, (unmappedCounts.get(k) ?? 0) + 1);
          continue;
        }
        mapped++;
        vec[idx] += (typeof n.weight === "number" ? n.weight : 1) * layer;
      }
    };
    apply(f.top_notes, 0.4);
    apply(f.mid_notes, 0.4);
    apply(f.base_notes, 0.2);
    notesTotal += total;
    notesMapped += mapped;

    const label = `#${f.popularity_rank ?? "?"} ${f.house} - ${f.name}`;
    if (total === 0) {
      noNotes++; // nothing to build a vector from
      continue;
    }
    if (mapped === 0) {
      zero.push(label);
      continue;
    }
    if (mapped / total < 0.6) weak.push({ label, mapped, total });

    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    const unit = vec.map((v) => v / mag);

    if (WRITE) {
      const { error } = await supabase.from("fragrances").update({ note_vector: unit }).eq("id", f.id);
      if (error) {
        errors++;
        console.log(`  ! ${label}: ${error.message}`);
      } else written++;
    }
  }

  const pct = notesTotal ? Math.round((100 * notesMapped) / notesTotal) : 0;
  console.log("--- Coverage ---");
  console.log(`  notes on these rows         ${notesTotal}`);
  console.log(`  mapped to the dictionary    ${notesMapped} (${pct}%)`);
  console.log(`  rows with a usable vector   ${rows.length - zero.length - noNotes} of ${rows.length}`);
  console.log(`  rows with no notes at all   ${noNotes}  (skipped)`);
  console.log(`  rows under 60% mapped       ${weak.length}`);
  console.log(`  rows with no note mapped    ${zero.length}  (not written; vector left as it was)`);
  if (weak.length) {
    console.log("\n  weakest rows:");
    for (const w of weak.sort((a, b) => a.mapped / a.total - b.mapped / b.total).slice(0, 10)) {
      console.log(`    ${w.mapped}/${w.total}  ${w.label}`);
    }
  }
  if (zero.length) console.log(`\n  no note mapped: ${zero.slice(0, 10).join("; ")}`);
  const topUnmapped = [...unmappedCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (topUnmapped.length) {
    console.log("\n  most common notes missing from the dictionary:");
    console.log("    " + topUnmapped.map(([k, n]) => `${k} (${n})`).join(", "));
  }
  if (WRITE) {
    console.log(`\n  written ${written}   errors ${errors}`);
    console.log("Next: pnpm compute-dupes   (rebuilds every similar-fragrance list from the vectors)");
  } else {
    console.log("\nDry run: nothing was written.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

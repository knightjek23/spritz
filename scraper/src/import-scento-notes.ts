// Bring notes in from the Scento perfume dataset (CC BY 4.0).
//
// Source: https://github.com/Scento-com/perfume-dataset, saved at
// data/scento/perfumes.jsonl with its LICENSE. Requires migrations 0043, 0044.
//
// THE RULE (confirmed 12 Nov 2026)
//   1. Scento's notes DIFFER from the catalog row  -> Scento's notes replace
//      the row and the origin is recorded as 'scento'.
//   2. Scento's notes are the SAME OR NEARLY THE SAME as the catalog row
//      (80% or more of the notes in common) -> nothing is written.
//      A sample check found Scento rows that reproduce the catalog's
//      Fragrantica-origin pyramid where the brand's own page says otherwise,
//      so an identical row is not independent confirmation. These rows stay
//      'unverified' and are listed for a brand-page check.
//   3. A row already verified against a brand or retailer page (status
//      'match' or 'replaced') is never touched. The brand page wins.
//   4. Every row that takes Scento's notes gets notes_source_url set to its
//      scento.com page, which the sources footer must credit as
//      "Scento - https://www.scento.com/perfume-database" (licence condition).
//
// Only Scento rows with all three tiers filled are used. Pairing is by house,
// name and strength (scento-match.ts); anything ambiguous is skipped.
//
// SAFE BY DEFAULT
//   * Dry run unless --write is passed.
//   * Only paired rows whose notes differ can change. Every other row is untouched.
//   * --write refuses any row with no snapshot in fragrance_provenance.
//   * Pairs where neither side records a strength are reported but not
//     written unless --include-unconfirmed is passed.
//
// Usage (run from scraper/):
//   pnpm import:scento                         # dry run, full report
//   pnpm import:scento --write                 # apply strength-confirmed pairs
//   pnpm import:scento --write --include-unconfirmed
//
// After a --write run, replaced rows have stale note vectors and similarity
// pairs until those are recomputed.

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildReplacement, compareNotes, noteOverlap, type StoredNote } from "./notes-compare";
import { pairRows, type ScentoRow } from "./scento-match";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const INCLUDE_UNCONFIRMED = args.includes("--include-unconfirmed");
const DATA_FILE = path.resolve("data/scento/perfumes.jsonl");

// Rule 2 threshold. The first dry run counted a row as "different" on any
// difference at all, so a 24-note pyramid that matched the catalog except
// for one spelling was treated as independent and queued for replacement.
// A row this close to the catalog's is not evidence of a separate source.
const NEAR_IDENTICAL = 0.8;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

interface Row {
  id: string;
  name: string;
  house: string;
  concentration: string | null;
  concentrations: string[] | null;
  popularity_rank: number | null;
  notes_status: string;
  top_notes: StoredNote[] | null;
  mid_notes: StoredNote[] | null;
  base_notes: StoredNote[] | null;
}

type Action =
  | "replace"            // rule 1, will be written
  | "identical"          // rule 2, queued for a brand check
  | "already_verified"   // rule 3
  | "needs_review"       // replacement not safe to apply automatically
  | "unconfirmed";       // would replace, but strength is not recorded

async function loadCatalog(): Promise<Row[]> {
  const all: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("fragrances")
      .select("id, name, house, concentration, concentrations, popularity_rank, notes_status, top_notes, mid_notes, base_notes")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<Row[]>();
    if (error) {
      console.error(`[import:scento] catalog query failed: ${error.message}`);
      console.error("  If the error names notes_status, migration 0043 has not been pushed yet.");
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}

async function main() {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[k]) {
      console.error(`[import:scento] missing ${k} in scraper/.env`);
      process.exit(1);
    }
  }

  let raw: string;
  try {
    raw = await fs.readFile(DATA_FILE, "utf8");
  } catch {
    console.error(`[import:scento] cannot read ${DATA_FILE}. Run from scraper/.`);
    process.exit(1);
  }
  const scentoAll = raw.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l) as ScentoRow);
  const scento = scentoAll.filter(
    (s) => s.top_notes?.length > 0 && s.heart_notes?.length > 0 && s.base_notes?.length > 0,
  );

  console.log("--- Spritz: import notes from the Scento dataset ---");
  console.log(`  mode:    ${WRITE ? "WRITE" : "dry run (no DB writes)"}${INCLUDE_UNCONFIRMED ? ", including strength-unconfirmed pairs" : ""}`);
  console.log(`  scento:  ${scentoAll.length} rows, ${scento.length} with all three tiers`);

  const catalog = await loadCatalog();
  console.log(`  catalog: ${catalog.length} fragrances\n`);

  const { pairs, skipped } = pairRows(scento, catalog);

  const counts: Record<Action | "written" | "error", number> = {
    replace: 0, identical: 0, already_verified: 0, needs_review: 0, unconfirmed: 0, written: 0, error: 0,
  };
  const report: unknown[] = [];
  const now = new Date().toISOString();

  for (const p of pairs) {
    const f = p.catalog;
    const s = p.scento;
    const stored = { top: f.top_notes ?? [], mid: f.mid_notes ?? [], base: f.base_notes ?? [] };
    const source = { top: s.top_notes, mid: s.heart_notes, base: s.base_notes, flat: [] };
    const cmp = compareNotes(stored, source);
    const overlap = noteOverlap(stored, source);
    const sameSet = overlap >= NEAR_IDENTICAL;

    let action: Action;
    if (f.notes_status === "match" || f.notes_status === "replaced") action = "already_verified";
    else if (sameSet) action = "identical";
    else if (cmp.outcome !== "replaced") action = "needs_review";
    else if (!p.strengthConfirmed && !INCLUDE_UNCONFIRMED) action = "unconfirmed";
    else action = "replace";
    counts[action]++;

    let writeError: string | null = null;
    if (WRITE && action === "replace") {
      const { data: prov, error: provErr } = await supabase
        .from("fragrance_provenance")
        .select("fragrance_id, legacy_saved_at")
        .eq("fragrance_id", f.id)
        .maybeSingle();
      if (provErr) writeError = `provenance lookup failed: ${provErr.message}`;
      else if (!prov || !prov.legacy_saved_at) writeError = "no snapshot in fragrance_provenance; row skipped";
      else {
        const rep = buildReplacement(source);
        const { error } = await supabase
          .from("fragrances")
          .update({
            top_notes: rep.top,
            mid_notes: rep.mid,
            base_notes: rep.base,
            notes_status: "replaced",
            notes_source_url: s.url,
            notes_verified_at: now,
            notes_tiers_verified: true,
          })
          .eq("id", f.id);
        if (error) writeError = error.message;
        else {
          const { error: pErr } = await supabase
            .from("fragrance_provenance")
            .update({ notes_origin: "scento", updated_at: now })
            .eq("fragrance_id", f.id);
          if (pErr) writeError = `notes written but origin not updated: ${pErr.message}`;
        }
      }
      if (writeError) {
        counts.error++;
        console.log(`  ! ${f.house} - ${f.name}: ${writeError}`);
      } else counts.written++;
    }

    report.push({
      catalog_id: f.id,
      rank: f.popularity_rank,
      house: f.house,
      name: f.name,
      catalog_strength: f.concentrations?.length ? f.concentrations : f.concentration,
      scento_id: s.id,
      scento_name: s.name,
      scento_strength: s.concentration || null,
      scento_url: s.url,
      strength_confirmed: p.strengthConfirmed,
      action,
      overlap: Math.round(overlap * 100) / 100,
      reason: cmp.reason,
      added: cmp.added,
      removed: cmp.removed,
      stored: { top: stored.top.map((n) => n.name), heart: stored.mid.map((n) => n.name), base: stored.base.map((n) => n.name) },
      scento: { top: s.top_notes, heart: s.heart_notes, base: s.base_notes },
      written: WRITE && action === "replace" && !writeError,
      write_error: writeError,
    });
  }

  const skipReasons: Record<string, number> = {};
  for (const k of skipped) {
    const r = k.reason.replace(/[0-9]+ /g, "");
    skipReasons[r] = (skipReasons[r] ?? 0) + 1;
  }

  // Most popular first, so the top of the report is what users see most.
  report.sort((a, b) => {
    const ra = (a as { rank: number | null }).rank ?? Number.MAX_SAFE_INTEGER;
    const rb = (b as { rank: number | null }).rank ?? Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
  const stamp = now.replace(/[:.]/g, "-");
  const outFile = path.resolve("data", `import-scento-${WRITE ? "write" : "dry"}-${stamp}.json`);
  await fs.writeFile(
    outFile,
    JSON.stringify({ pairs: report, skipped: skipped.map((k) => ({ scento_id: k.scento.id, house: k.scento.house, name: k.scento.name, reason: k.reason })) }, null, 2),
    "utf8",
  );

  const top500 = (action: Action) =>
    report.filter((r) => (r as { action: Action; rank: number | null }).action === action && ((r as { rank: number | null }).rank ?? 1e9) <= 500).length;

  console.log("--- Coverage ---");
  console.log(`  scento rows with tiers          ${scento.length}`);
  console.log(`  paired with a catalog fragrance ${pairs.length}`);
  console.log(`  not paired                      ${skipped.length}`);
  for (const [r, n] of Object.entries(skipReasons).sort((a, b) => b[1] - a[1])) console.log(`      ${String(n).padStart(5)}  ${r}`);
  console.log("");
  console.log(`  replace (notes differ)          ${counts.replace}   (${top500("replace")} in your top 500)`);
  console.log(`  held: strength not recorded     ${counts.unconfirmed}   (${top500("unconfirmed")} in your top 500)`);
  console.log(`  same or nearly the same, queued  ${counts.identical}   (${top500("identical")} in your top 500)`);
  console.log(`  needs review                    ${counts.needs_review}`);
  console.log(`  already verified, untouched     ${counts.already_verified}`);
  if (WRITE) console.log(`  written                         ${counts.written}   errors ${counts.error}`);
  console.log(`\nReport: ${outFile}`);
  if (!WRITE) console.log("Dry run: nothing was written.");
  if (WRITE && counts.written > 0) {
    console.log("Replaced rows have stale note vectors and similarity pairs until those are recomputed.");
    console.log('Licence: credit "Scento - https://www.scento.com/perfume-database" wherever these notes are shown.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Walk every fragrance row and populate `concentration` from the name
// where the strength is explicit. No API calls — pure regex parsing,
// runs in ~10 seconds for a 7k-row catalog. Idempotent (filters
// concentration IS NULL) so it's safe to re-run.
//
// Coverage expectation: about 60-80% of the catalog. Most flanker
// releases carry the strength in the name ("Bleu de Chanel Eau de
// Parfum", "Aventus Extrait", "Sauvage EDT"). Base fragrances with no
// concentration in the name stay NULL — the UI hides the field for
// them rather than guessing.
//
// Run with:
//   cd scraper && pnpm concentration
// Flags:
//   --limit=N   process only N rows (smoke test)
//   --dry       log what would be updated without writing to DB
//   --all       process every row (not just NULL) — use to re-parse
//               after tweaking the regex. Overwrites existing values.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

const args = process.argv.slice(2);
const LIMIT = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0");
const DRY = args.includes("--dry");
const ALL = args.includes("--all");

type Concentration = "edt" | "edp" | "parfum" | "extrait";

/** Same parser as lib/concentrations.ts. Duplicated so the scraper
 *  stays self-contained (no lib/ imports). If the app-side rules
 *  change, mirror the update here. */
function parseConcentrationFromName(name: string): Concentration | null {
  if (/\beau\s+de\s+parfum\b/i.test(name)) return "edp";
  if (/\beau\s+de\s+toilette\b/i.test(name)) return "edt";
  if (/\bextrait(\s+de\s+parfum)?\b/i.test(name)) return "extrait";
  if (/\bparfum\b/i.test(name)) return "parfum";
  if (/\bedp\b/i.test(name)) return "edp";
  if (/\bedt\b/i.test(name)) return "edt";
  return null;
}

interface FragranceRow {
  id: string;
  name: string;
  house: string;
  concentration: Concentration | null;
}

// Supabase's PostgREST silently caps .select() at 1000 rows per query.
// We paginate through the full catalog with .range(offset, offset+N-1)
// so the backfill actually covers everything, not just the first 1000.
const PAGE_SIZE = 500;

async function main() {
  console.log("--- Spritz concentration backfill ---");
  if (DRY) console.log("  (dry run — no DB writes)");
  if (ALL) console.log("  (--all — re-parsing every row, overwriting existing)");
  if (LIMIT) console.log(`  limit: ${LIMIT}`);

  // Fast pre-count so the log can show progress against a real total.
  const { count: totalCount } = await supabase
    .from("fragrances")
    .select("id", { count: "exact", head: true });
  console.log(`  catalog size: ${totalCount ?? "unknown"} fragrances`);

  let matched = 0;
  let skipped = 0;
  let written = 0;
  let failed = 0;
  let processed = 0;
  let offset = 0;
  const byType: Record<Concentration, number> = {
    edt: 0, edp: 0, parfum: 0, extrait: 0,
  };

  while (true) {
    if (LIMIT && processed >= LIMIT) break;
    const remaining = LIMIT ? LIMIT - processed : PAGE_SIZE;
    const pageSize = Math.min(PAGE_SIZE, remaining);

    // Order by id for stable pagination — otherwise Postgres can shuffle
    // rows between queries and we'd double-process some, skip others.
    const { data, error } = await supabase
      .from("fragrances")
      .select("id, name, house, concentration")
      .order("id")
      .range(offset, offset + pageSize - 1)
      .returns<FragranceRow[]>();

    if (error) {
      console.error("Supabase query failed:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      processed++;

      // Skip rows that already have a value unless --all is set. This
      // filter runs client-side (rather than as a WHERE clause) so the
      // pagination offset stays stable across runs — using .is(null)
      // with .range() would double-scan rows we've already updated.
      if (!ALL && row.concentration !== null) continue;

      const parsed = parseConcentrationFromName(row.name);
      if (!parsed) {
        skipped++;
        continue;
      }
      matched++;
      byType[parsed]++;

      if (DRY) {
        console.log(`  [dry] ${row.house} — ${row.name} → ${parsed}`);
        continue;
      }

      const { error: upErr } = await supabase
        .from("fragrances")
        .update({ concentration: parsed })
        .eq("id", row.id);
      if (upErr) {
        console.warn(`  ! ${row.house} — ${row.name}: ${upErr.message}`);
        failed++;
      } else {
        written++;
        if (written % 100 === 0) {
          console.log(
            `  ✓ ${written} written · ${processed}/${totalCount ?? "?"} scanned (${failed} failed)`,
          );
        }
      }
    }

    offset += data.length;
    // If we got fewer than a full page, we've hit the end.
    if (data.length < pageSize) break;
  }

  console.log("");
  console.log(
    `Done. processed=${processed} matched=${matched} skipped_no_match=${skipped} written=${written} failed=${failed}`,
  );
  console.log(
    `Breakdown: EDT=${byType.edt}, EDP=${byType.edp}, Parfum=${byType.parfum}, Extrait=${byType.extrait}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

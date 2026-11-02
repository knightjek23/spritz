// Audit: do the NEW catalog rows have everything the existing rows have?
//
//   npx tsx src/audit-new-rows.ts                     # new = created on/after 2026-11-01
//   CUTOFF=2026-11-01T00:00:00Z npx tsx src/audit-new-rows.ts
//
// Compares field coverage (non-null and non-empty) on the new rows against a
// 1,500-row sample of the existing catalog, for every fragrances column and
// for the per-fragrance tables (retailer offers, prices, scan embeddings,
// dupe pairs). Prints one table plus the pipeline step that fills each gap.
// Exits 1 when any field on the new rows is more than GAP points below the
// existing catalog, so it can't pass quietly. Read-only: writes nothing.
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in scraper/.env.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const CUTOFF = process.env.CUTOFF ?? "2026-11-01T00:00:00Z";
const GAP = Number(process.env.GAP ?? 5); // percentage points
const OLD_SAMPLE = 1500;
const PAGE = 1000; // PostgREST's default max rows per request

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

// Which step fills each field. Anything not listed comes from the scrape.
const FILLED_BY: Record<string, string> = {
  note_vector: "npm run vectorize (before upload:new)",
  longevity_description: "npx tsx src/generate-performance-descriptions.ts",
  projection_description: "npx tsx src/generate-performance-descriptions.ts",
  consensus_summary: "npm run consensus",
  consensus_verdict: "npm run consensus",
  consensus_pros: "npm run consensus",
  consensus_cons: "npm run consensus",
  consensus_confidence: "npm run consensus",
  consensus_generated_at: "npm run consensus",
  popularity_score: "npm run popularity",
  popularity_rank: "scripts/rank-popularity.sql",
  concentration: "npm run repair:concentration",
  concentrations: "npm run repair:concentration",
  concentration_source: "npm run repair:concentration",
  ean: "npm run backfill:images (both feeds)",
  "table:fragrance_offers": "npm run backfill:images --retailer=... (both feeds)",
  "table:fragrance_prices": "upload:new runs prices:estimate --new-only; feeds add more",
  "table:bottle_image_embeddings": "npm run embed:images",
  "table:dupe_pairs": "npm run compute-dupes",
};

// Columns not worth comparing (ids, timestamps, the vector is checked by count).
const SKIP = new Set(["id", "created_at", "updated_at", "note_vector"]);

function filled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

async function fetchRows(newRows: boolean): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from("fragrances").select("*");
    q = newRows ? q.gte("created_at", CUTOFF) : q.lt("created_at", CUTOFF);
    const to = newRows ? from + PAGE - 1 : Math.min(from + PAGE, OLD_SAMPLE) - 1;
    // uuid order is effectively random, so the old slice is a fair sample.
    const { data, error } = await q.order("id").range(from, to);
    if (error) throw new Error(`fragrances fetch failed: ${error.message}`);
    out.push(...(data ?? []).map(({ note_vector: _v, ...rest }) => rest));
    if (!data || data.length < to - from + 1 || (!newRows && out.length >= OLD_SAMPLE)) break;
  }
  return out;
}

async function vectorCount(newRows: boolean, ids: string[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const { count, error } = await supabase
      .from("fragrances")
      .select("id", { count: "exact", head: true })
      .in("id", ids.slice(i, i + 200))
      .not("note_vector", "is", null);
    if (error) throw new Error(`note_vector count failed: ${error.message}`);
    n += count ?? 0;
  }
  return n;
}

// Distinct ids that have at least one row in `table`. Chunk sizes keep each
// response under PAGE rows; a full page means it may be truncated, so fail.
async function coveredIds(table: string, col: string, ids: string[], chunk: number): Promise<Set<string>> {
  const got = new Set<string>();
  for (let i = 0; i < ids.length; i += chunk) {
    const { data, error } = await supabase.from(table).select(col).in(col, ids.slice(i, i + chunk)).limit(PAGE);
    if (error) throw new Error(`${table} fetch failed: ${error.message}`);
    if ((data?.length ?? 0) >= PAGE) throw new Error(`${table}: a chunk hit ${PAGE} rows, lower the chunk size`);
    for (const r of data ?? []) got.add((r as Record<string, string>)[col]);
  }
  return got;
}

const pct = (n: number, d: number) => (d === 0 ? 0 : (100 * n) / d);

async function main() {
  console.log(`[audit] new rows = created_at >= ${CUTOFF}; old = ${OLD_SAMPLE}-row sample before it`);
  const [fresh, old] = await Promise.all([fetchRows(true), fetchRows(false)]);
  console.log(`[audit] new rows: ${fresh.length}   old sample: ${old.length}\n`);
  if (fresh.length === 0) {
    console.error("✗ No new rows found. Has upload:new run? Is CUTOFF right?");
    process.exit(1);
  }

  const cols = Object.keys(old[0] ?? fresh[0]).filter((c) => !SKIP.has(c));
  const rows: { field: string; oldP: number; newP: number; newN: number }[] = [];
  for (const c of cols) {
    rows.push({
      field: c,
      oldP: pct(old.filter((r) => filled(r[c])).length, old.length),
      newP: pct(fresh.filter((r) => filled(r[c])).length, fresh.length),
      newN: fresh.filter((r) => filled(r[c])).length,
    });
  }

  const freshIds = fresh.map((r) => r.id as string);
  const oldIds = old.map((r) => r.id as string);
  const [vNew, vOld] = await Promise.all([vectorCount(true, freshIds), vectorCount(false, oldIds)]);
  rows.push({ field: "note_vector", oldP: pct(vOld, oldIds.length), newP: pct(vNew, freshIds.length), newN: vNew });

  const tables: [string, string, number][] = [
    ["fragrance_offers", "fragrance_id", 100],
    ["fragrance_prices", "fragrance_id", 100],
    ["bottle_image_embeddings", "fragrance_id", 100],
    ["dupe_pairs", "fragrance_a", 15], // up to 50 rows per fragrance
  ];
  for (const [t, col, chunk] of tables) {
    const [a, b] = await Promise.all([coveredIds(t, col, freshIds, chunk), coveredIds(t, col, oldIds, chunk)]);
    rows.push({ field: `table:${t}`, oldP: pct(b.size, oldIds.length), newP: pct(a.size, freshIds.length), newN: a.size });
  }

  // Retailer names on existing offers, so backfill:images uses the same --retailer spelling.
  const { data: offerRows } = await supabase.from("fragrance_offers").select("retailer").limit(PAGE);
  const retailers = new Map<string, number>();
  for (const r of offerRows ?? []) retailers.set(r.retailer as string, (retailers.get(r.retailer as string) ?? 0) + 1);
  console.log(`[audit] retailer names on existing offers (first ${PAGE}): ` + [...retailers].map(([k, v]) => `"${k}" ${v}`).join(", ") + "\n");

  const short = rows.filter((r) => r.oldP >= GAP && r.newP < r.oldP - GAP);
  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(pad("field", 32) + pad("existing", 10) + pad("new", 10) + "new rows filled");
  for (const r of rows.sort((a, b) => b.oldP - b.newP - (a.oldP - a.newP))) {
    const flag = short.includes(r) ? "  ✗" : "";
    console.log(pad(r.field, 32) + pad(r.oldP.toFixed(0) + "%", 10) + pad(r.newP.toFixed(0) + "%", 10) + `${r.newN}/${fresh.length}${flag}`);
  }

  if (short.length === 0) {
    console.log(`\n✓ New rows match the existing catalog on every field (within ${GAP} points).`);
    return;
  }
  console.log(`\n⚠ COVERAGE: ${short.length} field(s) on the new rows are more than ${GAP} points below the existing catalog:`);
  const steps = new Map<string, string[]>();
  for (const r of short) {
    const step = FILLED_BY[r.field] ?? "comes from the scrape: check parse output for these rows";
    steps.set(step, [...(steps.get(step) ?? []), r.field]);
  }
  for (const [step, fields] of steps) console.log(`  ${step}\n      → ${fields.join(", ")}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});

// Import the cited sales / rank claims from the research report
// "Fragrance blockbuster sales figures" (12 Nov 2026) into
// fragrance_sales_claims (migration 0045).
//
// INPUT  data/sales-claims.json  { claims: [{ label, house, match_name, tier,
//        pending, figure, unit_type, period, geography, source_type,
//        source_url, confidence, notes, fragrance_id }] }
//   tier      the fragrance's tier: A independent 2023+, B brand-claimed rank
//             2023+, C older / unattributed / secondhand
//   pending   secondhand (seen only via Scento): display as C until checked
//   match_name null = a line or franchise claim; stored with no fragrance
//   fragrance_id  set by hand to override name matching
//
// MATCHING  houseKey + nameKey (scento-match.ts) equality against the catalog.
//   Several catalog rows (EDT/EDP/Parfum) -> the most popular one is linked
//   and the claim is listed as "ambiguous" so it can be pinned by hand.
//
// SAFE BY DEFAULT  Dry run unless --write. --write REPLACES the whole table
// (it holds only this import), so re-running after editing the JSON is safe.
//
// Usage (run from scraper/):
//   pnpm import:sales-claims          # dry report
//   pnpm import:sales-claims --write

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { houseKey, nameKey } from "./scento-match";

const WRITE = process.argv.includes("--write");
const INPUT = path.resolve("data/sales-claims.json");

interface Claim {
  label: string;
  house: string;
  match_name: string | null;
  tier: "A" | "B" | "C" | null;
  pending: boolean;
  figure: string;
  unit_type: string | null;
  period: string | null;
  geography: string | null;
  source_type: string | null;
  source_url: string | null;
  confidence: string | null;
  notes: string | null;
  fragrance_id: string | null;
}
type F = { id: string; name: string; house: string; popularity_rank: number | null };

async function main() {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[k]) {
      console.error(`[sales-claims] missing ${k} in scraper/.env`);
      process.exit(1);
    }
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { claims } = JSON.parse(await fs.readFile(INPUT, "utf8")) as { claims: Claim[] };
  console.log("--- Spritz: sales claims import ---");
  console.log(`  mode: ${WRITE ? "WRITE (replaces fragrance_sales_claims)" : "dry run"}   claims: ${claims.length}\n`);

  const frags: F[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("fragrances").select("id, name, house, popularity_rank").order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    frags.push(...(data as F[]));
    if (data.length < 1000) break;
  }
  const index = new Map<string, F[]>();
  for (const f of frags) {
    const k = `${houseKey(f.house)}|${nameKey(f.name)}`;
    index.set(k, [...(index.get(k) ?? []), f]);
  }

  const linked: (Claim & { fragrance_id: string | null })[] = [];
  const unmatched = new Map<string, Claim>();
  const ambiguous = new Map<string, F[]>();
  for (const c of claims) {
    let id = c.fragrance_id;
    if (!id && c.match_name) {
      const hits = index.get(`${houseKey(c.house)}|${nameKey(c.match_name)}`) ?? [];
      if (hits.length === 0) unmatched.set(`${c.house} - ${c.match_name}`, c);
      else {
        const best = [...hits].sort((a, b) => (a.popularity_rank ?? Infinity) - (b.popularity_rank ?? Infinity))[0];
        id = best.id;
        if (hits.length > 1) ambiguous.set(`${c.house} - ${c.match_name}`, hits);
      }
    }
    linked.push({ ...c, fragrance_id: id ?? null });
  }

  const fragTier = new Map<string, string>();
  for (const c of linked) if (c.fragrance_id && c.tier) fragTier.set(c.fragrance_id, c.pending ? "C(pending)" : c.tier);
  const tally: Record<string, number> = {};
  for (const t of fragTier.values()) tally[t] = (tally[t] ?? 0) + 1;

  console.log(`  linked claims:   ${linked.filter((c) => c.fragrance_id).length}/${claims.length}`);
  console.log(`  fragrances:      ${fragTier.size}  ${JSON.stringify(tally)}`);
  console.log(`  line/franchise:  ${claims.filter((c) => !c.match_name).length} (stored unlinked)`);
  console.log(`  not in catalog:  ${unmatched.size}`);
  for (const k of unmatched.keys()) console.log(`    - ${k}`);
  console.log(`  ambiguous:       ${ambiguous.size} (linked to the most popular row; pin fragrance_id in the JSON to override)`);
  for (const [k, hits] of ambiguous) console.log(`    - ${k}: ${hits.map((h) => `${h.name} #${h.popularity_rank ?? "-"}`).join(" | ")}`);

  if (WRITE) {
    const { error: delErr } = await supabase.from("fragrance_sales_claims").delete().not("id", "is", null);
    if (delErr) throw new Error(`clear failed: ${delErr.message}`);
    const rows = linked.map((c) => ({
      fragrance_id: c.fragrance_id,
      label: c.label,
      house: c.house,
      tier: c.tier,
      pending: c.pending,
      figure: c.figure,
      unit_type: c.unit_type,
      period: c.period,
      geography: c.geography,
      source_type: c.source_type,
      source_url: c.source_url,
      confidence: c.confidence,
      notes: c.notes,
    }));
    const { error } = await supabase.from("fragrance_sales_claims").insert(rows);
    if (error) throw new Error(`insert failed: ${error.message}`);
    console.log(`\n  written: ${rows.length} claims`);
  }

  const outFile = path.resolve(`data/sales-claims-${WRITE ? "write" : "dry"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await fs.writeFile(
    outFile,
    JSON.stringify({ tally, unmatched: [...unmatched.keys()], ambiguous: Object.fromEntries([...ambiguous].map(([k, v]) => [k, v])), linked }, null, 2),
  );
  console.log(`\n  report: ${path.relative(process.cwd(), outFile)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

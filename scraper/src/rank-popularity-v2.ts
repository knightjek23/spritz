// Popularity v2: compute fragrances.popularity_rank_v2 from measured signals.
// Approved by Josh 2026-11-12. Writes ONLY the v2 columns (migration 0045);
// fragrances.popularity_rank, which the app reads today, is never touched.
//
// SCORE (revised 14 Nov 2026; full rules in popularity-v2-core.ts rankRows)
//   rows with a FragranceNet signal:
//     0.90 * (0.25 position pct + 0.25 review pct + 0.50 AI pct) + 0.10 * house
//     position and reviews ranked within price tier
//   rows FragranceNet doesn't sell: same formula, with position and review
//   percentiles imputed from the 50 sold rows nearest them by AI percentile
//   house = data/house-popularity.json score / 100 (deep research, 14 Nov 2026);
//   a house with no score leaves the row's other inputs at full weight.
//   Tier A sales-verified fragrances (fragrance_sales_claims, tier 'A', not
//   pending) are lifted above every other row, keeping their order.
//
//   Percentiles are computed within each input's own population: position
//   and reviews among matched rows, AI score among rows that have one.
//   Ties: mid-rank. Final rank ties break on fragrance id (stable).
//
// GATE (no silent partial results)
//   Uses the latest FragranceNet snapshot whose coverage >= 98%. Refuses to
//   run if there is none.
//
// Usage (run from scraper/):
//   pnpm rank:popularity-v2            # dry run: report + top 100 old vs new
//   pnpm rank:popularity-v2 --write    # write popularity_rank_v2 / score / inputs

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { HOUSE_WEIGHT, MIN_TIER_GROUP, houseKey, rankRows, tierFromPricePerMl, WEIGHTS, type Row } from "./popularity-v2-core";

const WRITE = process.argv.includes("--write");
const SOURCE = "fragrancenet";
const MIN_COVERAGE = 0.98;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabase: SupabaseClient<any, "public", any>;

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

async function pageAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

async function main() {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[k]) {
      console.error(`[rank:v2] missing ${k} in scraper/.env`);
      process.exit(1);
    }
  }
  supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  console.log("--- Spritz: popularity v2 ---");
  console.log(`  mode: ${WRITE ? "WRITE popularity_rank_v2" : "dry run (no DB writes)"}`);
  console.log(`  weights: position ${WEIGHTS.position}, reviews ${WEIGHTS.reviews}, AI ${WEIGHTS.ai}; house ${HOUSE_WEIGHT}; unsold rows get imputed FragranceNet percentiles\n`);

  // ---- snapshot gate ----
  const { data: snaps, error: snapErr } = await supabase
    .from("popularity_snapshots")
    .select("snapshot_date, coverage, pages_fetched, pages_total")
    .eq("source", SOURCE)
    .gte("coverage", MIN_COVERAGE)
    .order("snapshot_date", { ascending: false })
    .limit(1);
  if (snapErr) throw new Error(snapErr.message);
  const snap = snaps?.[0];
  if (!snap) {
    console.error(`  ⚠ REFUSING: no FragranceNet snapshot with coverage >= ${MIN_COVERAGE * 100}%. Run scrape:fragrancenet-bestsellers --write first.`);
    process.exit(1);
  }
  console.log(`  snapshot: ${snap.snapshot_date} (${snap.pages_fetched}/${snap.pages_total} pages)`);

  type F = { id: string; name: string; house: string; popularity_score: number | null; popularity_rank: number | null; price_tier: string | null; popularity_rank_v2: number | null };
  const frags = await pageAll<F>((a, b) =>
    supabase.from("fragrances").select("id, name, house, popularity_score, popularity_rank, price_tier, popularity_rank_v2").order("id").range(a, b),
  );
  type S = { fragrance_id: string; position: number | null; review_count: number | null };
  const sigs = await pageAll<S>((a, b) =>
    supabase
      .from("fragrance_popularity_signals")
      .select("fragrance_id, position, review_count")
      .eq("source", SOURCE)
      .eq("snapshot_date", snap.snapshot_date)
      .order("fragrance_id")
      .range(a, b),
  );
  type C = { fragrance_id: string };
  const tierA = await pageAll<C>((a, b) =>
    supabase
      .from("fragrance_sales_claims")
      .select("fragrance_id")
      .eq("tier", "A")
      .eq("pending", false)
      .not("fragrance_id", "is", null)
      .order("fragrance_id")
      .range(a, b),
  );

  // ---- house popularity ----
  const housesFile = path.resolve("data/house-popularity.json");
  const houseDoc = JSON.parse(await fs.readFile(housesFile, "utf8")) as {
    houses: { house: string; aliases?: string[]; score: number }[];
  };
  const houseScore = new Map<string, number>();
  for (const h of houseDoc.houses) for (const n of [h.house, ...(h.aliases ?? [])]) houseScore.set(houseKey(n), h.score);

  // ---- price tier fallback: median price per ml across sources ----
  type P = { fragrance_id: string; price_per_ml: number | null };
  const prices = await pageAll<P>((a, b) =>
    supabase.from("fragrance_prices").select("fragrance_id, price_per_ml").order("id").range(a, b),
  );
  const ppmBy = new Map<string, number[]>();
  for (const p of prices) {
    if (p.price_per_ml == null) continue;
    if (!ppmBy.has(p.fragrance_id)) ppmBy.set(p.fragrance_id, []);
    ppmBy.get(p.fragrance_id)!.push(Number(p.price_per_ml));
  }
  const medianPpm = (id: string): number | null => {
    const v = ppmBy.get(id);
    if (!v || v.length === 0) return null;
    const s2 = [...v].sort((a, b) => a - b);
    const m = s2.length >> 1;
    return s2.length % 2 ? s2[m] : (s2[m - 1] + s2[m]) / 2;
  };

  const sigBy = new Map(sigs.map((s) => [s.fragrance_id, s]));
  const tierASet = new Set(tierA.map((c) => c.fragrance_id));
  const rows: Row[] = frags.map((f) => ({
    ...f,
    position: sigBy.get(f.id)?.position ?? null,
    review_count: sigBy.get(f.id)?.review_count ?? null,
    tier_a: tierASet.has(f.id),
    price_tier: f.price_tier ?? tierFromPricePerMl(medianPpm(f.id)),
    house_score: houseScore.get(houseKey(f.house)) ?? null,
  }));

  // House coverage, so an unscored big house is visible, not silent.
  {
    const unmatched = new Map<string, number>();
    let matched = 0;
    for (const r of rows) {
      if (r.house_score != null) matched++;
      else unmatched.set(r.house, (unmatched.get(r.house) ?? 0) + 1);
    }
    const top = [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    console.log(`  house score: ${matched}/${rows.length} fragrances (${unmatched.size} houses unscored)`);
    if (top.length) console.log(`    largest unscored: ${top.map(([h, n]) => `${h} (${n})`).join(", ")}`);
  }
  const ranked = rankRows(rows);

  // ---- benchmark check ----
  {
    const BENCH: [string, string][] = [
      ["Creed", "Aventus"], ["Tom Ford", "Tobacco Vanille"], ["Le Labo", "Santal 33"], ["Parfums de Marly", "Layton"],
      ["Tom Ford", "Lost Cherry"], ["Chanel", "Bleu de Chanel Eau de Parfum"], ["Chanel", "Coco Mademoiselle"],
      ["Chanel", "Chanel No 5 Eau de Parfum"], ["Dior", "Sauvage Eau de Parfum"], ["Dior", "Sauvage"],
      ["Maison Francis Kurkdjian", "Baccarat Rouge 540"], ["Frederic Malle", "Portrait of a Lady"],
      ["Giorgio Armani", "Acqua di Gio"], ["Davidoff", "Cool Water"],
    ];
    console.log("\n  benchmark                                  old    v2   tier      house  inputs");
    for (const [h, n] of BENCH) {
      const r = ranked.find((x) => houseKey(x.house) === houseKey(h) && houseKey(x.name) === houseKey(n));
      if (!r) {
        console.log(`  ${`${h} - ${n}`.slice(0, 40).padEnd(40)}   (not in catalog)`);
        continue;
      }
      console.log(
        `  ${`${h} - ${n}`.slice(0, 40).padEnd(40)} ${String(r.popularity_rank ?? "-").padStart(5)} ${String(r.rank_v2).padStart(5)}   ${(r.price_tier ?? "-").padEnd(9)} ${String(r.house_score ?? "-").padStart(5)}  ${r.inputs}`,
      );
    }
    const tiers: Record<string, number> = {};
    for (const r of rows) if (r.position != null) tiers[r.price_tier ?? "(none)"] = (tiers[r.price_tier ?? "(none)"] ?? 0) + 1;
    console.log(`\n  FragranceNet rows by price tier (after price-per-ml fill): ${JSON.stringify(tiers)} (tiers under ${MIN_TIER_GROUP} rank against all)`);
  }

  // ---- variant down-ranks ----
  {
    const kinds: Record<string, number> = {};
    const hit = ranked.filter((r) => r.inputs.includes("+variant:"));
    for (const r of hit) {
      const k = r.inputs.split("+variant:")[1].split("+")[0];
      kinds[k] = (kinds[k] ?? 0) + 1;
    }
    console.log(`\n  variant down-ranks: ${hit.length} ${JSON.stringify(kinds)}`);
    const prevV2 = new Map(frags.map((f) => [f.id, f.popularity_rank_v2]));
    const shown = [...hit].sort((a, b) => (prevV2.get(a.id) ?? 1e9) - (prevV2.get(b.id) ?? 1e9)).slice(0, 20);
    console.log("    prev v2   new v2  rule          fragrance");
    for (const r of shown) {
      const k = r.inputs.split("+variant:")[1].split("+")[0];
      console.log(`    ${String(prevV2.get(r.id) ?? "-").padStart(7)}  ${String(r.rank_v2).padStart(7)}  ${k.padEnd(12)}  ${r.house} - ${r.name}`);
    }
  }

  // ---- report ----
  const byInputs: Record<string, number> = {};
  for (const r of ranked) byInputs[r.inputs] = (byInputs[r.inputs] ?? 0) + 1;
  console.log(`  fragrances: ${ranked.length}`);
  for (const [k, v] of Object.entries(byInputs).sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(20)} ${v}`);
  console.log(`  tier A sales-verified linked: ${tierASet.size}`);

  const oldTop = [...frags].filter((f) => f.popularity_rank != null).sort((a, b) => a.popularity_rank! - b.popularity_rank!).slice(0, 100);
  const newTop = ranked.slice(0, 100);
  const v2ById = new Map(ranked.map((r) => [r.id, r]));
  console.log("\n  rank  NEW (v2)                                         | OLD (AI)");
  for (let i = 0; i < 100; i++) {
    const n = newTop[i];
    const o = oldTop[i];
    const left = n ? `${n.house} - ${n.name} [${n.inputs}]`.slice(0, 48).padEnd(48) : "".padEnd(48);
    const right = o ? `${o.house} - ${o.name} (now v2 #${v2ById.get(o.id)?.rank_v2})` : "";
    console.log(`  ${String(i + 1).padStart(4)}  ${left} | ${right}`);
  }

  const movers = ranked
    .filter((r) => r.popularity_rank != null && (r.rank_v2 <= 500 || r.popularity_rank <= 500))
    .map((r) => ({ id: r.id, house: r.house, name: r.name, old: r.popularity_rank!, v2: r.rank_v2, delta: r.popularity_rank! - r.rank_v2, inputs: r.inputs }));
  const risers = [...movers].sort((a, b) => b.delta - a.delta).slice(0, 25);
  const fallers = [...movers].sort((a, b) => a.delta - b.delta).slice(0, 25);

  // ---- write ----
  let written = 0;
  if (WRITE) {
    for (let i = 0; i < ranked.length; i += 1000) {
      const chunk = ranked.slice(i, i + 1000).map((r) => ({ id: r.id, rank: r.rank_v2, score: r.score, inputs: r.inputs }));
      const { data, error } = await supabase.rpc("apply_popularity_v2", { p_rows: chunk });
      if (error) {
        console.error(`\n  ⚠ write failed at row ${i}: ${error.message}`);
        break;
      }
      written += Number(data ?? 0);
    }
    console.log(`\n  written: ${written}/${ranked.length} rows`);
  }

  const outFile = path.resolve(`data/rank-v2-${WRITE ? "write" : "dry"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await fs.writeFile(
    outFile,
    JSON.stringify(
      {
        snapshot: snap,
        weights: WEIGHTS,
        inputs: byInputs,
        written,
        top_100_v2: newTop.map((r) => ({ rank_v2: r.rank_v2, old: r.popularity_rank, house: r.house, name: r.name, inputs: r.inputs, score: r.score, position: r.position, review_count: r.review_count })),
        top_100_old: oldTop.map((f) => ({ old: f.popularity_rank, v2: v2ById.get(f.id)?.rank_v2, house: f.house, name: f.name })),
        biggest_risers: risers,
        biggest_fallers: fallers,
      },
      null,
      2,
    ),
  );
  console.log(`\n  report: ${path.relative(process.cwd(), outFile)}`);
  if (!WRITE) console.log("  Nothing written. Apply with --write (popularity_rank stays untouched).");
}

if (process.argv[1] && /rank-popularity-v2\.(ts|js|mjs)$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

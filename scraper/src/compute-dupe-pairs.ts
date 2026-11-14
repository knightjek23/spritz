// Stage 5: pre-compute top-50 dupes per fragrance and write to dupe_pairs.
// Implements the formula from PRD §8 over the full catalog.
// 10k × 10k pairs = 100M comparisons; output is top-50 per fragrance (~500k rows).

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { prepare, topMatches } from "./dupe-scoring";

const TOP_N = 50;
// Weights (notes 0.7, family 0.2, season 0.1) live in dupe-scoring.ts.

const DRY = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force");
// The table is only replaced when at least this share of the catalog has a
// usable vector. Below it, something is wrong with the input and replacing
// would throw away good pairs for bad. --force overrides.
const MIN_USABLE_SHARE = 0.5;
// Fragrances per delete + insert round trip. 100 fragrances is at most 5,000
// pairs, small enough to stay well inside the statement timeout.
const SLICE = 100;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

interface Row {
  id: string;
  family: string[] | null;
  season_tags: string[] | null;
  // pgvector comes back from Postgres as text, e.g. "[0.1,0,0.3]". See
  // parseVector in dupe-scoring.ts. Typed loosely on purpose.
  note_vector: unknown;
  top_notes: Array<{ name: string; weight: number }> | null;
  mid_notes: Array<{ name: string; weight: number }> | null;
  base_notes: Array<{ name: string; weight: number }> | null;
}

/** Runs a step up to three times. The step returns an error message or null. */
async function withRetry(label: string, step: () => Promise<string | null>): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const err = await step();
    if (!err) return true;
    console.warn(`[dupes] ${label}: attempt ${attempt} failed: ${err}`);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  return false;
}

function topShared(a: Row, b: Row, n = 5) {
  const allA = [...(a.top_notes ?? []), ...(a.mid_notes ?? []), ...(a.base_notes ?? [])];
  const allB = new Map(
    [...(b.top_notes ?? []), ...(b.mid_notes ?? []), ...(b.base_notes ?? [])].map((x) => [x.name.toLowerCase(), x.weight]),
  );
  const shared: Array<{ name: string; weight_a: number; weight_b: number }> = [];
  for (const noteA of allA) {
    const wB = allB.get(noteA.name.toLowerCase());
    if (wB !== undefined) shared.push({ name: noteA.name, weight_a: noteA.weight, weight_b: wB });
  }
  return shared.sort((x, y) => y.weight_a + y.weight_b - (x.weight_a + x.weight_b)).slice(0, n);
}

async function main() {
  console.log("[dupes] loading all fragrances…");
  const rows: Row[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("fragrances")
      .select("id, family, season_tags, note_vector, top_notes, mid_notes, base_notes")
      .order("id", { ascending: true }) // stable paging: without an order, pages can overlap or skip rows
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as unknown as Row[]));
    from += data.length;
    if (data.length < PAGE) break;
  }
  console.log(`[dupes] loaded ${rows.length} fragrances`);

  const prepared = prepare(rows);
  const skipped = rows.length - prepared.length;
  console.log(`[dupes] usable note vectors: ${prepared.length} of ${rows.length} (${skipped} without one)`);

  // GUARD 1. The first version of this script read every vector as missing
  // (see dupe-scoring.ts), scored nothing, and still emptied dupe_pairs.
  // Never replace the table from an input that looks broken.
  if (prepared.length === 0) {
    console.error("[dupes] STOP: no fragrance has a usable note vector. dupe_pairs was NOT touched.");
    process.exit(1);
  }
  if (prepared.length < rows.length * MIN_USABLE_SHARE && !FORCE) {
    console.error(
      `[dupes] STOP: only ${prepared.length} of ${rows.length} fragrances have a usable vector, ` +
        `under the ${MIN_USABLE_SHARE * 100}% floor. dupe_pairs was NOT touched. Re-run with --force to override.`,
    );
    process.exit(1);
  }

  console.log("[dupes] scoring pairs…");
  const started = Date.now();
  const inserts: Array<{
    fragrance_a: string;
    fragrance_b: string;
    score: number;
    shared_notes: ReturnType<typeof topShared>;
  }> = [];
  let withMatches = 0;
  for (let i = 0; i < prepared.length; i++) {
    const a = prepared[i].row;
    const top = topMatches(prepared, i, TOP_N);
    if (top.length > 0) withMatches++;
    for (const t of top) {
      inserts.push({
        fragrance_a: a.id,
        fragrance_b: t.b.row.id,
        score: t.score,
        shared_notes: topShared(a, t.b.row),
      });
    }
    if ((i + 1) % 1000 === 0) {
      const secs = Math.round((Date.now() - started) / 1000);
      console.log(`[dupes] scored ${i + 1}/${prepared.length} (${secs}s)`);
    }
  }
  console.log(
    `[dupes] ${inserts.length} pairs for ${withMatches} fragrances in ${Math.round((Date.now() - started) / 1000)}s`,
  );

  // GUARD 2. Nothing to write means nothing to replace.
  if (inserts.length === 0) {
    console.error("[dupes] STOP: scoring produced no pairs. dupe_pairs was NOT touched.");
    process.exit(1);
  }
  if (DRY) {
    console.log("[dupes] dry run: dupe_pairs was not touched.");
    return;
  }

  // Replace the pairs a slice of fragrances at a time: delete those
  // fragrances' old pairs, insert their new ones, move on.
  //
  // Why not one big wipe: a single DELETE of the whole table (several hundred
  // thousand rows) runs past the database's statement timeout and is
  // cancelled, which is what happened on 12 Nov 2026. A cancelled delete
  // rolls back, so the old table survived, but the new pairs never landed.
  // Slices also mean there is never a moment when the table is empty, and a
  // run that stops part-way can simply be started again.
  console.log(`[dupes] replacing pairs for ${prepared.length} fragrances, ${SLICE} at a time…`);
  const byA = new Map<string, typeof inserts>();
  for (const row of inserts) {
    const list = byA.get(row.fragrance_a);
    if (list) list.push(row);
    else byA.set(row.fragrance_a, [row]);
  }
  const ids = prepared.map((p) => p.row.id);
  let done = 0;
  let pairsWritten = 0;
  for (let off = 0; off < ids.length; off += SLICE) {
    const slice = ids.slice(off, off + SLICE);
    const pairs = slice.flatMap((id) => byA.get(id) ?? []);
    const ok = await withRetry(`slice at ${off}`, async () => {
      const del = await supabase.from("dupe_pairs").delete().in("fragrance_a", slice);
      if (del.error) return del.error.message;
      if (pairs.length === 0) return null;
      const ins = await supabase.from("dupe_pairs").insert(pairs);
      return ins.error ? ins.error.message : null;
    });
    if (!ok) {
      console.error(`[dupes] STOPPED at fragrance ${off} of ${ids.length}. ${done} fragrances are updated; the rest still`);
      console.error("[dupes] have their previous pairs, except this slice, which may have none. Re-run to finish.");
      process.exit(1);
    }
    done += slice.length;
    pairsWritten += pairs.length;
    if (done % 1000 < SLICE || done === ids.length) {
      console.log(`[dupes] replaced ${done}/${ids.length} fragrances (${pairsWritten} pairs)`);
    }
  }

  // Fragrances with no usable vector get no pairs. Clear any left over from
  // an earlier run so the app falls back to its live lookup for them.
  const usableIds = new Set(ids);
  const stale = rows.map((r) => r.id).filter((id) => !usableIds.has(id));
  for (let off = 0; off < stale.length; off += SLICE) {
    const slice = stale.slice(off, off + SLICE);
    const ok = await withRetry(`cleanup at ${off}`, async () => {
      const del = await supabase.from("dupe_pairs").delete().in("fragrance_a", slice);
      return del.error ? del.error.message : null;
    });
    if (!ok) {
      console.error("[dupes] cleanup of fragrances without a vector did not finish. Re-run to finish.");
      process.exit(1);
    }
  }
  console.log(`[dupes] cleared old pairs for ${stale.length} fragrances without a vector`);

  console.log("[dupes] DONE");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

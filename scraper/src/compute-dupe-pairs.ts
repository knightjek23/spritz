// Stage 5: pre-compute top-50 dupes per fragrance and write to dupe_pairs.
// Implements the formula from PRD §8 over the full catalog.
// 10k × 10k pairs = 100M comparisons; output is top-50 per fragrance (~500k rows).

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const TOP_N = 50;
const NOTES_W = 0.7;
const FAMILY_W = 0.2;
const SEASON_W = 0.1;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

interface Row {
  id: string;
  family: string[];
  season_tags: string[];
  note_vector: number[];
  top_notes: Array<{ name: string; weight: number }>;
  mid_notes: Array<{ name: string; weight: number }>;
  base_notes: Array<{ name: string; weight: number }>;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    ma += a[i] * a[i];
    mb += b[i] * b[i];
  }
  if (ma === 0 || mb === 0) return 0;
  return dot / (Math.sqrt(ma) * Math.sqrt(mb));
}

function jaccard<T>(a: T[], b: T[]): number {
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const v of A) if (B.has(v)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function topShared(a: Row, b: Row, n = 5) {
  const allA = [...a.top_notes, ...a.mid_notes, ...a.base_notes];
  const allB = new Map(
    [...b.top_notes, ...b.mid_notes, ...b.base_notes].map((x) => [x.name.toLowerCase(), x.weight]),
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
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as unknown as Row[]));
    from += data.length;
    if (data.length < PAGE) break;
  }
  console.log(`[dupes] loaded ${rows.length} fragrances`);

  // Score every pair, keep top N per A.
  console.log(`[dupes] scoring pairs (this is the slow part)…`);
  const inserts: Array<{
    fragrance_a: string;
    fragrance_b: string;
    score: number;
    shared_notes: ReturnType<typeof topShared>;
  }> = [];

  // Filter out fragrances that don't have a usable note_vector — those can't
  // participate in cosine similarity at all. Common cause: a Fragrantica page
  // where the pyramid block didn't render (older fragrances, edge-case DOM).
  const usable = rows.filter(
    (r) => Array.isArray(r.note_vector) && r.note_vector.length > 0,
  );
  const skipped = rows.length - usable.length;
  if (skipped > 0) {
    console.log(`[dupes] skipping ${skipped} fragrances with no note_vector`);
  }

  for (let i = 0; i < usable.length; i++) {
    const a = usable[i];
    const top: Array<{ b: Row; score: number }> = [];
    for (let j = 0; j < usable.length; j++) {
      if (i === j) continue;
      const b = usable[j];
      const rawScore =
        NOTES_W * cosine(a.note_vector, b.note_vector) +
        FAMILY_W * jaccard(a.family, b.family) +
        SEASON_W * jaccard(a.season_tags, b.season_tags);
      // Defensive: cosine() can return NaN if either vector is all-zero.
      const score = Number.isFinite(rawScore) ? rawScore : 0;
      if (top.length < TOP_N) {
        top.push({ b, score });
        top.sort((x, y) => y.score - x.score);
      } else if (score > top[TOP_N - 1].score) {
        top[TOP_N - 1] = { b, score };
        top.sort((x, y) => y.score - x.score);
      }
    }
    for (const t of top) {
      // Only emit pairs with a real positive similarity — drop the noise.
      if (!Number.isFinite(t.score) || t.score <= 0) continue;
      inserts.push({
        fragrance_a: a.id,
        fragrance_b: t.b.id,
        score: t.score,
        shared_notes: topShared(a, t.b),
      });
    }
    if ((i + 1) % 200 === 0) console.log(`[dupes] scored ${i + 1}/${usable.length}`);
  }

  console.log(`[dupes] writing ${inserts.length} pairs…`);
  // Wipe + bulk insert in chunks. Faster than upsert at this size.
  const { error: delErr } = await supabase.from("dupe_pairs").delete().neq("fragrance_a", "00000000-0000-0000-0000-000000000000");
  if (delErr) throw delErr;
  for (let off = 0; off < inserts.length; off += 5000) {
    const chunk = inserts.slice(off, off + 5000);
    const { error } = await supabase.from("dupe_pairs").insert(chunk);
    if (error) throw error;
    console.log(`[dupes] inserted ${off + chunk.length}/${inserts.length}`);
  }

  console.log("[dupes] DONE");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

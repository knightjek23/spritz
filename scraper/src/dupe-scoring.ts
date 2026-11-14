// Scoring core for compute-dupe-pairs.ts. Pure and import-free so it can be
// tested with plain node: node src/dupe-scoring.test.mjs
//
// score(A, B) = 0.7 x cosine(note vectors) + 0.2 x jaccard(family)
//             + 0.1 x jaccard(season tags)          (PRD section 8)
//
// Two things this file gets right that the first version did not:
//
//   1. Postgres returns a pgvector column as TEXT ("[0.1,0,0.3,...]"), not as
//      a JSON array. The first version tested Array.isArray(note_vector),
//      which is false for every row, so it treated the whole catalog as
//      having no vectors, scored nothing, and then emptied dupe_pairs.
//      parseVector accepts both forms.
//
//   2. Speed. A note vector has about ten non-zero entries out of 500, so the
//      dot product walks only those. Family and season sets are built once
//      per fragrance instead of twice per pair. Results are the same.

export const VECTOR_DIM = 500;

/** Accepts a pgvector text value or a number array. Null when unusable. */
export function parseVector(v: unknown): number[] | null {
  let arr: unknown[] | null = null;
  if (Array.isArray(v)) arr = v;
  else if (typeof v === "string") {
    const inner = v.trim().replace(/^\[/, "").replace(/\]$/, "");
    if (!inner) return null;
    arr = inner.split(",").map((x) => Number(x));
  }
  if (!arr || arr.length !== VECTOR_DIM) return null;
  const out = new Array<number>(VECTOR_DIM);
  let any = false;
  for (let i = 0; i < VECTOR_DIM; i++) {
    const x = Number(arr[i]);
    if (!Number.isFinite(x)) return null;
    out[i] = x;
    if (x !== 0) any = true;
  }
  return any ? out : null; // an all-zero vector cannot be compared
}

export interface ScoringInput {
  id: string;
  note_vector: unknown;
  family: string[] | null;
  season_tags: string[] | null;
}

export interface Prepared<T> {
  row: T;
  dense: Float64Array;
  idx: Int32Array;
  val: Float64Array;
  norm: number;
  family: Set<string>;
  season: Set<string>;
}

/** Rows with a usable vector, ready to score. Rows without one are left out. */
export function prepare<T extends ScoringInput>(rows: T[]): Prepared<T>[] {
  const out: Prepared<T>[] = [];
  for (const row of rows) {
    const v = parseVector(row.note_vector);
    if (!v) continue;
    const dense = Float64Array.from(v);
    const idxs: number[] = [];
    let sq = 0;
    for (let i = 0; i < VECTOR_DIM; i++) {
      if (dense[i] !== 0) {
        idxs.push(i);
        sq += dense[i] * dense[i];
      }
    }
    out.push({
      row,
      dense,
      idx: Int32Array.from(idxs),
      val: Float64Array.from(idxs.map((i) => dense[i])),
      norm: Math.sqrt(sq),
      family: new Set(row.family ?? []),
      season: new Set(row.season_tags ?? []),
    });
  }
  return out;
}

function jaccardSets(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const v of small) if (large.has(v)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

const NOTES_W = 0.7;
const FAMILY_W = 0.2;
const SEASON_W = 0.1;

export function score<T>(a: Prepared<T>, b: Prepared<T>): number {
  let dot = 0;
  const bd = b.dense;
  for (let k = 0; k < a.idx.length; k++) dot += a.val[k] * bd[a.idx[k]];
  const cos = a.norm === 0 || b.norm === 0 ? 0 : dot / (a.norm * b.norm);
  const s = NOTES_W * cos + FAMILY_W * jaccardSets(a.family, b.family) + SEASON_W * jaccardSets(a.season, b.season);
  return Number.isFinite(s) ? s : 0;
}

/** The topN highest-scoring other rows for row i, best first. Scores at or
 *  below zero are left out. */
export function topMatches<T>(prepared: Prepared<T>[], i: number, topN: number): Array<{ b: Prepared<T>; score: number }> {
  const a = prepared[i];
  const top: Array<{ b: Prepared<T>; score: number }> = [];
  let floor = -Infinity;
  for (let j = 0; j < prepared.length; j++) {
    if (j === i) continue;
    const b = prepared[j];
    const s = score(a, b);
    if (top.length < topN) {
      top.push({ b, score: s });
      if (top.length === topN) {
        top.sort((x, y) => y.score - x.score);
        floor = top[topN - 1].score;
      }
    } else if (s > floor) {
      top[topN - 1] = { b, score: s };
      top.sort((x, y) => y.score - x.score);
      floor = top[topN - 1].score;
    }
  }
  if (top.length < topN) top.sort((x, y) => y.score - x.score);
  return top.filter((t) => t.score > 0);
}

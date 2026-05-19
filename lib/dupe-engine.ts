// Dupe engine — implements the scoring formula from PRD §8.
//
//   score(A, B) = 0.70 * cosine(note_vector_A, note_vector_B)
//               + 0.20 * jaccard(family_tags_A, family_tags_B)
//               + 0.10 * jaccard(season_tags_A, season_tags_B)
//
// At runtime we read pre-computed pairs from the `dupe_pairs` table.
// This module is used by:
//   1. The nightly pre-compute job (scoring all top-10k × top-10k → top-50 per fragrance).
//   2. The fragrance detail page request handler (just looks up rows; no scoring at request time).
// The pure functions below are exported so the scraper subproject can re-use them.

import type { Fragrance, Note } from "./types";

export const WEIGHTS = {
  notes: 0.70,
  family: 0.20,
  season: 0.10,
} as const;

// ---------- vector math ----------

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: dim mismatch ${a.length} vs ${b.length}`);
  }
  let dot = 0,
    magA = 0,
    magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function jaccard<T>(a: T[], b: T[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const v of setA) if (setB.has(v)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ---------- note vector construction ----------

// The canonical note dictionary lives in scraper/data/note_dictionary.json
// (built during scrape, ~500 notes after dedup + casing normalization).
// At runtime we just receive the pre-built note_vector as number[500] from Supabase.

/**
 * Build a 500-dim note vector for a single fragrance from its top/mid/base notes.
 * Used by the scraper at ingest time. Top notes weighted 0.4, mid 0.4, base 0.2
 * (matches how community perceives note prominence — top + mid dominate first impression).
 */
export function buildNoteVector(
  topNotes: Note[],
  midNotes: Note[],
  baseNotes: Note[],
  noteIndex: Record<string, number>, // canonical_name -> dim index
  dim: number = 500,
): number[] {
  const vec = new Array(dim).fill(0);
  const apply = (notes: Note[], layerWeight: number) => {
    for (const n of notes) {
      const idx = noteIndex[n.name.toLowerCase()];
      if (idx === undefined) continue;
      vec[idx] += n.weight * layerWeight;
    }
  };
  apply(topNotes, 0.4);
  apply(midNotes, 0.4);
  apply(baseNotes, 0.2);
  // L2-normalize so cosine similarity is comparable across fragrances.
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (mag === 0) return vec;
  return vec.map((v) => v / mag);
}

// ---------- full pair score ----------

export function scorePair(
  a: { note_vector: number[]; family: string[]; season_tags: string[] },
  b: { note_vector: number[]; family: string[]; season_tags: string[] },
): number {
  return (
    WEIGHTS.notes * cosineSimilarity(a.note_vector, b.note_vector) +
    WEIGHTS.family * jaccard(a.family, b.family) +
    WEIGHTS.season * jaccard(a.season_tags, b.season_tags)
  );
}

// ---------- shared notes (for "why it's a dupe" line) ----------

/**
 * Top N shared notes by combined weight across both fragrances.
 * Matches notes case-insensitively across the union of top/mid/base.
 */
export function topSharedNotes(a: Fragrance, b: Fragrance, n: number = 3): string[] {
  const allA = [...a.top_notes, ...a.mid_notes, ...a.base_notes];
  const allB = [...b.top_notes, ...b.mid_notes, ...b.base_notes];
  const mapB = new Map(allB.map((x) => [x.name.toLowerCase(), x.weight]));
  const combined: Array<{ name: string; weight: number }> = [];
  for (const noteA of allA) {
    const wB = mapB.get(noteA.name.toLowerCase());
    if (wB !== undefined) {
      combined.push({ name: noteA.name, weight: noteA.weight + wB });
    }
  }
  combined.sort((x, y) => y.weight - x.weight);
  return combined.slice(0, n).map((c) => c.name);
}

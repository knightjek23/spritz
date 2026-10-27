import "server-only";

// Taste profile — what a user's shelf says they like, as one vector.
//
// Built from collection_items (own / tried) and user_reactions
// (like / dislike). Each bottle contributes its 500-dim note_vector with a
// weight:
//
//   owned            1.0      the strongest signal: they paid for it
//   tried            0.5      sampled, not committed
//   liked            +0.5     on top of the shelf weight (an owned+liked
//                             bottle counts 1.5; a liked-but-unowned 0.5)
//   disliked         -0.75    pushes the profile away from those notes
//
// The profile is the normalized weighted sum. Families and seasons are
// counted the same way into frequency maps (negative weights clamp to
// zero so a single dislike can't erase a family the user owns).
//
// MIN_SHELF: below three contributing bottles the profile is noise, so
// every feature built on it shows "add 3 bottles to unlock" instead.
//
// Cost: one query for the shelf, one for reactions, one for the fragrance
// rows (≤ 200 × 500 floats, a few MB at most, well under a request budget).
// Nothing is cached yet; if match scores get hot, store the profile on
// users.taste_profile and refresh it from the collection routes.

import { createAdminClient } from "@/lib/supabase/admin";
import { cosineSimilarity } from "@/lib/dupe-engine";
import type { Fragrance } from "@/lib/types";

export const MIN_SHELF = 3;
export const VECTOR_DIM = 500;

export const WEIGHT = {
  own: 1.0,
  tried: 0.5,
  like: 0.5,
  dislike: -0.75,
} as const;

export interface TasteProfile {
  /** Supabase users.id */
  userId: string;
  /** Normalized 500-dim note vector; all zeros when the shelf is empty. */
  vector: number[];
  /** Lowercased note name -> accumulated weight (positive only). */
  noteWeights: Map<string, number>;
  /** Lowercased family -> accumulated weight (positive only). */
  familyWeights: Map<string, number>;
  /** Lowercased season tag -> accumulated weight (positive only). */
  seasonWeights: Map<string, number>;
  /** Notes carried by disliked bottles and not by liked/owned ones. */
  dislikedNotes: Set<string>;
  /** Bottles that contributed with weight > 0. */
  contributing: number;
  /** Fragrance ids on the shelf in any status, for exclusion lists. */
  shelfIds: Set<string>;
}

/** Rows this module needs from `fragrances`. */
export type TasteRow = Pick<
  Fragrance,
  "id" | "name" | "house" | "family" | "season_tags" | "top_notes" | "mid_notes" | "base_notes"
> & { note_vector: number[] | string | null };

export const TASTE_COLUMNS =
  "id, name, house, family, season_tags, top_notes, mid_notes, base_notes, note_vector";

/** PostgREST returns pgvector columns as a "[0.1,0.2,...]" string. */
export function parseVector(v: number[] | string | null | undefined): number[] | null {
  if (!v) return null;
  if (Array.isArray(v)) return v.length === VECTOR_DIM ? v : null;
  if (typeof v === "string") {
    const inner = v.trim().replace(/^\[/, "").replace(/\]$/, "");
    if (!inner) return null;
    const out = inner.split(",").map(Number);
    return out.length === VECTOR_DIM && out.every((x) => Number.isFinite(x)) ? out : null;
  }
  return null;
}

type NoteJson = { name?: string; weight?: number } | string;

/** Every note name on a fragrance, lowercased, with its vote weight (default 0.5). */
export function noteEntries(f: Pick<Fragrance, "top_notes" | "mid_notes" | "base_notes">): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (const bucket of [f.top_notes, f.mid_notes, f.base_notes]) {
    for (const n of (bucket ?? []) as NoteJson[]) {
      const name = typeof n === "string" ? n : n?.name;
      const w = typeof n === "string" ? 0.5 : (n?.weight ?? 0.5);
      if (name) out.push([name.trim().toLowerCase(), w]);
    }
  }
  return out;
}

export function lower(xs: string[] | null | undefined): string[] {
  return (xs ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean);
}

function bump(map: Map<string, number>, key: string, w: number) {
  map.set(key, (map.get(key) ?? 0) + w);
}

/** Pure builder, exported for tests. `weights` maps fragrance id -> weight. */
export function buildProfile(
  userId: string,
  rows: TasteRow[],
  weights: Map<string, number>,
  shelfIds: Set<string>,
): TasteProfile {
  const vector = new Array<number>(VECTOR_DIM).fill(0);
  const noteWeights = new Map<string, number>();
  const familyWeights = new Map<string, number>();
  const seasonWeights = new Map<string, number>();
  const negativeNotes = new Map<string, number>();
  let contributing = 0;

  for (const row of rows) {
    const w = weights.get(row.id) ?? 0;
    if (w === 0) continue;
    if (w > 0) contributing++;
    const vec = parseVector(row.note_vector);
    if (vec) for (let i = 0; i < VECTOR_DIM; i++) vector[i] += vec[i] * w;
    for (const [name, nw] of noteEntries(row)) {
      if (w > 0) bump(noteWeights, name, nw * w);
      else bump(negativeNotes, name, nw * -w);
    }
    if (w > 0) {
      for (const fam of lower(row.family)) bump(familyWeights, fam, w);
      for (const s of lower(row.season_tags)) bump(seasonWeights, s, w);
    }
  }

  // Dislikes push the vector away but never below zero on a dimension:
  // a note the user owns three times and disliked once is still a like.
  for (let i = 0; i < VECTOR_DIM; i++) if (vector[i] < 0) vector[i] = 0;
  const mag = Math.sqrt(vector.reduce((s, x) => s + x * x, 0));
  const normalized = mag > 0 ? vector.map((x) => x / mag) : vector;

  const dislikedNotes = new Set<string>();
  for (const [name, neg] of negativeNotes) {
    if ((noteWeights.get(name) ?? 0) < neg) dislikedNotes.add(name);
  }

  return {
    userId,
    vector: normalized,
    noteWeights,
    familyWeights,
    seasonWeights,
    dislikedNotes,
    contributing,
    shelfIds,
  };
}

/** Load and build the profile for a Supabase user id. */
export async function tasteProfile(appUserId: string): Promise<TasteProfile> {
  const supabase = createAdminClient();
  const [{ data: items }, { data: reactions }] = await Promise.all([
    supabase
      .from("collection_items")
      .select("fragrance_id, status")
      .eq("user_id", appUserId)
      .limit(400),
    supabase.from("user_reactions").select("fragrance_id, reaction").eq("user_id", appUserId).limit(400),
  ]);

  const weights = new Map<string, number>();
  const shelfIds = new Set<string>();
  for (const it of items ?? []) {
    shelfIds.add(it.fragrance_id);
    if (it.status === "own") weights.set(it.fragrance_id, Math.max(weights.get(it.fragrance_id) ?? 0, WEIGHT.own));
    else if (it.status === "tried") weights.set(it.fragrance_id, Math.max(weights.get(it.fragrance_id) ?? 0, WEIGHT.tried));
    else if (!weights.has(it.fragrance_id)) weights.set(it.fragrance_id, 0); // wishlist: excluded, not a taste signal
  }
  for (const r of reactions ?? []) {
    const base = weights.get(r.fragrance_id) ?? 0;
    weights.set(r.fragrance_id, r.reaction === "like" ? base + WEIGHT.like : base + WEIGHT.dislike);
  }

  const ids = [...weights.entries()].filter(([, w]) => w !== 0).map(([id]) => id);
  if (ids.length === 0) return buildProfile(appUserId, [], weights, shelfIds);

  const { data: rows } = await supabase.from("fragrances").select(TASTE_COLUMNS).in("id", ids);
  return buildProfile(appUserId, (rows ?? []) as unknown as TasteRow[], weights, shelfIds);
}

/** True when the profile has enough behind it to score anything. */
export function profileReady(p: TasteProfile): boolean {
  return p.contributing >= MIN_SHELF;
}

/** Cosine between the profile and one fragrance (0 when either is empty). */
export function profileSimilarity(p: TasteProfile, vector: number[] | null): number {
  if (!vector) return 0;
  return cosineSimilarity(p.vector, vector);
}

// Server-side recommendation builder for the signed-in home feed.
//
// "Try next" changes every day. The previous version seeded from the five
// most recently added bottles and ranked deterministically, so the list
// only moved when the shelf did. Now:
//
//   1. Pick 3 SEEDS from the whole Owned shelf. The pick is random but
//      keyed on the calendar day and the user, so it is the same all day
//      and different tomorrow (a daily rotation, not a reshuffle on every
//      page load). Seeds are chosen to be coherent with each other: the
//      first is random, the next two are the owned bottles that share the
//      most notes and family with it. "Today's trio" reads as a mood
//      rather than three unrelated picks.
//   2. Build a TASTE PROFILE from those three: every note and family they
//      carry, weighted by how many of the trio carry it.
//   3. Fan out pgvector similarity from each seed, then re-rank the
//      candidates by how much of the profile they cover, with the vector
//      score as a tiebreak and a small daily jitter so near-ties rotate.
//
// Anything already on the shelf (own / tried / wishlist) is excluded.
//
// Performance: one query for the shelf, one for the seen-set, three RPCs
// in parallel. About the same cost as before.

import { createAdminClient } from "@/lib/supabase/admin";
import { stripProFieldsDeep } from "@/lib/entitlement";
import type { DupeRecommendation, Fragrance } from "@/lib/types";

const SEED_COUNT = 3;
const PER_SEED_CANDIDATES = 12;
const SIMILAR_FEED_SIZE = 8;
const DUPE_FEED_SIZE = 6;
/** Owned bottles to consider when choosing seeds. */
const SHELF_LIMIT = 200;

export interface Recommendations {
  /** App user id (Supabase users.id), useful for downstream personalization. */
  userId: string | null;
  /** How many fragrances the user owns. Drives "show empty state vs feed" branching. */
  ownedCount: number;
  /** Today's three seeds: the owned bottles the list was derived from. */
  seeds: Fragrance[];
  /** The notes and families those seeds share, most common first. Shown as
   *  "today's mood" so the rotation reads as intentional. */
  profile: { notes: string[]; families: string[] };
  /** Fragrances close to the seeds, ordered by profile coverage. */
  similar: Array<{
    fragrance: Fragrance;
    /** Best per-seed pgvector similarity this fragrance had. */
    similarity: number;
    /** Which seed(s) led us to this recommendation. */
    becauseOf: string[];
    /** Profile notes this fragrance carries, for the "shares: x, y" line. */
    sharedNotes: string[];
  }>;
  /** Dupes pulled from the seed set — cheaper alternatives. */
  cheaperDupes: Array<{
    forFragrance: Fragrance;
    dupe: DupeRecommendation;
  }>;
}

// ---------------------------------------------------------------------------
// Deterministic daily randomness.
//
// A seeded PRNG keyed on (user, local day) gives a shuffle that is stable
// for the whole day and changes at midnight, without storing anything.
// "Local day" is approximated as UTC here; the home page is rendered on the
// server, which cannot see the viewer's timezone. The rotation moment is
// therefore midnight UTC, which for a US user is late afternoon or evening.
// Acceptable for a discovery list; not acceptable for the streak, which is
// why the streak uses the client's day instead.
// ---------------------------------------------------------------------------

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, good enough for shuffling a shelf. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Notes and families as flat, lowercased sets.
// ---------------------------------------------------------------------------

type NoteJson = { name?: string; weight?: number } | string;

function noteNames(f: Fragrance): Set<string> {
  const out = new Set<string>();
  for (const bucket of [f.top_notes, f.mid_notes, f.base_notes]) {
    for (const n of (bucket ?? []) as NoteJson[]) {
      const name = typeof n === "string" ? n : n?.name;
      if (name) out.add(name.trim().toLowerCase());
    }
  }
  return out;
}

function familyNames(f: Fragrance): Set<string> {
  return new Set((f.family ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean));
}

/** How alike two owned bottles are, for picking a coherent trio. Jaccard
 *  on notes plus a bonus per shared family. */
function affinity(a: Fragrance, b: Fragrance): number {
  const na = noteNames(a);
  const nb = noteNames(b);
  let shared = 0;
  for (const n of na) if (nb.has(n)) shared++;
  const union = na.size + nb.size - shared;
  const noteScore = union > 0 ? shared / union : 0;
  const fa = familyNames(a);
  let famShared = 0;
  for (const x of fa) if (familyNames(b).has(x)) famShared++;
  return noteScore + famShared * 0.15;
}

/**
 * Choose today's seeds: one bottle at random (daily-stable), then the two
 * owned bottles most similar to it. Falls back to plain daily-random picks
 * when the shelf is too small for affinity to mean anything.
 */
function pickSeeds(owned: Fragrance[], rand: () => number): Fragrance[] {
  if (owned.length <= SEED_COUNT) return owned;

  const anchorIndex = Math.floor(rand() * owned.length);
  const anchor = owned[anchorIndex];
  const rest = owned.filter((_, i) => i !== anchorIndex);

  // Larger jitter than a pure tiebreak on purpose. Without it, a bottle
  // with a long note list (Acqua di Gio has ~20) scores as "similar" to
  // almost any anchor and lands in the trio most days, which defeats the
  // rotation. 0.25 lets the top few affinities trade places day to day
  // while still keeping the trio in the same neighbourhood.
  const scored = rest
    .map((f) => ({ f, score: affinity(anchor, f) + rand() * 0.25 }))
    .sort((a, b) => b.score - a.score);

  return [anchor, ...scored.slice(0, SEED_COUNT - 1).map((s) => s.f)];
}

// ---------------------------------------------------------------------------

export async function getRecommendations(clerkUserId: string): Promise<Recommendations> {
  const supabase = createAdminClient();

  const { data: appUser } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  const empty: Recommendations = {
    userId: appUser?.id ?? null,
    ownedCount: 0,
    seeds: [],
    profile: { notes: [], families: [] },
    similar: [],
    cheaperDupes: [],
  };
  if (!appUser) return empty;

  // 1. The whole Owned shelf, so any bottle can be a seed.
  const { data: ownedRows } = await supabase
    .from("collection_items")
    .select("fragrance:fragrances(*)")
    .eq("user_id", appUser.id)
    .eq("status", "own")
    .order("added_at", { ascending: false })
    .limit(SHELF_LIMIT);

  const owned = (ownedRows ?? [])
    .map((r) => (r as unknown as { fragrance: Fragrance }).fragrance)
    .filter(Boolean) as Fragrance[];

  if (owned.length === 0) return { ...empty, userId: appUser.id };

  // 2. Today's seeds.
  const rand = seededRandom(hashString(`${appUser.id}:${todayKey()}`));
  const seeds = pickSeeds(owned, rand);

  // 3. Taste profile from the seeds: each note/family weighted by how many
  //    of the trio carry it.
  const noteWeight = new Map<string, number>();
  const familyWeight = new Map<string, number>();
  for (const s of seeds) {
    for (const n of noteNames(s)) noteWeight.set(n, (noteWeight.get(n) ?? 0) + 1);
    for (const f of familyNames(s)) familyWeight.set(f, (familyWeight.get(f) ?? 0) + 1);
  }
  const byWeight = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
  const profile = {
    notes: byWeight(noteWeight).slice(0, 8),
    families: byWeight(familyWeight).slice(0, 4),
  };

  // 4. Everything on the shelf in any bucket is "seen".
  const { data: allOwnedIds } = await supabase
    .from("collection_items")
    .select("fragrance_id")
    .eq("user_id", appUser.id);
  const seenIds = new Set((allOwnedIds ?? []).map((r) => r.fragrance_id));

  // 5. Fan out similarity from each seed, in parallel.
  type Hit = {
    fragrance: Fragrance;
    similarity: number;
    becauseOf: string[];
    sharedNotes: string[];
    coverage: number;
  };
  const aggregate = new Map<string, Hit>();

  await Promise.all(
    seeds.map(async (seed) => {
      const { data, error } = await supabase.rpc("find_similar_fragrances", {
        p_id: seed.id,
        p_limit: PER_SEED_CANDIDATES,
      });
      if (error || !data) return;

      for (const row of data as Array<Fragrance & { similarity: number }>) {
        if (seenIds.has(row.id)) continue;
        const existing = aggregate.get(row.id);
        if (existing) {
          existing.similarity = Math.max(existing.similarity, row.similarity ?? 0);
          if (!existing.becauseOf.includes(seed.name)) existing.becauseOf.push(seed.name);
          continue;
        }
        // Profile coverage: sum of the weights of every profile note and
        // family this candidate carries, normalised by the profile's total
        // weight. A candidate that hits what all three seeds share scores
        // higher than one that only matches a single seed's quirk.
        const cn = noteNames(row);
        const cf = familyNames(row);
        let covered = 0;
        let total = 0;
        const shared: string[] = [];
        for (const [n, w] of noteWeight) {
          total += w;
          if (cn.has(n)) {
            covered += w;
            shared.push(n);
          }
        }
        for (const [f, w] of familyWeight) {
          total += w * 1.5;
          if (cf.has(f)) covered += w * 1.5;
        }
        aggregate.set(row.id, {
          fragrance: row,
          similarity: row.similarity ?? 0,
          becauseOf: [seed.name],
          sharedNotes: shared
            .sort((a, b) => (noteWeight.get(b) ?? 0) - (noteWeight.get(a) ?? 0))
            .slice(0, 3),
          coverage: total > 0 ? covered / total : 0,
        });
      }
    }),
  );

  // 6. Rank by profile coverage, then vector similarity, with a small daily
  //    jitter so near-identical scores don't produce the same order every
  //    time the same trio comes up.
  const similar = [...aggregate.values()]
    .map((h) => ({ h, score: h.coverage * 0.7 + h.similarity * 0.3 + rand() * 0.04 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, SIMILAR_FEED_SIZE)
    .map(({ h }) => ({
      fragrance: h.fragrance,
      similarity: h.similarity,
      becauseOf: h.becauseOf,
      sharedNotes: h.sharedNotes,
    }));

  // 7. Cheaper dupes, from today's seeds so this section rotates too.
  const dupeSeen = new Set<string>();
  const cheaperDupes: Recommendations["cheaperDupes"] = [];
  for (const seed of seeds) {
    for (const d of (seed.dupes ?? []) as DupeRecommendation[]) {
      const key = `${d.house}|${d.name}`.toLowerCase();
      if (dupeSeen.has(key)) continue;
      dupeSeen.add(key);
      cheaperDupes.push({ forFragrance: seed, dupe: d });
      if (cheaperDupes.length >= DUPE_FEED_SIZE) break;
    }
    if (cheaperDupes.length >= DUPE_FEED_SIZE) break;
  }

  // Passed straight into a client component; perfumer is Pro-only.
  return stripProFieldsDeep({
    userId: appUser.id,
    ownedCount: owned.length,
    seeds,
    profile,
    similar,
    cheaperDupes,
  });
}

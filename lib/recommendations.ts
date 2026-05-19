// Server-side recommendation builder for the signed-in home feed.
//
// Strategy: starting from the user's `own` collection items, fan out via
// find_similar_fragrances (pgvector cosine) and aggregate. Filter out
// anything they already own/tried/wishlist'd so the feed never recommends
// what's already on their shelf.
//
// Performance budget: one query for the seed set, one RPC call per seed
// (capped to MAX_SEEDS), one query for owned-set dedupe. For a typical
// 3-fragrance onboarding picker that's ~5 queries — fast enough to do
// inline on the home page render.

import { createAdminClient } from "@/lib/supabase/admin";
import type { DupeRecommendation, Fragrance } from "@/lib/types";

/** How many owned fragrances we'll fan out from. Caps query cost. */
const MAX_SEEDS = 5;

/** How many similar candidates we ask the RPC for, per seed. */
const PER_SEED_CANDIDATES = 8;

/** Final cap on each section of the recommendation feed. */
const SIMILAR_FEED_SIZE = 8;
const DUPE_FEED_SIZE = 6;

export interface Recommendations {
  /** App user id (Supabase users.id), useful for downstream personalization. */
  userId: string | null;
  /** How many fragrances the user owns. Drives "show empty state vs feed" branching. */
  ownedCount: number;
  /** The fragrances the recommendations were derived from. Capped at MAX_SEEDS. */
  seeds: Fragrance[];
  /** Fragrances similar to the user's owned set, ordered by aggregate similarity. */
  similar: Array<{
    fragrance: Fragrance;
    /** Best per-seed similarity score this fragrance had. */
    similarity: number;
    /** Which owned fragrance(s) led us to this recommendation. */
    becauseOf: string[];
  }>;
  /** Dupes pulled from the user's owned set — cheaper alternatives. */
  cheaperDupes: Array<{
    /** The owned fragrance the dupe is for. */
    forFragrance: Fragrance;
    dupe: DupeRecommendation;
  }>;
}

/**
 * Build a recommendation set for a Clerk-authenticated user.
 *
 * Returns a stable shape regardless of state — callers can render against
 * the same skeleton whether the user has 0, 1, or 10 owned fragrances.
 */
export async function getRecommendations(
  clerkUserId: string,
): Promise<Recommendations> {
  const supabase = createAdminClient();

  // 1. Map Clerk → app user id.
  const { data: appUser } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  const empty: Recommendations = {
    userId: appUser?.id ?? null,
    ownedCount: 0,
    seeds: [],
    similar: [],
    cheaperDupes: [],
  };
  if (!appUser) return empty;

  // 2. Pull the user's `own` items. Joined to the fragrance row so the
  //    recommender has full data (image, dupes, etc.) without a second pass.
  const { data: ownedRows } = await supabase
    .from("collection_items")
    .select("fragrance:fragrances(*)")
    .eq("user_id", appUser.id)
    .eq("status", "own")
    .order("added_at", { ascending: false })
    .limit(MAX_SEEDS);

  const owned = (ownedRows ?? [])
    .map((r) => (r as unknown as { fragrance: Fragrance }).fragrance)
    .filter(Boolean) as Fragrance[];

  if (owned.length === 0) {
    return { ...empty, userId: appUser.id };
  }

  // 3. Anything in ANY collection bucket (own/tried/wishlist) is "seen" —
  //    we never want to surface those as fresh recommendations.
  const { data: allOwnedIds } = await supabase
    .from("collection_items")
    .select("fragrance_id")
    .eq("user_id", appUser.id);
  const seenIds = new Set((allOwnedIds ?? []).map((r) => r.fragrance_id));

  // 4. Fan out similarity queries in parallel — one RPC per seed.
  //    Aggregate: keyed by fragrance id, keep max similarity + collect
  //    which seeds surfaced it (the "becauseOf" line in the UI).
  type SimilarHit = {
    fragrance: Fragrance;
    similarity: number;
    becauseOf: string[];
  };
  const aggregate = new Map<string, SimilarHit>();

  await Promise.all(
    owned.map(async (seed) => {
      const { data, error } = await supabase.rpc("find_similar_fragrances", {
        p_id: seed.id,
        p_limit: PER_SEED_CANDIDATES,
      });
      if (error || !data) return;

      for (const row of data as Array<Fragrance & { similarity: number }>) {
        if (seenIds.has(row.id)) continue;
        const existing = aggregate.get(row.id);
        if (!existing) {
          aggregate.set(row.id, {
            fragrance: row,
            similarity: row.similarity ?? 0,
            becauseOf: [seed.name],
          });
        } else {
          // Keep the strongest signal; record which seeds surfaced it.
          existing.similarity = Math.max(existing.similarity, row.similarity ?? 0);
          if (!existing.becauseOf.includes(seed.name)) {
            existing.becauseOf.push(seed.name);
          }
        }
      }
    }),
  );

  // 5. Rank: aggregate similarity, ties broken by how many seeds surfaced
  //    the fragrance (a hit that appeared as similar to two owned bottles
  //    is a stronger recommendation than one that only matched once).
  const similar = Array.from(aggregate.values())
    .sort((a, b) => {
      if (b.becauseOf.length !== a.becauseOf.length) {
        return b.becauseOf.length - a.becauseOf.length;
      }
      return b.similarity - a.similarity;
    })
    .slice(0, SIMILAR_FEED_SIZE);

  // 6. Cheaper dupes from the owned set. The `dupes` column on each
  //    fragrance is jsonb (curated + AI-generated, see migration 0002 +
  //    the editorial ingest flow). We flatten across all seeds and keep
  //    only the first occurrence of each (house, name) pair.
  const dupeSeen = new Set<string>();
  const cheaperDupes: Recommendations["cheaperDupes"] = [];
  for (const seed of owned) {
    const dupes = (seed.dupes ?? []) as DupeRecommendation[];
    for (const d of dupes) {
      const key = `${d.house}|${d.name}`.toLowerCase();
      if (dupeSeen.has(key)) continue;
      dupeSeen.add(key);
      cheaperDupes.push({ forFragrance: seed, dupe: d });
      if (cheaperDupes.length >= DUPE_FEED_SIZE) break;
    }
    if (cheaperDupes.length >= DUPE_FEED_SIZE) break;
  }

  return {
    userId: appUser.id,
    ownedCount: owned.length,
    seeds: owned,
    similar,
    cheaperDupes,
  };
}

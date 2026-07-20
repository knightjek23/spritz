import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeHouseName } from "@/lib/house-normalize";
import type { JoinedTrendingEntry, MatchMethod, TrendingEntry } from "./types";

const FUZZY_AUTO_MATCH = 0.85;

/**
 * Cached join. The raw join fires one trigram-search RPC per unmatched
 * entry (up to ~12 per feed, ~48 across the four home-page areas), which
 * is far too expensive to run per pageview. Feeds only change when the
 * weekly collector commits a new file, so cache on (area, generated_at):
 * a new feed automatically gets a fresh cache entry, and within a feed's
 * lifetime the RPCs run once per revalidation instead of once per render.
 */
export function joinTrendingToCatalogCached(
  area: string,
  generatedAt: string,
  entries: TrendingEntry[],
): Promise<JoinedTrendingEntry[]> {
  return unstable_cache(
    () => joinTrendingToCatalog(entries),
    ["trending-join", area, generatedAt, String(entries.length)],
    { revalidate: 3600 },
  )();
}

type CatalogLite = {
  id: string;
  name: string;
  house: string | null;
  bottle_image_url: string | null;
  fragrantica_url: string | null;
};

export async function joinTrendingToCatalog(
  entries: TrendingEntry[],
): Promise<JoinedTrendingEntry[]> {
  const supabase = createAdminClient();

  const urls = Array.from(
    new Set(entries.map((e) => e.fragrantica_url).filter(Boolean) as string[]),
  );

  const byUrl = new Map<string, CatalogLite>();
  if (urls.length > 0) {
    const { data, error } = await supabase
      .from("fragrances")
      .select("id, name, house, bottle_image_url, fragrantica_url")
      .in("fragrantica_url", urls);
    if (error) {
      console.warn("[trending] url match query failed:", error.message);
    } else {
      for (const row of data ?? []) {
        if (row.fragrantica_url) byUrl.set(row.fragrantica_url, row as CatalogLite);
      }
    }
  }

  return Promise.all(
    entries.map(async (entry) => {
      const urlHit = entry.fragrantica_url ? byUrl.get(entry.fragrantica_url) : undefined;
      if (urlHit) {
        return finalize(entry, urlHit, "fragrantica_url", null);
      }

      // Normalize the house before matching. Feeds carry abbreviations
      // ("MFK", "YSL") that score ~0 on house similarity and, because the
      // RPC weights house at 0.35, drag an otherwise-perfect name match
      // below the 0.85 cutoff. Canonicalizing restores that weight.
      const normHouse = normalizeHouseName(entry.house);
      const { data, error } = await supabase.rpc("search_fragrances", {
        p_brand: normHouse,
        p_name: entry.name,
        p_limit: 5,
      });
      if (error) {
        console.warn(`[trending] match query failed for "${entry.name}":`, error.message);
        return finalize(entry, null, "unmatched", null);
      }
      const candidates = (data ?? []) as Array<{
        id: string;
        name: string;
        house: string | null;
        bottle_image_url: string | null;
        match_score: number;
      }>;

      // 1. Deterministic name + house link. This is the primary path for
      //    curated weekly feeds: among the candidates, take the one whose
      //    normalized name AND canonical house both equal the feed entry.
      //    Ignores the fuzzy score entirely, so a perfect name/house pair
      //    always links regardless of trigram quirks. Requesting 5
      //    candidates (not 1) means the exact row is available even when
      //    something else happens to score higher.
      const exact = candidates.find(
        (c) => namesEquivalent(entry.name, c.name) && housesEquivalent(normHouse, c.house),
      );
      if (exact) {
        return finalize(entry, exact, "exact", null);
      }

      // 2. Fuzzy fallback for near-misses (spelling variants, "EDP" vs
      //    "Eau de Parfum") that clear the 0.85 combined-similarity bar.
      const top = candidates[0];
      if (top && top.match_score >= FUZZY_AUTO_MATCH) {
        return finalize(entry, top, "fuzzy", top.match_score);
      }
      return finalize(entry, null, "unmatched", null);
    }),
  );
}

// Loose string key for name comparison: lowercase, strip punctuation,
// collapse whitespace. "Baccarat Rouge 540 Extrait" vs "baccarat rouge
// 540 extrait" -> equal.
function nameKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesEquivalent(a: string, b: string): boolean {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (ka === kb) return true;
  // Order-independent fallback: feeds sometimes flip word order
  // ("Born In Roma Donna" vs the catalog's "Donna Born in Roma"). Compare
  // as sorted token sets. Safe because the deterministic match is already
  // gated on the house being equal, so this can't cross-match two
  // different houses' scents.
  const toks = (k: string) => k.split(" ").filter(Boolean).sort().join(" ");
  return toks(ka) === toks(kb);
}

// House equality for the deterministic path. The feed house is ALREADY
// normalized to canonical form by the caller; here we compare it to the
// candidate's catalog house. Exact (case-insensitive) match, or a shared
// 3+ letter significant token so "Yves Saint Laurent" still equals a
// catalog row stored as "Yves Saint Laurent (YSL)". The shared-token
// guard prevents two unrelated houses that both named a scent "Libre"
// from cross-matching on the name alone.
function housesEquivalent(normalizedFeedHouse: string, catalogHouse: string | null): boolean {
  if (!catalogHouse) return false;
  const a = normalizedFeedHouse.toLowerCase().trim();
  const b = catalogHouse.toLowerCase().trim();
  if (a === b) return true;
  const tokens = (s: string) =>
    new Set(s.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((t) => t.length >= 3));
  const ta = tokens(a);
  for (const t of tokens(b)) if (ta.has(t)) return true;
  return false;
}

function finalize(
  entry: TrendingEntry,
  match: { id: string; bottle_image_url: string | null } | null,
  method: MatchMethod,
  score: number | null,
): JoinedTrendingEntry {
  return {
    ...entry,
    fragranceId: match?.id ?? null,
    imageUrl: match?.bottle_image_url ?? entry.thumbnail_url ?? null,
    matchMethod: method,
    matchScore: score,
  };
}

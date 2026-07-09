import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
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

      const { data, error } = await supabase.rpc("search_fragrances", {
        p_brand: entry.house,
        p_name: entry.name,
        p_limit: 1,
      });
      if (error) {
        console.warn(`[trending] fuzzy match failed for "${entry.name}":`, error.message);
        return finalize(entry, null, "unmatched", null);
      }
      const top = data?.[0];
      if (top && top.match_score >= FUZZY_AUTO_MATCH) {
        return finalize(entry, top, "fuzzy", top.match_score);
      }
      return finalize(entry, null, "unmatched", null);
    }),
  );
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

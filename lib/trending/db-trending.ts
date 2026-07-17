// Live, database-derived trending surfaces. Server-only. Unlike lib/trending/feed.ts
// (which reads the weekly external scraper JSON), these query Supabase directly at
// request time, so they need no collector run, no GitHub Action, and carry no
// scraping / ToS risk. Each returns ScrollerRow[] and never throws — on any error
// it returns [] so the calling section simply self-hides.

import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ScrollerRow } from "@/components/fragrance-scroller";

const SELECT = "id, name, house, bottle_image_url";

// These surfaces are decorative and identical for every visitor, so cache
// them across requests. Without this, every render of the home /
// library pages re-ran the queries (including the 5,000-row
// collection_items pull below). 15 min staleness is invisible here.
const CACHE_REVALIDATE_SECONDS = 900;

/**
 * "Trending on Fragrantica" — straight from the catalog's popularity_rank
 * (scraped from Fragrantica at catalog-build time). Lower rank = more popular.
 * This replaces the live Fragrantica scrape: same signal, no anti-bot, no ToS risk.
 */
export const getPopularOnFragrantica = unstable_cache(
  _getPopularOnFragrantica,
  ["db-trending-popular"],
  { revalidate: CACHE_REVALIDATE_SECONDS },
);
async function _getPopularOnFragrantica(limit = 12): Promise<ScrollerRow[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("fragrances")
      .select(`${SELECT}, popularity_rank`)
      .not("popularity_rank", "is", null)
      .order("popularity_rank", { ascending: true })
      .limit(limit);
    if (error) {
      console.warn("[db-trending] popular-on-fragrantica:", error.message);
      return [];
    }
    return (data ?? []).map(toRow);
  } catch (err) {
    console.warn("[db-trending] popular-on-fragrantica threw:", asMsg(err));
    return [];
  }
}

/**
 * "New this year" — recent releases, ordered by popularity. Falls back to the
 * prior year too so the section isn't empty early in a calendar year.
 */
export const getNewThisYear = unstable_cache(
  _getNewThisYear,
  ["db-trending-new-this-year"],
  { revalidate: CACHE_REVALIDATE_SECONDS },
);
async function _getNewThisYear(limit = 12): Promise<ScrollerRow[]> {
  try {
    const supabase = createAdminClient();
    const minYear = new Date().getUTCFullYear() - 1;
    const { data, error } = await supabase
      .from("fragrances")
      .select(`${SELECT}, year, popularity_rank`)
      .gte("year", minYear)
      .order("year", { ascending: false })
      .order("popularity_rank", { ascending: true, nullsFirst: false })
      .limit(limit);
    if (error) {
      console.warn("[db-trending] new-this-year:", error.message);
      return [];
    }
    return (data ?? []).map(toRow);
  } catch (err) {
    console.warn("[db-trending] new-this-year threw:", asMsg(err));
    return [];
  }
}

/**
 * "Most added to collections" — a first-party popularity signal. Supabase JS
 * can't GROUP BY without an RPC, so we pull the recent collection_items window
 * and tally in memory. Fine at this volume; promote to an RPC if it grows.
 */
export const getMostAddedToCollection = unstable_cache(
  _getMostAddedToCollection,
  ["db-trending-most-added"],
  { revalidate: CACHE_REVALIDATE_SECONDS },
);
async function _getMostAddedToCollection(limit = 12, days = 90): Promise<ScrollerRow[]> {
  try {
    const supabase = createAdminClient();
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data: adds, error } = await supabase
      .from("collection_items")
      .select("fragrance_id, added_at")
      .gte("added_at", since)
      .limit(5000);
    if (error) {
      console.warn("[db-trending] most-added:", error.message);
      return [];
    }
    const counts = new Map<string, number>();
    for (const a of adds ?? []) {
      counts.set(a.fragrance_id, (counts.get(a.fragrance_id) ?? 0) + 1);
    }
    if (counts.size === 0) return [];
    const topIds = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);

    const { data: frs, error: frErr } = await supabase
      .from("fragrances")
      .select(SELECT)
      .in("id", topIds);
    if (frErr) {
      console.warn("[db-trending] most-added detail:", frErr.message);
      return [];
    }
    // preserve the count-desc order
    const byId = new Map((frs ?? []).map((f) => [f.id, toRow(f)]));
    return topIds.map((id) => byId.get(id)).filter((r): r is ScrollerRow => !!r);
  } catch (err) {
    console.warn("[db-trending] most-added threw:", asMsg(err));
    return [];
  }
}

/**
 * "Most clicked to buy" — first-party purchase intent from affiliate_clicks.
 * This is the honest replacement for the scraped retailer bestseller list:
 * no affiliate network exposes a public sales rank, and retailer bestseller
 * pages are client-rendered / anti-bot. Your own click data is the one
 * bestseller-ish signal you actually own, and it can never break.
 * Scales with traffic, so it self-hides until clicks accumulate.
 */
export const getMostClickedToBuy = unstable_cache(
  _getMostClickedToBuy,
  ["db-trending-most-clicked"],
  { revalidate: CACHE_REVALIDATE_SECONDS },
);
async function _getMostClickedToBuy(limit = 12, days = 90): Promise<ScrollerRow[]> {
  try {
    const supabase = createAdminClient();
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data: clicks, error } = await supabase
      .from("affiliate_clicks")
      .select("fragrance_id, clicked_at")
      .gte("clicked_at", since)
      .limit(5000);
    if (error) {
      console.warn("[db-trending] most-clicked:", error.message);
      return [];
    }
    const counts = new Map<string, number>();
    for (const c of clicks ?? []) {
      counts.set(c.fragrance_id, (counts.get(c.fragrance_id) ?? 0) + 1);
    }
    if (counts.size === 0) return [];
    const topIds = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);

    const { data: frs, error: frErr } = await supabase
      .from("fragrances")
      .select(SELECT)
      .in("id", topIds);
    if (frErr) {
      console.warn("[db-trending] most-clicked detail:", frErr.message);
      return [];
    }
    const byId = new Map((frs ?? []).map((f) => [f.id, toRow(f)]));
    return topIds.map((id) => byId.get(id)).filter((r): r is ScrollerRow => !!r);
  } catch (err) {
    console.warn("[db-trending] most-clicked threw:", asMsg(err));
    return [];
  }
}

function toRow(f: {
  id: string;
  name: string;
  house: string;
  bottle_image_url: string | null;
}): ScrollerRow {
  return { id: f.id, name: f.name, house: f.house, bottle_image_url: f.bottle_image_url };
}

function asMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

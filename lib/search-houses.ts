// House matches for the search typeahead.
//
// When the query looks like a house name ("xerjoff", "creed", "goldfield
// banks"), the dropdown shows a House row above the fragrance matches that
// links straight to /house/[slug]. The catalog house list (name, slug,
// count) is small and changes rarely, so it is loaded once per instance
// via list_catalog_houses and matched in memory; the search route pays no
// extra query per keystroke after the first.
//
// Match rule: every query word must be a prefix of some word in the house
// name. Filler words ("and", "&", "de", "of") are ignored on both sides so
// "goldfield banks" finds "Goldfield & Banks Australia". A query that
// matches a fragrance name only ("naxos") produces no house row.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { canonicalHouseSlug, houseSlug } from "./slugs";

export interface HouseHit {
  /** Display name as stored in the catalog, e.g. "Goldfield & Banks Australia". */
  name: string;
  /** Canonical route slug for /house/[slug]. */
  slug: string;
  /** Catalog rows under this house (aliases merged). */
  count: number;
}

interface CatalogHouse {
  house: string;
  slug: string;
  fragrance_count: number;
}

interface HouseIndex {
  houses: HouseHit[];
  /** Pre-split lowercase words per house, aligned with `houses`. */
  words: string[][];
  loadedAt: number;
}

const TTL_MS = 60 * 60 * 1000;
const MAX_HOUSES = 2;
const FILLER = new Set(["and", "&", "de", "of", "the", "la", "le", "les", "du", "di"]);

let index: HouseIndex | null = null;
let loading: Promise<HouseIndex> | null = null;

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/['']/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0 && !FILLER.has(w));
}

async function loadIndex(supabase: SupabaseClient<Database>): Promise<HouseIndex> {
  if (index && Date.now() - index.loadedAt < TTL_MS) return index;
  if (loading) return loading;
  loading = (async () => {
    const { data } = await supabase
      .rpc("list_catalog_houses", { p_limit: 5000 })
      .returns<CatalogHouse[]>();
    // Merge aliases (Maison Martin Margiela → Maison Margiela) the same
    // way /houses does, so the row links to the canonical page and the
    // count covers both spellings.
    const merged = new Map<string, HouseHit>();
    for (const row of data ?? []) {
      const slug = canonicalHouseSlug(houseSlug(row.house));
      const existing = merged.get(slug);
      if (existing) {
        existing.count += row.fragrance_count;
        if (slug === houseSlug(row.house)) existing.name = row.house;
      } else {
        merged.set(slug, { name: row.house, slug, count: row.fragrance_count });
      }
    }
    const houses = [...merged.values()];
    index = { houses, words: houses.map((h) => words(h.name)), loadedAt: Date.now() };
    loading = null;
    return index;
  })();
  return loading;
}

/**
 * Houses whose name the query is typing. Ordered by catalog size so the
 * house people mean ("Creed" over a two-bottle "Creed Aventus Clone" entry)
 * comes first; at most MAX_HOUSES. Empty on any failure — the house row is
 * additive and must never take the search down.
 */
export async function findHouses(q: string, supabase: SupabaseClient<Database>): Promise<HouseHit[]> {
  const qw = words(q);
  if (qw.length === 0) return [];
  // A single letter or two matches half the catalog; wait for a real prefix.
  if (qw.length === 1 && qw[0].length < 3) return [];
  try {
    const idx = await loadIndex(supabase);
    const hits: HouseHit[] = [];
    for (let i = 0; i < idx.houses.length; i++) {
      const hw = idx.words[i];
      if (hw.length === 0) continue;
      if (qw.every((w) => hw.some((x) => x.startsWith(w)))) {
        hits.push(idx.houses[i]);
      }
    }
    // Exact whole-name match first, then by count.
    const joined = qw.join(" ");
    hits.sort((a, b) => {
      const ae = words(a.name).join(" ") === joined ? 1 : 0;
      const be = words(b.name).join(" ") === joined ? 1 : 0;
      return be - ae || b.count - a.count;
    });
    return hits.slice(0, MAX_HOUSES);
  } catch {
    return [];
  }
}

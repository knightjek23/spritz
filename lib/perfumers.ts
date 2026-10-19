// Perfumer slugs and lookups for /perfumers and /perfumer/[slug].
//
// This file is the ONLY place a perfumer slug is computed. The SQL side
// (migration 0028) matches on the stored name, never on a slug, and the
// detail page resolves slug -> exact stored name through list_perfumers.
// Keeping slug logic in one language means links and lookups cannot drift.
//
// Unlike houseSlug(), this folds accents first. Perfumer names are full of
// them (Céline Ellena, Thierry Wasser, Domitille Michalon-Bertier,
// Aurélien Guichard), and stripping non-ASCII without folding would turn
// "Céline" into "c-line".

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export function perfumerSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .trim()
    .toLowerCase()
    .replace(/[''.]/g, "") // "Angela St.John" -> "angela stjohn"
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface PerfumerSummary {
  name: string;
  slug: string;
  count: number;
  bestRank: number | null;
  /** Every stored spelling that maps to this slug. The detail page queries
   *  each, otherwise a merged variant's fragrances would silently vanish. */
  storedNames: string[];
}

/**
 * Every credited perfumer, most prolific first.
 *
 * Two cache layers, because the perfumer pages are now dynamic (they are
 * Pro-gated per request, so they can't be ISR):
 *   - unstable_cache: shared across requests for an hour, so a dynamic
 *     page view doesn't re-run a 5,000-row aggregate every time.
 *   - React cache(): dedupes within one render (generateMetadata + page).
 */
const fetchPerfumers = unstable_cache(
  async (): Promise<PerfumerSummary[]> => buildPerfumerList(),
  ["list_perfumers_v1"],
  { revalidate: 3600 },
);

export const listPerfumers = cache(fetchPerfumers);

async function buildPerfumerList(): Promise<PerfumerSummary[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("list_perfumers", { p_limit: 5000 });
  if (error || !data) return [];

  // Two stored spellings can collapse to one slug (e.g. a stray
  // apostrophe). Merge them so a slug always maps to a single entry.
  const bySlug = new Map<string, PerfumerSummary>();
  for (const row of data) {
    const slug = perfumerSlug(row.perfumer);
    if (!slug) continue;
    const prev = bySlug.get(slug);
    if (prev) {
      prev.count += row.fragrance_count;
      prev.storedNames.push(row.perfumer);
      if (row.best_rank != null && (prev.bestRank == null || row.best_rank < prev.bestRank)) {
        prev.bestRank = row.best_rank;
      }
    } else {
      bySlug.set(slug, {
        name: row.perfumer,
        slug,
        count: row.fragrance_count,
        bestRank: row.best_rank,
        storedNames: [row.perfumer],
      });
    }
  }
  return [...bySlug.values()];
}

/** Resolve a URL slug to the stored perfumer name, or null if unknown. */
export async function perfumerBySlug(slug: string): Promise<PerfumerSummary | null> {
  const all = await listPerfumers();
  return all.find((p) => p.slug === slug) ?? null;
}

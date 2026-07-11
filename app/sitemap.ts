// app/sitemap.ts — Next 14 native sitemap.
//
// Three URL groups:
//   1. Static marketing pages (home, search, scan, notes index, pricing).
//   2. Every fragrance detail page (pulled from Supabase, ordered by
//      popularity so search engines crawl high-value pages first).
//   3. Every note library entry (filesystem-backed, ~80 of them).
//
// Regenerated on demand by Next's ISR; doesn't need a build to pick up
// new fragrances. Throttled by `revalidate` to avoid hammering Supabase
// every time a crawler hits /sitemap.xml.

import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAllNotes } from "@/lib/notes";
import { loadAllHouses } from "@/lib/houses";
import { FAMILY_BLURB } from "@/lib/families";

export const revalidate = 3600; // hourly

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const STATIC_PATHS: Array<{ path: string; priority: number; changeFrequency: "weekly" | "daily" }> = [
  { path: "/",          priority: 1.0, changeFrequency: "daily" },
  { path: "/scan",      priority: 0.9, changeFrequency: "weekly" },
  { path: "/search",    priority: 0.8, changeFrequency: "weekly" },
  { path: "/notes",     priority: 0.8, changeFrequency: "weekly" },
  { path: "/houses",    priority: 0.8, changeFrequency: "weekly" },
  { path: "/families",  priority: 0.8, changeFrequency: "weekly" },
  { path: "/pricing",   priority: 0.6, changeFrequency: "weekly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((p) => ({
    url: `${SITE}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  // --- Fragrances --- //
  // Pull every row, ordered by popularity. Capped at 50k (search-engine
  // sitemap protocol limit per file). At our v1 catalog size of 10k that's
  // a lot of headroom; if we ever exceed 50k we'll need a sitemap index.
  let fragranceEntries: MetadataRoute.Sitemap = [];
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("fragrances")
      .select("id, updated_at, popularity_rank")
      .order("popularity_rank", { ascending: true, nullsFirst: false })
      .limit(50000);

    if (!error && data) {
      fragranceEntries = data.map((f) => ({
        url: `${SITE}/fragrance/${f.id}`,
        lastModified: f.updated_at ? new Date(f.updated_at) : now,
        changeFrequency: "monthly" as const,
        // Top-100 most popular get a priority bump — these are the pages
        // we most want indexed and re-crawled.
        priority:
          f.popularity_rank != null && f.popularity_rank <= 100 ? 0.9 : 0.6,
      }));
    }
  } catch (err) {
    // Don't crash sitemap generation if Supabase is briefly unreachable —
    // returning the static + note slice is better than 500-ing the whole
    // sitemap and losing crawl signal entirely.
    console.error("[sitemap] fragrance fetch failed:", err);
  }

  // --- Notes --- //
  let noteEntries: MetadataRoute.Sitemap = [];
  try {
    const notes = await loadAllNotes();
    noteEntries = notes.map((n) => ({
      url: `${SITE}/note/${n.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));
  } catch (err) {
    console.error("[sitemap] note load failed:", err);
  }

  // --- Houses --- //
  let houseEntries: MetadataRoute.Sitemap = [];
  try {
    const houses = await loadAllHouses();
    houseEntries = houses.map((h) => ({
      url: `${SITE}/house/${h.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));
  } catch (err) {
    console.error("[sitemap] house load failed:", err);
  }

  // --- Families --- //
  // Families are a fixed editorial set (FAMILY_BLURB). No DB query needed —
  // every key gets an entry. Catalog-only families that aren't in the map
  // are intentionally omitted from the sitemap (low SEO value without a
  // curated description).
  const familyEntries: MetadataRoute.Sitemap = Object.keys(FAMILY_BLURB).map(
    (slug) => ({
      url: `${SITE}/family/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }),
  );

  return [
    ...staticEntries,
    ...fragranceEntries,
    ...noteEntries,
    ...houseEntries,
    ...familyEntries,
  ];
}

// Paged fragrance lists for /note/[slug] and /family/[slug].
//
// Both pages render the first page on the server and the "See more"
// button fetches the next one from /api/browse/[kind]/[slug]?offset=N.
// Both go through these two functions, so the server page and the API
// can never disagree about which names a note covers or how rows are
// ordered (migration 0041 orders by popularity, then name, then id, so
// paging is stable and never repeats or skips a bottle).
//
// Server-only: the admin client is used for the same reason the pages
// always did (the hand-rolled Database types make the ssr client's rpc
// overloads finicky); the functions return public catalog fields only.

import { createAdminClient } from "@/lib/supabase/admin";
import { loadNote } from "@/lib/notes";
import { resolveNoteQueries } from "@/lib/note-aliases";
import { familySlug } from "@/lib/families";

export const BROWSE_PAGE_SIZE = 50;

export interface BrowseRow {
  id: string;
  name: string;
  house: string;
  year: number | null;
  bottle_image_url: string | null;
  /** Note pages only: which layer the note sits in. */
  layer?: "top" | "mid" | "base";
}

export interface BrowsePage {
  rows: BrowseRow[];
  /** Every match, not just this page. */
  total: number;
}

const clampOffset = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** Fragrances carrying a note, one page at a time. */
export async function fetchNotePage(slug: string, offset = 0): Promise<BrowsePage> {
  const note = await loadNote(slug);
  // Same candidate names as before (trademark marks, spacing variants,
  // catalog typos; lib/note-aliases.ts), now unioned in one query instead
  // of one capped query per name.
  const names = resolveNoteQueries(slug, note?.name);
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("find_fragrances_by_notes_page", {
    p_notes: names,
    p_limit: BROWSE_PAGE_SIZE,
    p_offset: clampOffset(offset),
  });
  if (error) throw error;
  const rows = data ?? [];
  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      house: r.house,
      year: r.year,
      bottle_image_url: r.bottle_image_url,
      layer: r.layer,
    })),
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
  };
}

/** Fragrances in a family, one page at a time. */
export async function fetchFamilyPage(slug: string, offset = 0): Promise<BrowsePage> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("find_fragrances_by_family_page", {
    p_family: familySlug(slug),
    p_limit: BROWSE_PAGE_SIZE,
    p_offset: clampOffset(offset),
  });
  if (error) throw error;
  const rows = data ?? [];
  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      house: r.house,
      year: r.year,
      bottle_image_url: r.bottle_image_url,
    })),
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
  };
}

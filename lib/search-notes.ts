// Note and family rows for the search typeahead (design 2026-10-26).
//
// Same idea as lib/search-houses.ts: while the query is typing a note
// ("frankin…") or a family ("resin…"), the dropdown shows a Note / Family
// row above the fragrance matches that links straight to /note/[slug] or
// /family/[slug]. Index: every catalog note (list_canonical_notes, with
// its fragrance count) plus the editorial notes and their aliases, so
// "olibanum" finds Frankincense; and the fixed family list.
//
// Match rule: every query word must be a prefix of a word in the name or
// an alias. When prefix matching finds nothing and the query is at least
// five letters, a fallback allows an edit distance of 2 against the note
// and family names, so "frankencense" and "sandlewood" still surface the
// right row. Ordered exact-match first, then by catalog count.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { loadAllNotes } from "@/lib/notes";
import { noteSlug } from "@/lib/slugs";
import { FAMILY_ORDER, familyName } from "@/lib/families";

export interface NoteHit {
  /** Display name, e.g. "Frankincense". */
  name: string;
  /** Route slug for /note/[slug]. */
  slug: string;
  /** Catalog fragrances carrying the note (0 for editorial-only names). */
  count: number;
}

export interface FamilyHit {
  name: string;
  slug: string;
}

interface NoteEntry {
  hit: NoteHit;
  /** Lowercased name + aliases, each pre-split into words. */
  forms: string[][];
}

interface Index {
  notes: NoteEntry[];
  loadedAt: number;
}

const TTL_MS = 60 * 60 * 1000;
export const MAX_NOTES = 2;
export const MAX_FAMILIES = 1;
const FUZZY_MIN_LEN = 5;
const FUZZY_MAX_DIST = 2;

let index: Index | null = null;
let loading: Promise<Index> | null = null;

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function title(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

async function loadIndex(supabase: SupabaseClient<Database>): Promise<Index> {
  if (index && Date.now() - index.loadedAt < TTL_MS) return index;
  if (loading) return loading;
  loading = (async () => {
    const [{ data }, editorial] = await Promise.all([
      supabase.rpc("list_canonical_notes", { p_limit: 3000 }),
      loadAllNotes(),
    ]);
    const bySlug = new Map<string, NoteEntry>();
    for (const row of data ?? []) {
      if (!row.name) continue;
      const slug = noteSlug(row.name);
      const prev = bySlug.get(slug);
      if (prev) {
        prev.hit.count += row.fragrance_count;
        prev.forms.push(words(row.name));
      } else {
        bySlug.set(slug, {
          hit: { name: title(row.name), slug, count: row.fragrance_count },
          forms: [words(row.name)],
        });
      }
    }
    // Editorial notes: the canonical display name wins, aliases match too.
    for (const n of editorial) {
      const entry = bySlug.get(n.slug) ?? {
        hit: { name: n.name, slug: n.slug, count: 0 },
        forms: [],
      };
      entry.hit.name = n.name;
      entry.forms.push(words(n.name), ...n.aliases.map(words));
      bySlug.set(n.slug, entry);
    }
    const built: Index = { notes: [...bySlug.values()], loadedAt: Date.now() };
    index = built;
    loading = null;
    return built;
  })();
  return loading;
}

function prefixMatch(qw: string[], forms: string[][]): boolean {
  return forms.some((fw) => fw.length > 0 && qw.every((w) => fw.some((x) => x.startsWith(w))));
}

function exactMatch(joined: string, forms: string[][]): boolean {
  return forms.some((fw) => fw.join(" ") === joined);
}

/** Levenshtein, capped: returns max+1 as soon as it is certain to exceed max. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function fuzzyMatch(joined: string, forms: string[][]): boolean {
  if (joined.length < FUZZY_MIN_LEN) return false;
  return forms.some((fw) => editDistance(joined, fw.join(" "), FUZZY_MAX_DIST) <= FUZZY_MAX_DIST);
}

const FAMILIES = FAMILY_ORDER.filter((f) => f !== "other").map((slug) => ({
  hit: { name: familyName(slug), slug },
  forms: [words(familyName(slug)), words(slug)],
}));

/** Notes the query is typing. Empty on any failure; the row is additive. */
export async function findNotes(q: string, supabase: SupabaseClient<Database>): Promise<NoteHit[]> {
  const qw = words(q);
  if (qw.length === 0) return [];
  if (qw.length === 1 && qw[0].length < 3) return [];
  const joined = qw.join(" ");
  try {
    const idx = await loadIndex(supabase);
    let hits = idx.notes.filter((n) => prefixMatch(qw, n.forms));
    if (hits.length === 0) hits = idx.notes.filter((n) => fuzzyMatch(joined, n.forms));
    hits.sort((a, b) => {
      const ae = exactMatch(joined, a.forms) ? 1 : 0;
      const be = exactMatch(joined, b.forms) ? 1 : 0;
      return be - ae || b.hit.count - a.hit.count || a.hit.name.localeCompare(b.hit.name);
    });
    return hits.slice(0, MAX_NOTES).map((n) => n.hit);
  } catch {
    return [];
  }
}

/** Families the query is typing. Synchronous: the list is fixed. */
export function findFamilies(q: string): FamilyHit[] {
  const qw = words(q);
  if (qw.length === 0) return [];
  if (qw.length === 1 && qw[0].length < 3) return [];
  const joined = qw.join(" ");
  let hits = FAMILIES.filter((f) => prefixMatch(qw, f.forms));
  if (hits.length === 0) hits = FAMILIES.filter((f) => fuzzyMatch(joined, f.forms));
  hits.sort((a, b) => {
    const ae = exactMatch(joined, a.forms) ? 1 : 0;
    const be = exactMatch(joined, b.forms) ? 1 : 0;
    return be - ae || a.hit.name.localeCompare(b.hit.name);
  });
  return hits.slice(0, MAX_FAMILIES).map((f) => f.hit);
}

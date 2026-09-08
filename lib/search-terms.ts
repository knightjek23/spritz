// Keyword search: "musk, iris, citrus" → the most popular fragrances that
// carry those notes or sit in those families.
//
// This module turns the raw search string into resolved terms for the
// find_fragrances_by_terms RPC (migration 0029). The rule for whether a
// query is a keyword query at all: every chunk has to resolve to a known
// note or family. "rose" resolves (so the UI shows a By notes section
// above the name matches); "dior sauvage" does not, and stays a plain
// name search. Mixed queries are name searches on purpose: guessing
// half a query is worse than getting out of the way.
//
// Server-only: reads the editorial note aliases from disk and the
// catalog note list from Supabase (cached in-process for an hour).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { loadAllNotes } from "@/lib/notes";
import { noteSlug } from "@/lib/slugs";
import { NOTE_ALIASES, resolveNoteQueries } from "@/lib/note-aliases";
import { normalizeFamily, familyName } from "@/lib/families";

export type TermKind = "note" | "family";

/** What the client sees back: the word as typed and what it resolved to. */
export interface SearchTerm {
  /** Lowercased, trimmed, as the user typed it. */
  key: string;
  kind: TermKind;
  /** Display label: the note name or the family name. */
  label: string;
}

/** What the RPC consumes. One per term. */
interface RpcTerm {
  key: string;
  names: string[];
  pattern: string | null;
  family: string | null;
}

export interface KeywordResolution {
  terms: SearchTerm[];
  rpcTerms: RpcTerm[];
}

/** Name-search hit: the lite RPC returns exactly what the UI renders. */
export interface SearchHit {
  id: string;
  name: string;
  house: string;
  family: string[] | null;
  year: number | null;
  bottle_image_url: string | null;
  match_score: number;
}

/** Keyword hit: same display fields plus which terms it matched. */
export interface KeywordHit {
  id: string;
  name: string;
  house: string;
  family: string[] | null;
  year: number | null;
  bottle_image_url: string | null;
  popularity_rank: number | null;
  matched: string[];
  match_count: number;
}

/** Shape of GET /api/search. */
export interface SearchResponse {
  results: SearchHit[];
  /** Present only when the whole query resolved to notes/families. */
  terms: SearchTerm[] | null;
  byTerms: KeywordHit[];
}

const MAX_TERMS = 6;
const CATALOG_TTL_MS = 60 * 60 * 1000;

// ---------- known-note index (catalog names + editorial aliases) ----------

interface NoteIndex {
  /** lowercased catalog note names */
  catalog: Set<string>;
  /** alias (lowercased) → canonical editorial name */
  aliasToName: Map<string, string>;
  loadedAt: number;
}

let noteIndex: NoteIndex | null = null;
let noteIndexPromise: Promise<NoteIndex> | null = null;

async function getNoteIndex(supabase: SupabaseClient<Database>): Promise<NoteIndex> {
  if (noteIndex && Date.now() - noteIndex.loadedAt < CATALOG_TTL_MS) return noteIndex;
  if (noteIndexPromise) return noteIndexPromise;
  noteIndexPromise = (async () => {
    const [{ data }, editorial] = await Promise.all([
      supabase.rpc("list_canonical_notes", { p_limit: 3000 }),
      loadAllNotes(),
    ]);
    const catalog = new Set<string>();
    for (const row of data ?? []) {
      if (row.name) catalog.add(row.name.toLowerCase());
    }
    const aliasToName = new Map<string, string>();
    for (const n of editorial) {
      const name = n.name.toLowerCase();
      aliasToName.set(name, name);
      aliasToName.set(n.slug, name);
      for (const a of n.aliases) aliasToName.set(a, name);
    }
    // NOTE_ALIASES keys are slugs (sometimes a known misspelling, per
    // that file); the values are catalog spellings. Label with the
    // editorial name when one of the values is an editorial note, so
    // "vanila" shows back as "vanilla".
    const editorialNames = new Set(editorial.map((n) => n.name.toLowerCase()));
    for (const [slug, names] of Object.entries(NOTE_ALIASES)) {
      const natural = slug.replace(/-/g, " ");
      const canonical =
        names.map((n) => n.toLowerCase()).find((n) => editorialNames.has(n)) ??
        aliasToName.get(natural) ??
        natural;
      if (!aliasToName.has(natural)) aliasToName.set(natural, canonical);
      for (const nm of names) {
        const key = nm.toLowerCase();
        if (!aliasToName.has(key)) aliasToName.set(key, canonical);
      }
    }
    const built: NoteIndex = { catalog, aliasToName, loadedAt: Date.now() };
    noteIndex = built;
    noteIndexPromise = null;
    return built;
  })();
  return noteIndexPromise;
}

// ---------- tokenizing ----------

/**
 * Split on commas, semicolons, "+", "&" and the word "and". A chunk that
 * does not resolve as a whole is then split on spaces and each word must
 * resolve ("musk iris citrus" works; "pink pepper" stays one term).
 */
function chunk(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s*(?:,|;|\+|&|\band\b|\/)\s*/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isFamily(token: string): string | null {
  const t = token.replace(/\s+/g, " ");
  const slug = normalizeFamily(t);
  if (slug !== "other" || t === "other") return slug;
  // "citrusy" / "musky" style adjectives and plurals.
  const stem = t.replace(/(ies|y|s)$/, "");
  const slug2 = normalizeFamily(stem);
  if (slug2 !== "other") return slug2;
  return null;
}

function resolveNote(token: string, index: NoteIndex): { name: string; names: string[] } | null {
  const t = token.replace(/\s+/g, " ");
  const slug = noteSlug(t);
  const canonical =
    index.aliasToName.get(t) ??
    index.aliasToName.get(slug) ??
    (index.catalog.has(t) ? t : null);
  if (!canonical) return null;
  const names = resolveNoteQueries(noteSlug(canonical), canonical).map((n) => n.toLowerCase());
  if (canonical !== t) names.push(t);
  return { name: canonical, names: Array.from(new Set(names)) };
}

function resolveToken(token: string, index: NoteIndex): { term: SearchTerm; rpc: RpcTerm } | null {
  // Notes first: "iris", "rose" and "vanilla" are notes that also alias
  // to a family, and the note is the more specific intent.
  const note = resolveNote(token, index);
  if (note) {
    // Word-boundary pattern so "musk" also finds "white musk", but only
    // for single words: "pink pepper" as a regex would overreach.
    const pattern = token.includes(" ") ? null : `\\m${escapeRegex(token)}\\M`;
    return {
      term: { key: token, kind: "note", label: note.name },
      rpc: { key: token, names: note.names, pattern, family: null },
    };
  }
  const fam = isFamily(token);
  if (fam) {
    // Family terms also match notes that carry the word ("citrus" as a
    // note name, "citrus notes"), so an accord-less bottle still counts.
    const pattern = `\\m${escapeRegex(fam)}\\M`;
    return {
      term: { key: token, kind: "family", label: familyName(fam) },
      rpc: { key: token, names: [], pattern, family: fam },
    };
  }
  return null;
}

/**
 * Resolve a raw query into keyword terms, or null when any part of it is
 * not a known note or family (then it is a name search).
 */
export async function resolveKeywordQuery(
  q: string,
  supabase: SupabaseClient<Database>,
): Promise<KeywordResolution | null> {
  const chunks = chunk(q);
  if (chunks.length === 0) return null;
  const index = await getNoteIndex(supabase);

  const terms: SearchTerm[] = [];
  const rpcTerms: RpcTerm[] = [];
  const seen = new Set<string>();

  function push(r: { term: SearchTerm; rpc: RpcTerm }) {
    if (seen.has(r.term.key)) return;
    seen.add(r.term.key);
    terms.push(r.term);
    rpcTerms.push(r.rpc);
  }

  for (const c of chunks) {
    const whole = resolveToken(c, index);
    if (whole) {
      push(whole);
      continue;
    }
    const words = c.split(" ");
    if (words.length < 2) return null;
    const resolved = words.map((w) => resolveToken(w, index));
    if (resolved.some((r) => r === null)) return null;
    for (const r of resolved) push(r!);
  }

  if (terms.length === 0 || terms.length > MAX_TERMS) return null;
  return { terms, rpcTerms };
}

export async function findByTerms(
  supabase: SupabaseClient<Database>,
  resolution: KeywordResolution,
  limit: number,
): Promise<KeywordHit[]> {
  const { data, error } = await supabase
    .rpc("find_fragrances_by_terms", { p_terms: resolution.rpcTerms, p_limit: limit })
    .returns<KeywordHit[]>();
  if (error) throw error;
  return data ?? [];
}

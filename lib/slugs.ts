// Pure slug helpers — extracted from lib/notes.ts and lib/houses.ts so
// client components can import them without dragging in `node:fs/promises`.
//
// Why this file exists: lib/notes.ts and lib/houses.ts read editorial
// markdown from disk via fs/promises, which is a Node-only built-in.
// Webpack rejects "node:fs/promises" when bundling for the client. Any
// client component (e.g. NotesPyramid) that needs a slug helper must
// import from THIS module instead — it has zero runtime dependencies.
//
// Server-side callers can keep importing from lib/notes / lib/houses;
// those modules re-export the same helpers for back-compat.

export function noteSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function houseSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// House alias resolution.
//
// Some houses appear in the catalog under multiple names because
// Fragrantica stores their historical + current branding separately
// (e.g. Maison Martin Margiela → Maison Margiela after their 2015
// rebrand). Without aliasing, each variant would generate its own slug
// and land on its own /house/[slug] page — users see two entries in the
// /houses list, and each individual page carries only half the catalog.
//
// Alias resolution consolidates them: variant slug maps to canonical
// slug. Downstream:
//   - /houses list merges counts under the canonical entry
//   - /house/[canonical] queries fragrances from BOTH names
//   - Fragrance detail pages link to /house/[canonical] regardless of
//     which name the fragrance is stored under
//
// Format: alias-slug → canonical-slug. Add new entries as they surface.
const HOUSE_ALIASES: Record<string, string> = {
  "maison-martin-margiela": "maison-margiela",
};

/**
 * Given a raw house slug (from houseSlug()), return the canonical slug
 * that should be used for routing. Returns the input unchanged when no
 * alias exists.
 */
export function canonicalHouseSlug(slug: string): string {
  return HOUSE_ALIASES[slug] ?? slug;
}

/**
 * All slugs (canonical + aliases) that should be treated as the same
 * house for catalog queries. When called with a canonical slug that
 * has no aliases, returns [slug]. When called with an alias slug,
 * returns [canonical, ...all-siblings]. Used by /house/[slug] to fetch
 * fragrances stored under every variant name.
 */
export function slugsForCanonicalHouse(slugOrAlias: string): string[] {
  const canonical = canonicalHouseSlug(slugOrAlias);
  const aliases = Object.entries(HOUSE_ALIASES)
    .filter(([, target]) => target === canonical)
    .map(([alias]) => alias);
  return [canonical, ...aliases];
}

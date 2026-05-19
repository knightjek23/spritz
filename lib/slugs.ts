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

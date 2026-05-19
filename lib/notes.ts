// Editorial note loader. Reads /editorial/notes/*.md from disk at request
// time (these are bundled with the deploy, so no I/O cost on Vercel — the
// files live in the same Lambda image as the route handler).
//
// We deliberately don't pull in gray-matter here. The frontmatter for note
// editorials is shallow: name, type, aliases (array literal), family, and
// the body. A 25-line parser handles it without a 200kb dep.
//
// Slug normalization mirrors the parser: lowercase, hyphenated, no spaces.
// "Italian Bergamot" and "italian-bergamot" resolve to the same file.

import fs from "node:fs/promises";
import path from "node:path";

// editorial/ sits at the repo root, sibling of app/ and lib/.
const NOTES_DIR = path.join(process.cwd(), "editorial", "notes");

export interface NoteEditorial {
  /** Canonical lowercase name, e.g. "bergamot". */
  name: string;
  /** Fragrance family this note belongs to, e.g. "citrus". */
  family: string;
  /** Alternate names that should resolve to this entry, lowercased. */
  aliases: string[];
  /** The flavor profile body — 1–4 paragraphs of editorial copy. */
  body: string;
  /** URL slug (the filename minus .md). */
  slug: string;
}

export function noteSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Load a single note by slug. Tries the slug as a filename first, then
 * falls back to scanning aliases across all files. Returns null if no
 * match — caller should `notFound()` in that case.
 */
export async function loadNote(slug: string): Promise<NoteEditorial | null> {
  const normalized = noteSlug(slug);

  // Direct filename match — common case, single file read.
  try {
    const direct = await fs.readFile(
      path.join(NOTES_DIR, `${normalized}.md`),
      "utf8",
    );
    return parseNote(direct, normalized);
  } catch {
    // Fall through to alias scan.
  }

  // Alias scan — load all files (~80 small files, fast at this scale).
  // If/when this gets to thousands of notes, build an index at module
  // load time instead of scanning per-request.
  const all = await loadAllNotes();
  return (
    all.find((n) => n.slug === normalized || n.aliases.includes(normalized)) ??
    null
  );
}

/**
 * Load every note editorial. Used by /notes index + sitemap generation.
 * Cached implicitly by Next's request memoization within a single render.
 */
export async function loadAllNotes(): Promise<NoteEditorial[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(NOTES_DIR);
  } catch {
    return [];
  }
  const files = entries.filter((f) => f.endsWith(".md"));
  const loaded = await Promise.all(
    files.map(async (file) => {
      const raw = await fs.readFile(path.join(NOTES_DIR, file), "utf8");
      const slug = file.replace(/\.md$/, "");
      return parseNote(raw, slug);
    }),
  );
  // Sort alpha by name for stable rendering.
  return loaded.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Group notes by family for the index page. Family is normalized to
 * lowercase — editorial files are consistent but defensive in case.
 */
export function groupNotesByFamily(
  notes: NoteEditorial[],
): Record<string, NoteEditorial[]> {
  return notes.reduce<Record<string, NoteEditorial[]>>((acc, n) => {
    const fam = (n.family || "other").toLowerCase();
    (acc[fam] ??= []).push(n);
    return acc;
  }, {});
}

// ---------- frontmatter parser ----------
// Handles the exact shape we use:
//   ---
//   name: bergamot
//   type: note
//   aliases: [italian bergamot, bergamot oil, bergamot peel]
//   family: citrus
//   ---
//   <body…>
function parseNote(raw: string, slug: string): NoteEditorial {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) {
    // No frontmatter — treat the whole file as body and infer name from slug.
    return {
      slug,
      name: slug.replace(/-/g, " "),
      family: "other",
      aliases: [],
      body: raw.trim(),
    };
  }
  const [, fm, body] = m;

  const data: Record<string, string> = {};
  for (const line of fm.split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    data[kv[1]] = kv[2].trim();
  }

  const aliases = (data.aliases ?? "")
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return {
    slug,
    name: (data.name ?? slug).toLowerCase(),
    family: (data.family ?? "other").toLowerCase(),
    aliases,
    body: body.trim(),
  };
}

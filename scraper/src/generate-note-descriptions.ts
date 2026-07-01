// Pre-populate editorial coverage for every catalog note that doesn't
// already have an editorial file. Writes each as
// editorial/notes/<slug>.md with a `source: ai` frontmatter marker so
// future you can distinguish AI-generated from hand-authored notes.
//
// Same shape as generate-consensus.ts: filter uncovered, generate via
// gpt-4o-mini, write to disk. Resumable (idempotent — skips any note
// whose .md already exists or whose slug appears in another file's
// aliases). Rate-limited at ~400 RPM. Cost: ~$0.0004/note × 330 uncovered
// ≈ $0.15 for the top 5+-fragrance tier.
//
// Coverage rules:
//   1. Load every existing editorial/notes/*.md → build set of covered
//      slugs (filename slugs + aliases from frontmatter).
//   2. Query DB for distinct notes with fragrance_count >= threshold
//      (default 5, override via --min-count=N).
//   3. For each catalog note whose slug isn't covered, generate + write.
//   4. Skip notes whose stored name is a trademark variant of an
//      already-covered note (e.g. "ambrofix™" is already covered because
//      "ambrofix" is an alias of ambroxan.md).
//
// Run with:
//   cd scraper && pnpm tsx src/generate-note-descriptions.ts
// Flags:
//   --min-count=N   only cover notes with >= N fragrances (default 5)
//   --limit=N       process only N notes total (smoke test)
//   --dry           log what would be generated without writing files
//   --batch=N       progress checkpoint every N notes (default 25)

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

// CLI flags
const args = process.argv.slice(2);
const MIN_COUNT = Number(
  args.find((a) => a.startsWith("--min-count="))?.split("=")[1] ?? "5",
);
const LIMIT = Number(
  args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0",
);
const BATCH = Number(
  args.find((a) => a.startsWith("--batch="))?.split("=")[1] ?? "25",
);
const DRY = args.includes("--dry");

// editorial/ sits at the repo root, sibling of scraper/.
const NOTES_DIR = path.resolve("..", "editorial", "notes");

// Same slug rule the app uses (lib/slugs.ts noteSlug). Duplicated here
// because the scraper is its own subproject with no lib/ import.
function noteSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Canonical family slugs from lib/families.ts FAMILY_ORDER — the model
// picks from this fixed set so the swatch/family lookups all resolve.
const FAMILY_SLUGS = [
  "citrus", "floral", "fruity", "green", "aromatic", "spicy",
  "woody", "oriental", "amber", "leather", "musky", "gourmand",
  "aquatic", "ozonic", "synthetic", "chypre", "fougere", "other",
] as const;
type FamilySlug = (typeof FAMILY_SLUGS)[number];

const SYSTEM_PROMPT = `You write short encyclopedia entries for fragrance notes for Spritz — an app that helps casual users understand what a fragrance actually smells like.

WRITING RULES:
- Plain English a beginner can read. Every industry term ("aldehydic", "chypre", "coumarin") gets a short gloss the first time it appears, or gets swapped for something concrete.
- Never use the em dash character. Use periods, colons, commas, or parentheses instead.
- 2-3 sentences per note. Long enough to be useful, short enough to skim.
- Sensory-first: what does it smell like, in words a first-time reader can picture. Use concrete anchors (citrus peel, warm milk, damp forest floor, leather jacket, hot pavement after rain).
- Note the vibe: masculine/feminine coding is real in perfumery but describe it via when/where people wear it, not "for women" or "for men".
- If the note is a synthetic molecule (ambroxan, iso e super, calone, etc.), say so briefly. It's part of what makes a fragrance smell modern.

You'll get:
- name: the note as stored in the catalog
- fragrance_count: how many catalog fragrances use it (higher = well-known)

Return STRICT JSON with:
{
  "name": "<canonical lowercase name, cleaned of trademark suffixes>",
  "family": "<ONE of: citrus, floral, fruity, green, aromatic, spicy, woody, oriental, amber, leather, musky, gourmand, aquatic, ozonic, synthetic, chypre, fougere, other>",
  "aliases": ["<optional common variants — e.g. tonka bean/tonka, ylang-ylang/ylang ylang>"],
  "body": "<the 2-3 sentence description>"
}

Return ONLY the JSON. No prose around it.`;

interface AiNote {
  name: string;
  family: FamilySlug;
  aliases: string[];
  body: string;
}

interface CatalogNote {
  note_name: string;
  fragrance_count: number;
}

interface EditorialSummary {
  slug: string;
  aliases: string[];
}

/** Strip em dashes the model might slip through despite the prompt. */
function sanitize(s: string): string {
  return s.replace(/—/g, ", ").trim();
}

/** Parse a single .md frontmatter block to get slug + aliases. Same
 *  logic as lib/notes.ts parseNote but simpler — we only need the two
 *  fields, not the full body. */
async function loadEditorialSummary(filepath: string): Promise<EditorialSummary | null> {
  try {
    const raw = await fs.readFile(filepath, "utf8");
    const slug = path.basename(filepath).replace(/\.md$/, "");
    const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fmMatch) return { slug, aliases: [] };
    const aliasesLine = fmMatch[1].match(/^aliases:\s*(.*)$/m);
    const aliases = aliasesLine
      ? aliasesLine[1]
          .replace(/^\[|\]$/g, "")
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      : [];
    return { slug, aliases };
  } catch {
    return null;
  }
}

/** Build the set of every slug that's already covered — direct filename
 *  slugs plus every alias listed in any file's frontmatter. Aliases
 *  slugified so we compare on the same key space as the catalog notes. */
async function loadCoveredSlugs(): Promise<Set<string>> {
  const covered = new Set<string>();
  let entries: string[];
  try {
    entries = await fs.readdir(NOTES_DIR);
  } catch {
    console.warn(`Notes dir ${NOTES_DIR} not readable — treating all catalog notes as uncovered`);
    return covered;
  }
  const mdFiles = entries.filter((f) => f.endsWith(".md"));
  const summaries = await Promise.all(
    mdFiles.map((f) => loadEditorialSummary(path.join(NOTES_DIR, f))),
  );
  for (const s of summaries) {
    if (!s) continue;
    covered.add(s.slug);
    for (const alias of s.aliases) {
      covered.add(noteSlug(alias));
    }
  }
  return covered;
}

/** Query the catalog for every distinct note name with count >= threshold. */
async function loadCatalogNotes(minCount: number): Promise<CatalogNote[]> {
  // Same query shape as scripts/audit-note-coverage.sql, filtered by
  // count. Uses raw SQL via .rpc if we've defined one; otherwise runs
  // the query inline as an rpc call is fine.
  //
  // We don't have a dedicated RPC for this — do a direct SQL query via
  // the postgres-js escape hatch instead. The Supabase JS client
  // supports arbitrary SQL only via .rpc(). For a batch/local script
  // like this, it's fine to iterate all fragrances client-side and
  // aggregate in JS — costs one round-trip and avoids adding an RPC
  // for a one-off backfill.
  const { data, error } = await supabase
    .from("fragrances")
    .select("top_notes, mid_notes, base_notes");
  if (error) {
    console.error("Failed to load fragrances:", error.message);
    process.exit(1);
  }
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const all = [
      ...((row.top_notes as Array<{ name: string }> | null) ?? []),
      ...((row.mid_notes as Array<{ name: string }> | null) ?? []),
      ...((row.base_notes as Array<{ name: string }> | null) ?? []),
    ];
    for (const n of all) {
      if (!n?.name) continue;
      const key = n.name.trim().toLowerCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count >= minCount)
    .map(([note_name, fragrance_count]) => ({ note_name, fragrance_count }))
    .sort((a, b) => b.fragrance_count - a.fragrance_count);
}

async function generateOne(note: CatalogNote): Promise<AiNote | null> {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `name: ${note.note_name}\nfragrance_count: ${note.fragrance_count}`,
        },
      ],
      max_tokens: 400,
    });
    const raw = res.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<AiNote>;
    if (
      typeof parsed.name !== "string" ||
      parsed.name.length < 1 ||
      typeof parsed.family !== "string" ||
      !FAMILY_SLUGS.includes(parsed.family as FamilySlug) ||
      typeof parsed.body !== "string" ||
      parsed.body.length < 20
    ) {
      return null;
    }
    return {
      name: sanitize(parsed.name).toLowerCase(),
      family: parsed.family as FamilySlug,
      aliases: (Array.isArray(parsed.aliases) ? parsed.aliases : [])
        .filter((a): a is string => typeof a === "string" && a.length > 0)
        .map((a) => sanitize(a).toLowerCase())
        .slice(0, 8),
      body: sanitize(parsed.body),
    };
  } catch (err) {
    console.warn(
      `  ! ${note.note_name}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/** Serialize an AiNote to the exact frontmatter shape lib/notes.ts
 *  parser expects. `source: ai` and `generated_at` are extra fields the
 *  parser ignores but future you can grep for. */
function toMarkdown(note: AiNote): string {
  const aliasesLine = note.aliases.length > 0
    ? `[${note.aliases.join(", ")}]`
    : "[]";
  return `---
name: ${note.name}
type: note
aliases: ${aliasesLine}
family: ${note.family}
source: ai
generated_at: ${new Date().toISOString()}
---

${note.body}
`;
}

async function main() {
  console.log("--- Spritz note-description backfill ---");
  console.log(`  min fragrance count: ${MIN_COUNT}`);
  if (LIMIT) console.log(`  limit: ${LIMIT}`);
  if (DRY) console.log("  (dry run — no files written)");

  console.log("\nLoading existing editorial coverage…");
  const covered = await loadCoveredSlugs();
  console.log(`  ${covered.size} slugs already covered (files + aliases)`);

  console.log(`\nLoading catalog notes (count >= ${MIN_COUNT})…`);
  const catalog = await loadCatalogNotes(MIN_COUNT);
  console.log(`  ${catalog.length} distinct notes in catalog above threshold`);

  // Filter to uncovered.
  const uncovered = catalog.filter((n) => !covered.has(noteSlug(n.note_name)));
  console.log(`  ${uncovered.length} uncovered → will generate`);

  const target = LIMIT ? uncovered.slice(0, LIMIT) : uncovered;

  let succeeded = 0;
  let failed = 0;
  let skipped_after_gen = 0;

  for (let i = 0; i < target.length; i++) {
    const note = target[i];
    const result = await generateOne(note);
    if (!result) {
      failed++;
      continue;
    }

    // The model might return a canonical name whose slug hits an
    // already-covered file (e.g. it normalizes "ylang ylang" to
    // "ylang-ylang" which we already have). Re-check coverage on the
    // AI-returned canonical name and skip if hit.
    const canonicalSlug = noteSlug(result.name);
    if (covered.has(canonicalSlug)) {
      skipped_after_gen++;
      continue;
    }
    covered.add(canonicalSlug);
    // Also mark the aliases so a later note in the batch that would
    // resolve to the same file gets skipped.
    for (const alias of result.aliases) covered.add(noteSlug(alias));

    const filename = path.join(NOTES_DIR, `${canonicalSlug}.md`);
    if (DRY) {
      console.log(`  [dry] ${filename}`);
      console.log(`        family: ${result.family}, aliases: [${result.aliases.join(", ")}]`);
      console.log(`        body: ${result.body.slice(0, 100)}…`);
    } else {
      await fs.writeFile(filename, toMarkdown(result), "utf8");
    }
    succeeded++;
    if (succeeded % BATCH === 0) {
      console.log(
        `  ✓ ${succeeded}/${target.length} written (${failed} failed, ${skipped_after_gen} skipped after gen)`,
      );
    }

    // ~400 RPM, comfortably under OpenAI tier 1's 500 RPM cap.
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log("");
  console.log(
    `Done. processed=${target.length} succeeded=${succeeded} failed=${failed} skipped_after_gen=${skipped_after_gen}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

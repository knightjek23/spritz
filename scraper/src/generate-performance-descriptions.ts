// Generate plain-English longevity + projection descriptions for every
// fragrance in the catalog, written by gpt-4o-mini in the Spritz
// editorial voice.
//
// Walks `public.fragrances` for rows where longevity_description IS NULL,
// builds a context prompt from each row's notes / family / scores, and
// writes the two descriptions back. Resumable (run it again to pick up
// where it stopped), rate-limited, and idempotent (NULL filter prevents
// double-writing).
//
// Cost: gpt-4o-mini is ~$0.15/M input + $0.60/M output. Each call is
// roughly 180 input + 80 output tokens = ~$0.00008. 5k fragrances ~ $0.40.
//
// Run with:
//   cd scraper && pnpm tsx src/generate-performance-descriptions.ts
// Flags:
//   --limit=N    process only N rows (good for a smoke test)
//   --dry        log what would be generated but don't write to DB
//   --batch=N    rows per progress checkpoint (default 25)

import "dotenv/config";
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
const LIMIT = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0");
const BATCH = Number(args.find((a) => a.startsWith("--batch="))?.split("=")[1] ?? "25");
const DRY = args.includes("--dry");

const SYSTEM_PROMPT = `You write performance descriptions for fragrances in the Spritz editorial voice: plain English, sensory, confident, anchored in concrete reference points a first-time fragrance buyer can picture (a scarf, a sweater, an arm's length, a room, a hallway, an elevator). No industry jargon. No "sillage" or "tenacity." No purple prose. No em dashes (—) anywhere; use periods, colons, or commas.

For each fragrance you'll receive notes, family, year, gender, and (where available) numeric longevity and sillage scores from community ratings. Use those to ground the description. If the community scores are missing, infer from notes and family (heavy oriental/woody/amber = bigger longevity and projection; fresh citrus/green = lighter on both).

Return STRICT JSON with this shape:
{
  "longevity": "<1-2 sentences describing how long it wears in practice>",
  "projection": "<1-2 sentences describing how far it travels off the skin>"
}

Longevity examples:
- Heavy: "Wears all day and into the next morning. Still on a wool coat after a week."
- Moderate: "About six hours on skin, gone from clothing by the next wash."
- Light: "Three or four hours before you need a refresh. Made to be re-applied."

Projection examples:
- Beast mode: "Reaches across a room without effort. Friends notice from across a couch."
- Moderate: "An arm's-length cloud at first, then settles in close after the first hour."
- Skin scent: "Sits close to skin. Someone has to lean in to catch it."

Return ONLY the JSON. No prose around it.`;

interface FragranceRow {
  id: string;
  name: string;
  house: string;
  year: number | null;
  gender: string | null;
  family: string[] | null;
  top_notes: Array<{ name: string }> | null;
  mid_notes: Array<{ name: string }> | null;
  base_notes: Array<{ name: string }> | null;
  longevity_score: number | null;
  sillage_score: number | null;
}

function noteList(notes: Array<{ name: string }> | null): string {
  if (!notes || notes.length === 0) return "(none)";
  return notes.slice(0, 8).map((n) => n.name).join(", ");
}

function buildUserPrompt(f: FragranceRow): string {
  return `Generate longevity + projection descriptions for:

Name: ${f.name}
House: ${f.house}
Year: ${f.year ?? "unknown"}
Gender: ${f.gender ?? "unknown"}
Family / accords: ${(f.family ?? []).join(", ") || "(unknown)"}

Top notes: ${noteList(f.top_notes)}
Heart notes: ${noteList(f.mid_notes)}
Base notes: ${noteList(f.base_notes)}

Community longevity score (0-10): ${f.longevity_score ?? "(unrated)"}
Community sillage score (0-10): ${f.sillage_score ?? "(unrated)"}`;
}

async function generateOne(f: FragranceRow): Promise<{ longevity: string; projection: string } | null> {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(f) },
      ],
      max_tokens: 250,
    });
    const raw = res.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { longevity?: unknown; projection?: unknown };
    if (typeof parsed.longevity !== "string" || typeof parsed.projection !== "string") {
      return null;
    }
    // Defensive em dash sweep — the system prompt forbids them but the
    // model occasionally slips one through. Replace with ", " to keep
    // the sentence readable.
    const longevity = parsed.longevity.replace(/—/g, ", ").trim();
    const projection = parsed.projection.replace(/—/g, ", ").trim();
    return { longevity, projection };
  } catch (err) {
    console.warn(`  ! ${f.house} — ${f.name}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function main() {
  console.log("--- Spritz performance descriptions backfill ---");
  if (DRY) console.log("  (dry run — no DB writes)");
  if (LIMIT) console.log(`  limit: ${LIMIT}`);

  // Pull every row that doesn't yet have a longevity_description. The
  // ingest pipeline for editorial fragrances has already populated some,
  // so this naturally skips them.
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  while (true) {
    const remaining = LIMIT ? Math.max(0, LIMIT - processed) : BATCH;
    if (LIMIT && remaining === 0) break;
    const pageSize = Math.min(BATCH, remaining || BATCH);

    const { data: rows, error } = await supabase
      .from("fragrances")
      .select(
        "id, name, house, year, gender, family, top_notes, mid_notes, base_notes, longevity_score, sillage_score",
      )
      .is("longevity_description", null)
      .order("popularity_rank", { ascending: true, nullsFirst: false })
      .limit(pageSize)
      .returns<FragranceRow[]>();

    if (error) {
      console.error("Supabase query failed:", error.message);
      process.exit(1);
    }
    if (!rows || rows.length === 0) {
      console.log("Nothing left to backfill. Done.");
      break;
    }

    for (const f of rows) {
      const result = await generateOne(f);
      processed++;
      if (!result) {
        failed++;
        continue;
      }

      if (DRY) {
        console.log(`  [dry] ${f.house} — ${f.name}`);
        console.log(`        L: ${result.longevity}`);
        console.log(`        P: ${result.projection}`);
      } else {
        const { error: upErr } = await supabase
          .from("fragrances")
          .update({
            longevity_description: result.longevity,
            projection_description: result.projection,
          })
          .eq("id", f.id);
        if (upErr) {
          console.warn(`  ! ${f.house} — ${f.name}: ${upErr.message}`);
          failed++;
        } else {
          succeeded++;
          if (succeeded % 25 === 0) {
            console.log(`  ✓ ${succeeded} written (${failed} failed)`);
          }
        }
      }

      // Light rate limit — OpenAI tier 1 is 500 RPM. 150ms between calls
      // = ~400 RPM, comfortably under the limit.
      await new Promise((r) => setTimeout(r, 150));
    }

    // Page size was less than the batch limit → we've exhausted the
    // query, no need to loop again.
    if (rows.length < pageSize) break;
  }

  console.log("");
  console.log(`Done. processed=${processed} succeeded=${succeeded} failed=${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

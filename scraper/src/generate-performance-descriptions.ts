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

const SYSTEM_PROMPT = `You write performance assessments for fragrances in the Spritz editorial voice: plain English, sensory, confident, anchored in concrete reference points a first-time fragrance buyer can picture (a scarf, a sweater, an arm's length, a room, a hallway, an elevator). No industry jargon. No "sillage" or "tenacity." No purple prose. No em dashes (—) anywhere; use periods, colons, or commas.

You'll receive each fragrance's notes pyramid, family/accords, year, gender, and (where available) community longevity and sillage scores. Use those to ground your output. If community scores are missing, INFER from notes and family using these heuristics:
- Heavy bases (oud, amber, vanilla, oakmoss, patchouli, musk, ambroxan) → high longevity (7-9)
- Heavy accords (oriental, woody, gourmand, leather, chypre) → strong projection (6-9)
- Fresh / citrus / aquatic / green → lighter on both (3-6 longevity, 3-6 projection)
- Light florals, hesperidic openings → shorter wear (3-5), modest projection (3-5)

Return STRICT JSON with this shape:
{
  "longevity_score": <number 0-10 where 10 = wears 10+ hours on skin>,
  "longevity_confidence": <number 0-1: 0.85 if famous and well-documented, 0.6 if notable, 0.4 if obscure / pure inference>,
  "longevity_description": "<1-2 sentences describing how long it wears in practice>",
  "projection_score": <number 0-10 where 10 = reaches across a room>,
  "projection_confidence": <number 0-1, same scale as above>,
  "projection_description": "<1-2 sentences describing how far it travels off the skin>"
}

Score calibration:
- Longevity 1-3 = under 4 hours; 4-6 = half-day; 7-8 = full day; 9-10 = into the next morning / on clothing for days
- Projection 1-3 = skin scent, intimate; 4-6 = arm's-length cloud; 7-8 = friends notice from across a couch; 9-10 = elevator-clearing, reaches across rooms

Description examples — longevity:
- Heavy: "Wears all day and into the next morning. Still on a wool coat after a week."
- Moderate: "About six hours on skin, gone from clothing by the next wash."
- Light: "Three or four hours before you need a refresh. Made to be re-applied."

Description examples — projection:
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
  longevity_confidence: number | null;
  longevity_description: string | null;
  sillage_score: number | null;
  sillage_confidence: number | null;
  projection_description: string | null;
}

interface AiResult {
  longevity_score: number;
  longevity_confidence: number;
  longevity_description: string;
  projection_score: number;
  projection_confidence: number;
  projection_description: string;
}

function clamp(n: unknown, lo: number, hi: number): number | null {
  if (typeof n !== "number" || Number.isNaN(n)) return null;
  return Math.max(lo, Math.min(hi, n));
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

async function generateOne(f: FragranceRow): Promise<AiResult | null> {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(f) },
      ],
      max_tokens: 400,
    });
    const raw = res.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const longevity_score = clamp(parsed.longevity_score, 0, 10);
    const projection_score = clamp(parsed.projection_score, 0, 10);
    const longevity_confidence = clamp(parsed.longevity_confidence, 0, 1);
    const projection_confidence = clamp(parsed.projection_confidence, 0, 1);

    if (
      longevity_score === null ||
      projection_score === null ||
      longevity_confidence === null ||
      projection_confidence === null ||
      typeof parsed.longevity_description !== "string" ||
      typeof parsed.projection_description !== "string"
    ) {
      return null;
    }

    // Defensive em dash sweep — the system prompt forbids them but the
    // model occasionally slips one through. Replace with ", " to keep
    // the sentence readable.
    return {
      longevity_score,
      longevity_confidence,
      longevity_description: parsed.longevity_description.replace(/—/g, ", ").trim(),
      projection_score,
      projection_confidence,
      projection_description: parsed.projection_description.replace(/—/g, ", ").trim(),
    };
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

    // Pull rows that are missing EITHER the descriptions OR the numeric
    // scores. The 989 rows from the first pass have descriptions but
    // still need scores, so the filter widens to catch them. The per-
    // row update below uses ?? coalescing so existing non-null values
    // are never overwritten.
    const { data: rows, error } = await supabase
      .from("fragrances")
      .select(
        "id, name, house, year, gender, family, top_notes, mid_notes, base_notes, longevity_score, longevity_confidence, longevity_description, sillage_score, sillage_confidence, projection_description",
      )
      .or(
        "longevity_score.is.null,longevity_description.is.null,sillage_score.is.null,projection_description.is.null",
      )
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
        console.log(`        L: ${result.longevity_score.toFixed(1)} (${result.longevity_confidence.toFixed(2)}) ${result.longevity_description}`);
        console.log(`        P: ${result.projection_score.toFixed(1)} (${result.projection_confidence.toFixed(2)}) ${result.projection_description}`);
      } else {
        // Coalesce against existing values — anything already non-null
        // wins so the editorial-authored descriptions (and any
        // previously-scraped community scores) survive intact.
        const { error: upErr } = await supabase
          .from("fragrances")
          .update({
            longevity_score: f.longevity_score ?? result.longevity_score,
            longevity_confidence: f.longevity_confidence ?? result.longevity_confidence,
            longevity_description: f.longevity_description ?? result.longevity_description,
            sillage_score: f.sillage_score ?? result.projection_score,
            sillage_confidence: f.sillage_confidence ?? result.projection_confidence,
            projection_description: f.projection_description ?? result.projection_description,
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

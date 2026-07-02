// AI-infer concentration (EDT/EDP/Parfum/Extrait) for fragrances where
// the name doesn't explicitly say. Runs after backfill-concentration.ts
// (the name parser) to fill in the rows that stayed NULL.
//
// Why AI: Fragrantica doesn't include concentration in the fragrance
// name for the flagship version — "Aventus" is EDP but nothing in the
// name says so. gpt-4o-mini's training data covers most popular
// fragrances' default concentration and can infer from house + year +
// notes for less-famous ones.
//
// Safety: model self-rates confidence 0-1. We only write when
// confidence >= 0.7 so it doesn't fill in guesses on rows it doesn't
// actually know. Low-confidence rows stay NULL and the UI hides the
// field for them, same as before.
//
// Cost: ~$0.0004 per row × ~6700 uncovered = ~$2.60 for the full pass.
// Runtime ~20 min at 150ms rate-limit.
//
// Run with:
//   cd scraper && pnpm tsx src/infer-concentration.ts
// Flags:
//   --limit=N              process only N rows (smoke test)
//   --dry                  log inferences without writing to DB
//   --min-confidence=0.7   floor for writing (default 0.7)

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

const args = process.argv.slice(2);
const LIMIT = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0");
const DRY = args.includes("--dry");
const MIN_CONFIDENCE = Number(
  args.find((a) => a.startsWith("--min-confidence="))?.split("=")[1] ?? "0.7",
);

type Concentration = "edt" | "edp" | "parfum" | "extrait";

const PAGE_SIZE = 500;

const SYSTEM_PROMPT = `You identify the flagship concentration of fragrances. The choices are:
- edt (Eau de Toilette): lighter, 5-15% aromatic oils, common for older classics and fresh/citrus fragrances
- edp (Eau de Parfum): standard modern strength, 15-20%, the default for most modern niche and designer releases
- parfum (Parfum): concentrated, 20-30%, often marketed as the "signature" version
- extrait (Extrait de Parfum): most concentrated, 25-40%, historically the original form; often re-released alongside modern EDP versions

You'll receive a fragrance's name, house, year, and notes. Identify the concentration of THIS specific bottle. If the name is just the base fragrance (no concentration in the name), identify the FLAGSHIP or MOST COMMON release format for that fragrance.

Return STRICT JSON:
{
  "concentration": "edt" | "edp" | "parfum" | "extrait",
  "confidence": 0.0-1.0
}

Confidence guidance:
- 0.9+: You are certain (very famous fragrance you know well, e.g. "Aventus by Creed" → edp with 0.95)
- 0.7-0.9: Reasonably confident (well-known fragrance, or house's typical era pattern gives strong signal)
- 0.5-0.7: Educated guess (moderate signal from notes + era, but not certain)
- Below 0.5: Genuine uncertainty (obscure fragrance, no era clues) — return your best guess but the low confidence tells us to skip writing

Return ONLY the JSON. No prose.`;

interface FragranceRow {
  id: string;
  name: string;
  house: string;
  year: number | null;
  concentration: Concentration | null;
  top_notes: Array<{ name: string }> | null;
  mid_notes: Array<{ name: string }> | null;
  base_notes: Array<{ name: string }> | null;
}

interface AiInference {
  concentration: Concentration;
  confidence: number;
}

function noteSample(notes: Array<{ name: string }> | null): string {
  if (!notes || notes.length === 0) return "(none)";
  return notes.slice(0, 5).map((n) => n.name).join(", ");
}

async function inferOne(row: FragranceRow): Promise<AiInference | null> {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Name: ${row.name}\nHouse: ${row.house}\nYear: ${row.year ?? "unknown"}\nTop notes: ${noteSample(row.top_notes)}\nHeart notes: ${noteSample(row.mid_notes)}\nBase notes: ${noteSample(row.base_notes)}`,
        },
      ],
      max_tokens: 100,
    });
    const raw = res.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<AiInference>;
    if (
      typeof parsed.confidence !== "number" ||
      (parsed.concentration !== "edt" &&
        parsed.concentration !== "edp" &&
        parsed.concentration !== "parfum" &&
        parsed.concentration !== "extrait")
    ) {
      return null;
    }
    return {
      concentration: parsed.concentration,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
    };
  } catch (err) {
    console.warn(
      `  ! ${row.house} — ${row.name}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

async function main() {
  console.log("--- Spritz concentration inference (AI) ---");
  if (DRY) console.log("  (dry run — no DB writes)");
  if (LIMIT) console.log(`  limit: ${LIMIT}`);
  console.log(`  min confidence for write: ${MIN_CONFIDENCE}`);

  // Only touch rows where the parser left concentration NULL. Ordered by
  // popularity so the most-viewed fragrances get inferred first.
  const { count: totalCount } = await supabase
    .from("fragrances")
    .select("id", { count: "exact", head: true })
    .is("concentration", null);
  console.log(`  candidates (concentration is null): ${totalCount ?? "unknown"}`);

  let inferred = 0;
  let confident_written = 0;
  let low_confidence_skipped = 0;
  let failed = 0;
  let processed = 0;
  let offset = 0;
  const byType: Record<Concentration, number> = {
    edt: 0, edp: 0, parfum: 0, extrait: 0,
  };

  while (true) {
    if (LIMIT && processed >= LIMIT) break;
    const remaining = LIMIT ? LIMIT - processed : PAGE_SIZE;
    const pageSize = Math.min(PAGE_SIZE, remaining);

    const { data, error } = await supabase
      .from("fragrances")
      .select(
        "id, name, house, year, concentration, top_notes, mid_notes, base_notes",
      )
      .is("concentration", null)
      .order("popularity_rank", { ascending: true, nullsFirst: false })
      .range(offset, offset + pageSize - 1)
      .returns<FragranceRow[]>();

    if (error) {
      console.error("Supabase query failed:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      processed++;

      const result = await inferOne(row);
      if (!result) {
        failed++;
        continue;
      }
      inferred++;

      if (result.confidence < MIN_CONFIDENCE) {
        low_confidence_skipped++;
        continue;
      }
      byType[result.concentration]++;

      if (DRY) {
        console.log(
          `  [dry] ${row.house} — ${row.name} → ${result.concentration} (${result.confidence.toFixed(2)})`,
        );
      } else {
        const { error: upErr } = await supabase
          .from("fragrances")
          .update({ concentration: result.concentration })
          .eq("id", row.id);
        if (upErr) {
          console.warn(`  ! ${row.house} — ${row.name}: ${upErr.message}`);
          failed++;
        } else {
          confident_written++;
          if (confident_written % 100 === 0) {
            console.log(
              `  ✓ ${confident_written} written · ${processed}/${totalCount ?? "?"} scanned (${low_confidence_skipped} low-conf, ${failed} failed)`,
            );
          }
        }
      }

      // Rate limit — 150ms = ~400 RPM, comfortably under OpenAI tier 1.
      await new Promise((r) => setTimeout(r, 150));
    }

    // Because we updated some rows in this batch, `.is("concentration",
    // null)` returns FEWER rows on the next query — don't blindly
    // increment offset by pageSize. Increment by the number of rows we
    // received; the next query will skip past the low-confidence rows
    // that stayed NULL (they'll get re-queried but we've counted
    // processed already so we won't loop forever unless LIMIT is unset).
    //
    // Cleanest way to avoid re-processing low-confidence rows: track
    // their IDs in memory and skip in the JS loop. Since the goal is
    // finite pass, we accept a bit of re-work here.
    offset += data.length;
    if (data.length < pageSize) break;
  }

  console.log("");
  console.log(
    `Done. processed=${processed} inferred=${inferred} written=${confident_written} low_confidence_skipped=${low_confidence_skipped} failed=${failed}`,
  );
  console.log(
    `Breakdown (confident writes): EDT=${byType.edt}, EDP=${byType.edp}, Parfum=${byType.parfum}, Extrait=${byType.extrait}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

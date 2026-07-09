// AI-infer cultural-presence popularity score for every fragrance in
// the catalog. Two phases:
//
//   Phase 1 (this script): gpt-4o-mini reads name + house + year + notes
//     and returns a 0-10 score for how much the fragrance shows up in
//     fragrance media (Reddit r/fragrance, TikTok, Fragrantica review
//     counts, YouTube reviewers, forum recommendations). Written to
//     popularity_score column. Resumable: filters WHERE
//     popularity_score IS NULL so re-runs pick up where the last stopped.
//
//   Phase 2 (SQL, see scripts/rank-popularity.sql): converts the raw
//     scores into popularity_rank (1 = most popular, ~7000 = least) via
//     a single window-function UPDATE. Josh runs this in Supabase SQL
//     editor once the AI pass finishes.
//
// Cost: ~$0.0004/row × 7113 = ~$2.85 for full catalog. Runtime: ~20 min
// at 150ms throttle (~400 RPM, under OpenAI tier 1 500 RPM cap).
//
// Prompt tuning: model is instructed to return LOW scores when
// uncertain rather than defaulting to 5. Unknown = obscure, and obscure
// deserves a low score. Confidence field is returned but every result
// is written (unlike concentration inference which gates on confidence)
// because a low-confidence-low-score IS the correct answer for a
// fragrance the model doesn't recognize — that's a real signal.
//
// Run with:
//   cd scraper && pnpm popularity
// Flags:
//   --limit=N        process only N rows (smoke test)
//   --dry            log inferences without writing to DB
//   --all            overwrite existing scores (default: only fill NULLs)
//   --test-iconics   score a hardcoded set of iconic fragrances to verify
//                    the ceiling (all should land 9+). No DB access at all —
//                    only needs OPENAI_API_KEY. Exits non-zero if any iconic
//                    scores below 9.

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
const ALL = args.includes("--all");
const TEST_ICONICS = args.includes("--test-iconics");

const PAGE_SIZE = 500;

const SYSTEM_PROMPT = `You rate the cultural presence of fragrances on a 0-10 scale.

Cultural presence = how much a fragrance shows up in fragrance media: Reddit r/fragrance discussions, TikTok mentions, Fragrantica review counts, YouTube fragrance reviewer coverage, common recommendations in fragrance forums. NOT the same as sales volume or personal opinion — it's about visibility in fragrance culture.

Score guide:
- 10: Iconic, universally referenced (Aventus, Bleu de Chanel, Sauvage, Baccarat Rouge 540, Tobacco Vanille)
- 8-9: Very well-known, commonly discussed (Layton, Le Male, Ombre Leather, Y EDP, Oud Wood)
- 6-7: Well-known within enthusiast circles (Herod, Ombré Nomade, Boy Chanel, Aventus Cologne)
- 4-5: Known but not frequently discussed in fragrance media
- 2-3: Obscure — rare mentions
- 0-1: Effectively unknown outside its niche

IMPORTANT: If you do not recognize this specific fragrance or are unsure about its cultural presence, give it a LOW score (1-3). Unknown = obscure. Do NOT default to 5.

Confidence guide:
- 0.9+: You know this fragrance well
- 0.7-0.9: Familiar with the house, reasonable assumption
- 0.5-0.7: Educated guess from context
- Below 0.5: Don't recognize — return a low score

Return STRICT JSON: {"score": <0.0-10.0 with 1 decimal>, "confidence": <0.0-1.0>}
Return ONLY the JSON. No prose.`;

// Ceiling-calibration set for --test-iconics. First three are named as
// 10-anchors in the system prompt (should trivially hit 9+); the rest are
// NOT in the prompt, so they're the honest test of the ceiling.
const ICONIC_TEST_SET: Array<Pick<FragranceRow, "name" | "house" | "year"> & {
  notes: string;
}> = [
  { name: "Aventus", house: "Creed", year: 2010, notes: "pineapple, bergamot, birch, musk" },
  { name: "Sauvage", house: "Dior", year: 2015, notes: "bergamot, pepper, ambroxan" },
  { name: "Baccarat Rouge 540", house: "Maison Francis Kurkdjian", year: 2015, notes: "saffron, jasmine, amberwood, cedar" },
  { name: "Eros", house: "Versace", year: 2012, notes: "mint, green apple, tonka bean, vanilla" },
  { name: "1 Million", house: "Paco Rabanne", year: 2008, notes: "blood mandarin, cinnamon, leather, amber" },
  { name: "La Nuit de L'Homme", house: "Yves Saint Laurent", year: 2009, notes: "cardamom, lavender, cedar, vetiver" },
  { name: "Acqua di Giò Profumo", house: "Giorgio Armani", year: 2015, notes: "bergamot, marine notes, incense, patchouli" },
  { name: "Spicebomb Extreme", house: "Viktor & Rolf", year: 2015, notes: "tobacco, vanilla, cinnamon, saffron" },
];

async function testIconics(): Promise<never> {
  console.log("--- Iconics ceiling test (no DB access) ---\n");
  let failures = 0;
  for (const f of ICONIC_TEST_SET) {
    const result = await scoreOne({
      id: "test",
      name: f.name,
      house: f.house,
      year: f.year,
      family: null,
      top_notes: f.notes.split(", ").map((name) => ({ name })),
      mid_notes: null,
      base_notes: null,
      popularity_score: null,
    });
    if (!result) {
      failures++;
      console.log(`  ✗ ${f.house} — ${f.name}: scoring failed`);
    } else {
      const ok = result.score >= 9;
      if (!ok) failures++;
      console.log(
        `  ${ok ? "✓" : "✗"} ${f.house} — ${f.name} → ${result.score.toFixed(1)} (conf ${result.confidence.toFixed(2)})${ok ? "" : "  ← below 9"}`,
      );
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log(
    `\n${failures === 0 ? "PASS" : "FAIL"}: ${ICONIC_TEST_SET.length - failures}/${ICONIC_TEST_SET.length} iconics scored 9+`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

interface FragranceRow {
  id: string;
  name: string;
  house: string;
  year: number | null;
  family: string[] | null;
  top_notes: Array<{ name: string }> | null;
  mid_notes: Array<{ name: string }> | null;
  base_notes: Array<{ name: string }> | null;
  popularity_score: number | null;
}

interface AiScore {
  score: number;
  confidence: number;
}

function noteSample(notes: Array<{ name: string }> | null): string {
  if (!notes || notes.length === 0) return "(none)";
  return notes.slice(0, 5).map((n) => n.name).join(", ");
}

async function scoreOne(row: FragranceRow): Promise<AiScore | null> {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Name: ${row.name}\nHouse: ${row.house}\nYear: ${row.year ?? "unknown"}\nFamily: ${(row.family ?? []).join(", ") || "(unknown)"}\nTop notes: ${noteSample(row.top_notes)}\nHeart notes: ${noteSample(row.mid_notes)}\nBase notes: ${noteSample(row.base_notes)}`,
        },
      ],
      max_tokens: 60,
    });
    const raw = res.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<AiScore>;
    if (typeof parsed.score !== "number" || typeof parsed.confidence !== "number") {
      return null;
    }
    return {
      score: Math.max(0, Math.min(10, parsed.score)),
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
  if (TEST_ICONICS) await testIconics();

  console.log("--- Spritz popularity inference (AI) ---");
  if (DRY) console.log("  (dry run — no DB writes)");
  if (ALL) console.log("  (--all — overwriting existing scores)");
  if (LIMIT) console.log(`  limit: ${LIMIT}`);

  // Pre-count for progress display.
  const countQuery = supabase.from("fragrances").select("id", { count: "exact", head: true });
  if (!ALL) countQuery.is("popularity_score", null);
  const { count: totalCount } = await countQuery;
  console.log(`  candidates: ${totalCount ?? "unknown"}\n`);

  let processed = 0;
  let scored = 0;
  let written = 0;
  let failed = 0;
  let offset = 0;
  // Distribution tracking for the final report.
  const bands: Record<string, number> = {
    "9-10 (iconic)": 0,
    "7-9 (well-known)": 0,
    "5-7 (moderate)": 0,
    "3-5 (limited)": 0,
    "0-3 (obscure)": 0,
  };

  while (true) {
    if (LIMIT && processed >= LIMIT) break;
    const remaining = LIMIT ? LIMIT - processed : PAGE_SIZE;
    const pageSize = Math.min(PAGE_SIZE, remaining);

    let q = supabase
      .from("fragrances")
      .select(
        "id, name, house, year, family, top_notes, mid_notes, base_notes, popularity_score",
      );
    if (!ALL) q = q.is("popularity_score", null);
    q = q.order("id").range(offset, offset + pageSize - 1);

    const { data, error } = await q.returns<FragranceRow[]>();
    if (error) {
      console.error("Supabase query failed:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      processed++;
      // Belt-and-suspenders check for --all mode (query pulls everything
      // but we still skip in-JS when a score exists and --all wasn't set).
      if (!ALL && row.popularity_score !== null) continue;

      const result = await scoreOne(row);
      if (!result) {
        failed++;
        continue;
      }
      scored++;

      // Band bucketing for the summary.
      if (result.score >= 9) bands["9-10 (iconic)"]++;
      else if (result.score >= 7) bands["7-9 (well-known)"]++;
      else if (result.score >= 5) bands["5-7 (moderate)"]++;
      else if (result.score >= 3) bands["3-5 (limited)"]++;
      else bands["0-3 (obscure)"]++;

      if (DRY) {
        console.log(
          `  [dry] ${row.house} — ${row.name} → ${result.score.toFixed(1)} (conf ${result.confidence.toFixed(2)})`,
        );
      } else {
        const { error: upErr } = await supabase
          .from("fragrances")
          .update({ popularity_score: result.score })
          .eq("id", row.id);
        if (upErr) {
          console.warn(`  ! ${row.house} — ${row.name}: ${upErr.message}`);
          failed++;
        } else {
          written++;
          if (written % 100 === 0) {
            console.log(
              `  ✓ ${written} written · ${processed}/${totalCount ?? "?"} scanned (${failed} failed)`,
            );
          }
        }
      }

      await new Promise((r) => setTimeout(r, 150));
    }

    offset += data.length;
    if (data.length < pageSize) break;
  }

  console.log("");
  console.log(
    `Done. processed=${processed} scored=${scored} written=${written} failed=${failed}`,
  );
  console.log("");
  console.log("Distribution:");
  for (const [label, n] of Object.entries(bands)) {
    console.log(`  ${label.padEnd(20)} ${n}`);
  }
  console.log("");
  console.log(
    "Next: run scripts/rank-popularity.sql in Supabase SQL editor to convert scores into popularity_rank.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

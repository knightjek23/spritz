// Pre-generate the community-consensus take for every fragrance in the
// catalog. Pre-populates the consensus_* columns so Pro users hit cached
// responses instantly on first view of a detail page, instead of waiting
// 3-5 seconds for the on-demand /api/consensus/[id] call to land.
//
// Cost: gpt-4o-mini ~$0.0004 per call (700 input + 500 output tokens).
// Full 7000-fragrance catalog ≈ $2.80. Cheap insurance against the worst
// case (Pro user lands on a popular fragrance, hits a cold cache, sits
// through the wait).
//
// Mirrors scraper/src/generate-performance-descriptions.ts: filter on
// IS NULL, coalesce via ?? so existing rows are never overwritten,
// rate-limited at ~400 RPM (comfortably under the 500 RPM tier 1 cap),
// fully resumable. If the run dies, just re-run — IS NULL filter picks
// up exactly where it left off.
//
// Run with:
//   cd scraper && pnpm consensus
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
const LIMIT = Number(
  args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0",
);
const BATCH = Number(
  args.find((a) => a.startsWith("--batch="))?.split("=")[1] ?? "25",
);
const DRY = args.includes("--dry");

const SYSTEM_PROMPT = `You are a fragrance encyclopedia assistant for Spritz. You synthesize what the public fragrance community (Reddit r/fragrance, Fragrantica reviews, Basenotes, FragranceTok, Parfumo) actually says about specific fragrances.

IMPORTANT WRITING RULES:
- Never use the em dash character. Use periods, colons, commas, or parentheses instead.
- Write in plain English a beginner can read. No industry jargon ("sillage," "monolithic," "chypre" etc.) without a short gloss.
- Be honest. If the community is divided, say it. If a fragrance is loved by enthusiasts but disliked by general buyers, say that too.
- Do NOT invent consensus. If you don't have strong signal on a fragrance (new release, very niche, obscure house), return low confidence and a short note saying so.
- Ground every claim in what real users say. No marketing copy. No flowery prose.

When asked for a consensus take on a fragrance, return:
- summary: 2-3 short paragraphs (4-6 sentences total) covering the strongest community takes: what it smells like in their words, who tends to love it vs dislike it, common occasions/seasons it gets recommended for, any notorious quirks (controversial drydown, projection issues, recent reformulation drama, etc.)
- verdict: ONE sentence answering "Is it worth the buy?" with a clear stance. Examples: "Yes, if you want a polarizing crowd-pleaser that performs harder than its price suggests." "Skip unless you specifically want a smoky leather; better-loved options exist at this tier."
- pros: 3-5 short bullet points of what users praise. Each bullet 5-10 words.
- cons: 3-5 short bullet points of what users criticize. Each bullet 5-10 words.
- confidence: your subjective 0.0-1.0 confidence based on how much real community discussion exists. 0.9 = iconic fragrance with thousands of reviews. 0.5 = some community discussion. 0.3 = new release or obscure niche, minimal signal.

If you genuinely don't have enough signal for a meaningful consensus, set confidence < 0.4 and write summary/pros/cons reflecting that limitation (e.g. summary: "Too new for a strong community consensus yet. Early reviews mention X but the conversation is still forming.").

Return strict JSON: {"summary": "...", "verdict": "...", "pros": [...], "cons": [...], "confidence": 0.0}.`;

interface FragranceRow {
  id: string;
  name: string;
  house: string;
  year: number | null;
  gender: string | null;
  family: string[] | null;
  perfumer: string | null;
  top_notes: Array<{ name: string }> | null;
  mid_notes: Array<{ name: string }> | null;
  base_notes: Array<{ name: string }> | null;
}

interface AiConsensus {
  summary: string;
  verdict: string;
  pros: string[];
  cons: string[];
  confidence: number;
}

function noteList(notes: Array<{ name: string }> | null): string {
  if (!notes || notes.length === 0) return "(none)";
  return notes.slice(0, 8).map((n) => n.name).join(", ");
}

/** Strip em dashes the model might slip through despite the prompt rule. */
function sanitize(s: string): string {
  return s.replace(/—/g, ", ").trim();
}

function buildUserPrompt(f: FragranceRow): string {
  return `Generate a community consensus take on this fragrance:

Name: ${f.name}
House: ${f.house}
Year: ${f.year ?? "unknown"}
Gender: ${f.gender ?? "unknown"}
Perfumer: ${f.perfumer ?? "uncredited"}
Family / accords: ${(f.family ?? []).join(", ") || "(unknown)"}

Top notes: ${noteList(f.top_notes)}
Heart notes: ${noteList(f.mid_notes)}
Base notes: ${noteList(f.base_notes)}

What does the community say? Is it worth buying?`;
}

async function generateOne(f: FragranceRow): Promise<AiConsensus | null> {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(f) },
      ],
      max_tokens: 900,
    });
    const raw = res.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<AiConsensus>;

    // Same shape validation as lib/ai-consensus.ts — bail on anything
    // malformed rather than poisoning the cache with a half-record.
    if (
      typeof parsed.summary !== "string" ||
      parsed.summary.length < 20 ||
      typeof parsed.verdict !== "string" ||
      parsed.verdict.length < 5 ||
      !Array.isArray(parsed.pros) ||
      !Array.isArray(parsed.cons) ||
      typeof parsed.confidence !== "number"
    ) {
      return null;
    }

    return {
      summary: sanitize(parsed.summary),
      verdict: sanitize(parsed.verdict),
      pros: parsed.pros
        .filter((p): p is string => typeof p === "string" && p.length > 0)
        .map(sanitize)
        .slice(0, 5),
      cons: parsed.cons
        .filter((c): c is string => typeof c === "string" && c.length > 0)
        .map(sanitize)
        .slice(0, 5),
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
    };
  } catch (err) {
    console.warn(
      `  ! ${f.house} — ${f.name}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

async function main() {
  console.log("--- Spritz consensus backfill ---");
  if (DRY) console.log("  (dry run — no DB writes)");
  if (LIMIT) console.log(`  limit: ${LIMIT}`);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped_thin = 0;

  while (true) {
    const remaining = LIMIT ? Math.max(0, LIMIT - processed) : BATCH;
    if (LIMIT && remaining === 0) break;
    const pageSize = Math.min(BATCH, remaining || BATCH);

    // Pull rows missing a consensus, ordered by popularity so users hit
    // cached responses on the most-viewed fragrances first.
    const { data: rows, error } = await supabase
      .from("fragrances")
      .select(
        "id, name, house, year, gender, family, perfumer, top_notes, mid_notes, base_notes",
      )
      .is("consensus_summary", null)
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

      // Count low-confidence outputs separately — useful for assessing
      // catalog coverage (how many rows the model basically couldn't
      // synthesize on, e.g. brand-new releases).
      if (result.confidence < 0.4) skipped_thin++;

      if (DRY) {
        console.log(`  [dry] ${f.house} — ${f.name} (conf ${result.confidence.toFixed(2)})`);
        console.log(`        verdict: ${result.verdict}`);
      } else {
        const { error: upErr } = await supabase
          .from("fragrances")
          .update({
            consensus_summary: result.summary,
            consensus_verdict: result.verdict,
            consensus_pros: result.pros,
            consensus_cons: result.cons,
            consensus_confidence: result.confidence,
            consensus_generated_at: new Date().toISOString(),
          })
          .eq("id", f.id);
        if (upErr) {
          console.warn(
            `  ! ${f.house} — ${f.name}: ${upErr.message}`,
          );
          failed++;
        } else {
          succeeded++;
          if (succeeded % 25 === 0) {
            console.log(
              `  ✓ ${succeeded} written (${failed} failed, ${skipped_thin} thin-signal)`,
            );
          }
        }
      }

      // ~400 RPM, comfortably under OpenAI tier 1's 500 RPM cap.
      await new Promise((r) => setTimeout(r, 150));
    }

    // Page size was less than the batch limit → exhausted the query.
    if (rows.length < pageSize) break;
  }

  console.log("");
  console.log(
    `Done. processed=${processed} succeeded=${succeeded} failed=${failed} thin_signal=${skipped_thin}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// AI-generated dupes. Used as a Pro-tier fallback when no editorial dupes
// exist for a fragrance. Cached to DB after first generation.
//
// Model: gpt-4o. gpt-4o-mini had shallow recall of specific community
// dupe pairings and rated itself under the confidence floor even for
// famous ones, so most fragrances returned empty. gpt-4o has much better
// fragrance-domain recall while the anti-hallucination guardrails below
// still prevent invented dupes.
//
// Cost: gpt-4o is roughly $2.50/M input + $10/M output tokens. Each call
// is ~600 input + 400 output tokens = ~$0.0055. Cached to the DB after
// the first generation, so it's a one-time cost per fragrance, and only
// Pro users can trigger it.
//
// Anti-hallucination strategy:
//   1. Provide ALL fragrance metadata in the prompt (notes, family, year, perfumer)
//   2. Constrain output to JSON schema (response_format)
//   3. Low temperature (0.3) for factual rather than creative output
//   4. Force the model to self-rate confidence per dupe
//   5. Tell the model explicitly to skip dupes it isn't confident about

import OpenAI from "openai";
import type { DupeRecommendation, Fragrance } from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

const SYSTEM_PROMPT = `You are a fragrance encyclopedia assistant for Spritz, an app that helps users understand fragrances. You have deep knowledge of the fragrance community's well-documented "dupe" relationships, which are fragrances commonly recognized as similar to a more expensive original.

IMPORTANT WRITING RULE: Never use the em dash character in any output field. Use periods, colons, commas, or parentheses instead. This applies to every "note" you write.

When asked for dupes for a specific fragrance, return ONLY widely-recognized clone or inspired-by relationships from the fragrance community (Reddit r/fragrance, FragranceFanatics, Basenotes, FragranceTik, etc.). Do NOT invent dupes. Do NOT list fragrances you aren't confident actually exist or aren't actually considered dupes.

For each dupe, provide:
- house: the brand name (exactly as commonly written)
- name: the fragrance name (exactly as commonly written)
- similarity: "very close" (near-identical clone), "close" (clearly related but distinguishable), or "inspired by" (shares DNA but takes its own direction)
- note: a SHORT 1-2 sentence editorial note explaining the relationship: what's similar, what's different, what to know
- price_tier: "budget" (~$10-30), "mid" ($30-80), "designer" ($80-150), or "niche" ($150+)
- confidence: your subjective confidence this is a real, community-recognized dupe (0.0 to 1.0)

If you can't think of any well-recognized dupes for this fragrance, return an empty array. It's better to return nothing than to invent dupes.

Return strict JSON: {"dupes": [...]}.`;

interface AiDupeResult extends DupeRecommendation {
  confidence: number;
}

export async function generateDupesWithAI(
  fragrance: Fragrance,
): Promise<DupeRecommendation[]> {
  const noteList = (notes: typeof fragrance.top_notes) =>
    notes.map((n) => n.name).join(", ") || "(none)";

  const userPrompt = `Generate dupes for this fragrance:

Name: ${fragrance.name}
House: ${fragrance.house}
Year: ${fragrance.year ?? "unknown"}
Gender: ${fragrance.gender ?? "unknown"}
Perfumer: ${fragrance.perfumer ?? "uncredited"}
Family / accords: ${fragrance.family.join(", ") || "(unknown)"}

Top notes: ${noteList(fragrance.top_notes)}
Heart notes: ${noteList(fragrance.mid_notes)}
Base notes: ${noteList(fragrance.base_notes)}

Return up to 5 community-recognized dupes. Skip if none. Confidence below 0.4 = don't include.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 800,
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  let parsed: { dupes?: AiDupeResult[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed.dupes)) return [];

  const now = new Date().toISOString();
  return parsed.dupes
    .filter(
      (d) =>
        d &&
        typeof d.house === "string" &&
        d.house.length > 0 &&
        typeof d.name === "string" &&
        d.name.length > 0 &&
        // Don't recommend the same fragrance as a dupe of itself
        !(
          d.house.toLowerCase() === fragrance.house.toLowerCase() &&
          d.name.toLowerCase() === fragrance.name.toLowerCase()
        ) &&
        (typeof d.confidence !== "number" || d.confidence >= 0.4),
    )
    .slice(0, 5)
    .map<DupeRecommendation>((d) => ({
      house: d.house,
      name: d.name,
      similarity: d.similarity,
      note: d.note,
      price_tier: d.price_tier,
      confidence: typeof d.confidence === "number" ? d.confidence : undefined,
      source: "ai",
      generated_at: now,
    }));
}

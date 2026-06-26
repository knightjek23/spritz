// AI-generated community consensus. Pro feature. Cached to DB after
// first generation.
//
// What this answers for the user: "What does the fragrance community
// actually think about this, and is it worth buying?"
//
// Cost: gpt-4o-mini ~ $0.0004 per call (~700 input + 500 output tokens).
//
// Anti-hallucination strategy (same shape as lib/ai-dupes.ts):
//   1. Pass full fragrance metadata so the model has real context
//   2. Constrain output to JSON schema (response_format)
//   3. Low temperature (0.3) for factual rather than creative output
//   4. Force the model to self-rate confidence
//   5. Tell the model explicitly to return empty/low-confidence rather
//      than invent praise/criticism for fragrances with no community signal
//
// The skill recommends pairing AI output with persistent provenance
// (Audit Trail pattern). We store generated_at + confidence so the UI
// can render a "Generated [date]" receipt and a "Limited community
// signal" caveat banner where appropriate.

import OpenAI from "openai";
import type { ConsensusRecord, Fragrance } from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

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

interface AiConsensusResult {
  summary: string;
  verdict: string;
  pros: string[];
  cons: string[];
  confidence: number;
}

/** Strip em dashes the model might slip through despite the prompt rule. */
function sanitize(s: string): string {
  return s.replace(/—/g, ", ").trim();
}

export async function generateConsensusWithAI(
  fragrance: Fragrance,
): Promise<ConsensusRecord | null> {
  const noteList = (notes: typeof fragrance.top_notes) =>
    notes.map((n) => n.name).join(", ") || "(none)";

  const userPrompt = `Generate a community consensus take on this fragrance:

Name: ${fragrance.name}
House: ${fragrance.house}
Year: ${fragrance.year ?? "unknown"}
Gender: ${fragrance.gender ?? "unknown"}
Perfumer: ${fragrance.perfumer ?? "uncredited"}
Family / accords: ${fragrance.family.join(", ") || "(unknown)"}

Top notes: ${noteList(fragrance.top_notes)}
Heart notes: ${noteList(fragrance.mid_notes)}
Base notes: ${noteList(fragrance.base_notes)}

What does the community say? Is it worth buying?`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 900,
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<AiConsensusResult>;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  // Reject malformed responses up front rather than poisoning the cache
  // with a half-filled record. Empty string fields, missing arrays, or
  // non-numeric confidence all bail out.
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
    generated_at: new Date().toISOString(),
  };
}

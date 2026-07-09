// Vision adapter — Layer 1 of the scan architecture (PRD §7).
// Reads brand + fragrance name from a bottle image.
// GPT-4o is the primary; Google Vision is the cost fallback.
// Q1 (Day 3 spike) decides the default.

import OpenAI from "openai";
import type { VisionProvider } from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

// OCR cost knobs. Defaults preserve current behavior (gpt-4o, auto detail).
// Reading two words off a label is likely a gpt-4o-mini + detail:"low" job
// (~10x cheaper per scan: "low" costs 85 input tokens flat vs high-detail
// tiling) — run the accuracy eval, then flip these in env:
//   SCAN_OCR_MODEL=gpt-4o-mini
//   SCAN_OCR_DETAIL=low
// The disambiguation pass below intentionally stays on full gpt-4o —
// comparing bottle shapes/caps/labels is exactly what high detail is for.
const OCR_MODEL = process.env.SCAN_OCR_MODEL ?? "gpt-4o";
const OCR_DETAIL = (["low", "high", "auto"] as const).includes(
  process.env.SCAN_OCR_DETAIL as "low" | "high" | "auto",
)
  ? (process.env.SCAN_OCR_DETAIL as "low" | "high" | "auto")
  : "auto";

export interface VisionRead {
  brand: string | null;
  name: string | null;
  confidence: number; // 0–1
  provider: VisionProvider;
  raw_text?: string;
}

const READ_PROMPT = `You are reading a perfume / cologne bottle label.
Return STRICT JSON with this shape: {"brand": string | null, "name": string | null, "confidence": number}.
- "brand" is the fashion/perfume house (e.g., "Tom Ford", "Dior", "Creed").
- "name" is the fragrance name (e.g., "Sauvage", "Aventus", "Tobacco Vanille").
- "confidence" is your subjective confidence in the read, 0.0 to 1.0.
- If the image is not a bottle, or you cannot read either field, set them to null and confidence to 0.
- Return ONLY the JSON. No prose.`;

export async function readBottleWithGPT4o(
  imageBase64: string,
): Promise<VisionRead> {
  const response = await openai.chat.completions.create({
    model: OCR_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: READ_PROMPT },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`,
              detail: OCR_DETAIL,
            },
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 200,
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(content);
    return {
      brand: parsed.brand ?? null,
      name: parsed.name ?? null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      provider: "gpt4o",
    };
  } catch {
    return { brand: null, name: null, confidence: 0, provider: "gpt4o" };
  }
}

// Google Vision adapter — TODO during Day 3 spike.
// Cheaper per call (~$0.0015 vs ~$0.01) but raw OCR text rather than structured.
// We'd post-process with a smaller LLM or rule-based brand/name extraction.
export async function readBottleWithGoogleVision(
  _imageBase64: string,
): Promise<VisionRead> {
  throw new Error(
    "readBottleWithGoogleVision: not implemented — Day 3 spike (Q1)",
  );
}

// =====================================================================
// Visual disambiguation pass — Layer 1b.
//
// Triggered when text OCR returns ambiguous candidates (top confidence
// below VISUAL_DISAMBIGUATION_THRESHOLD in /api/scan). Sends the user's
// photo and the top N candidate bottle images to GPT-4o, asks which is
// the best visual match. Picks up shape, color, cap style, and label
// layout signals that pure text OCR misses on minimalist or refractive
// bottles.
//
// Cost: ~$0.02–0.04 per call (one prompt + 1 + N image inputs). Only
// fires for ambiguous scans so most reads stay at the OCR-only cost.
// =====================================================================

export interface DisambiguateCandidate {
  /** Index in the original candidates array — used to map the choice back. */
  index: number;
  brand: string;
  name: string;
  bottleImageUrl: string;
}

export interface DisambiguateResult {
  /** Index of the chosen candidate, or null if none looked right. */
  matchIndex: number | null;
  confidence: number;
  reason: string;
}

const DISAMBIGUATE_PROMPT = `You are identifying a perfume bottle by visual comparison.

You will see N+1 images in order:
1. The FIRST image is a USER PHOTO of a bottle they want identified.
2. The remaining images are CATALOG REFERENCE BOTTLES, listed in the same order as the candidates below.

Candidates:
{{LIST}}

Compare the user photo against each reference. Consider bottle shape, glass color, cap style, label position, and any distinctive design elements (engravings, plaques, contours). Ignore lighting and angle differences.

Return STRICT JSON: {"match_index": <0-based integer> | null, "confidence": <0.0-1.0>, "reason": "<one sentence>"}
- match_index = 0 means the FIRST candidate listed, 1 = second, etc.
- match_index = null if none look like the user photo.
- confidence = your subjective 0-1 confidence in the match.
- reason = one short sentence about what visual feature drove the choice.
- Return ONLY the JSON, no prose.`;

export async function disambiguateByImage(
  userImageBase64: string,
  candidates: DisambiguateCandidate[],
): Promise<DisambiguateResult> {
  if (candidates.length === 0) {
    return { matchIndex: null, confidence: 0, reason: "no_candidates" };
  }

  // Build the candidate list for the prompt. Index in this list = the
  // value GPT will return for match_index, which is also the candidate's
  // position in the image array we send below.
  const candidateList = candidates
    .map((c, i) => `${i}. ${c.brand}: ${c.name}`)
    .join("\n");

  const prompt = DISAMBIGUATE_PROMPT.replace("{{LIST}}", candidateList);

  // Build content: prompt text → user image (always first) → each
  // candidate's bottle image in order. GPT-4o accepts URLs directly for
  // catalog images — no need to re-download server-side.
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [
    { type: "text", text: prompt },
    {
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${userImageBase64}` },
    },
  ];
  for (const c of candidates) {
    content.push({
      type: "image_url",
      image_url: { url: c.bottleImageUrl },
    });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" },
      max_tokens: 300,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    const idx =
      typeof parsed.match_index === "number" &&
      parsed.match_index >= 0 &&
      parsed.match_index < candidates.length
        ? parsed.match_index
        : null;

    return {
      matchIndex: idx,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
    };
  } catch (err) {
    // Disambiguation should never break a scan — if GPT errors or returns
    // unparseable JSON, fall through to the text-OCR result.
    console.warn(
      "[vision] disambiguateByImage failed:",
      err instanceof Error ? err.message : String(err),
    );
    return { matchIndex: null, confidence: 0, reason: "disambiguation_failed" };
  }
}

// Top-level dispatch. Default = GPT-4o until spike resolves Q1.
export async function readBottle(
  imageBase64: string,
  provider: VisionProvider = "gpt4o",
): Promise<VisionRead> {
  if (provider === "gpt4o") return readBottleWithGPT4o(imageBase64);
  return readBottleWithGoogleVision(imageBase64);
}

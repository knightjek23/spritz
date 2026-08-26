// Vision adapter — Layer 1 of the scan architecture (PRD §7, scan v2).
// Reads brand + fragrance name from a bottle image, and (rarely) breaks a
// tie between two near-identical catalog candidates by looking at them.
//
// Latency rules (SCAN_V2_DESIGN.md §2.2): every call has a hard timeout and
// at most one retry. The SDK defaults are a 10-minute timeout and 2
// retries, which is how one slow OpenAI response used to become three
// attempts inside the route's 45 s budget while the user stared at
// "Reading the label…".

import OpenAI from "openai";
import type { VisionProvider } from "./types";

// OCR cost/speed knobs. The model is env-driven so the eval harness
// (scripts/scan-eval.ts) can flip it without a deploy:
//   SCAN_OCR_MODEL=gpt-4.1-mini | gpt-5.4-mini | gpt-5-nano | gpt-4o
//   SCAN_OCR_DETAIL=low|high|auto      (auto → high at 1024 px, ~765 tokens)
//   SCAN_OCR_REASONING=none|minimal|low (gpt-5.x only; default none/minimal)
//   SCAN_OCR_TIMEOUT_MS=9000
// The tiebreaker stays on full gpt-4o — comparing caps and label layouts
// across images is exactly what high detail is for.
const OCR_MODEL = process.env.SCAN_OCR_MODEL ?? "gpt-4o";
const OCR_DETAIL = (["low", "high", "auto"] as const).includes(
  process.env.SCAN_OCR_DETAIL as "low" | "high" | "auto",
)
  ? (process.env.SCAN_OCR_DETAIL as "low" | "high" | "auto")
  : "auto";
const OCR_TIMEOUT_MS = parseInt(process.env.SCAN_OCR_TIMEOUT_MS ?? "9000", 10);
const TIEBREAK_MODEL = process.env.SCAN_TIEBREAK_MODEL ?? "gpt-4o";
const TIEBREAK_TIMEOUT_MS = parseInt(
  process.env.SCAN_TIEBREAK_TIMEOUT_MS ?? "6000",
  10,
);
// Hard cap on images sent to the tiebreaker. Each one is a separate
// remote fetch on OpenAI's side; three is the most we can afford inside
// the latency budget and it covers the real case (EDT vs EDP vs Elixir).
export const TIEBREAK_MAX_CANDIDATES = 3;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
  timeout: OCR_TIMEOUT_MS,
  maxRetries: 1,
});

// Reasoning-family models (gpt-5.x) reject `max_tokens` and `temperature`
// but accept `reasoning_effort`; for a two-word label read we want the
// reasoning budget at its floor. "none" exists on gpt-5.4+, "minimal" on
// gpt-5 / gpt-5-mini / gpt-5-nano.
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/i.test(model);
}

function reasoningEffortFor(model: string): "none" | "minimal" | "low" {
  const env = process.env.SCAN_OCR_REASONING;
  if (env === "none" || env === "minimal" || env === "low") return env;
  return /gpt-5\.[4-9]/i.test(model) ? "none" : "minimal";
}

export class VisionTimeoutError extends Error {
  constructor(stage: "ocr" | "tiebreak") {
    super(`vision ${stage} timed out`);
    this.name = "VisionTimeoutError";
  }
}

export function isVisionTimeout(err: unknown): boolean {
  return (
    err instanceof VisionTimeoutError ||
    err instanceof OpenAI.APIConnectionTimeoutError ||
    (err instanceof Error && /timed? ?out/i.test(err.message))
  );
}

export interface VisionRead {
  brand: string | null;
  name: string | null;
  confidence: number; // 0–1
  provider: VisionProvider;
  raw_text?: string;
  /** Token usage when the provider reports it (eval cost accounting). */
  usage?: { input: number; output: number };
}

const READ_PROMPT = `You are reading a perfume / cologne bottle label.
Return STRICT JSON with this shape: {"brand": string | null, "name": string | null, "confidence": number}.
- "brand" is the fashion/perfume house (e.g., "Tom Ford", "Dior", "Creed").
- "name" is the fragrance name (e.g., "Sauvage", "Aventus", "Tobacco Vanille").
- "confidence" is your subjective confidence in the read, 0.0 to 1.0.
- If the image is not a bottle, or you cannot read either field, set them to null and confidence to 0.
- Return ONLY the JSON. No prose.`;

export interface OcrOptions {
  /** Override SCAN_OCR_MODEL (used by scripts/scan-eval.ts). */
  model?: string;
  detail?: "low" | "high" | "auto";
}

export async function readBottleWithGPT4o(
  imageBase64: string,
  opts: OcrOptions = {},
): Promise<VisionRead> {
  const model = opts.model ?? OCR_MODEL;
  const detail = opts.detail ?? OCR_DETAIL;
  const reasoning = isReasoningModel(model);
  let response: OpenAI.Chat.Completions.ChatCompletion;
  try {
    response = await openai.chat.completions.create(
      {
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: READ_PROMPT },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail,
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
        // 120 tokens is ~3x the longest plausible {"brand","name","confidence"}.
        ...(reasoning
          ? {
              max_completion_tokens: 120,
              // "none" (gpt-5.4+) postdates this SDK's ReasoningEffort union;
              // the API accepts it, so widen the type rather than pin the SDK.
              reasoning_effort: reasoningEffortFor(
                model,
              ) as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParams["reasoning_effort"],
            }
          : { max_tokens: 120 }),
      },
      { timeout: OCR_TIMEOUT_MS },
    );
  } catch (err) {
    if (isVisionTimeout(err)) throw new VisionTimeoutError("ocr");
    throw err;
  }

  const content = response.choices[0]?.message?.content ?? "{}";
  const usage = response.usage
    ? { input: response.usage.prompt_tokens, output: response.usage.completion_tokens }
    : undefined;
  try {
    const parsed = JSON.parse(content);
    return {
      brand: parsed.brand ?? null,
      name: parsed.name ?? null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      provider: "gpt4o",
      usage,
    };
  } catch {
    return { brand: null, name: null, confidence: 0, provider: "gpt4o", usage };
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
// Visual tiebreaker — scan v2 §4.4 rule 4.
//
// Used to be the only visual signal ("Layer 1b", fired on any ambiguous
// text read, 1 + 5 images, 4–8 s). The bottle-embedding index in
// lib/image-embed.ts now carries the shape/color signal on every scan;
// this pass is reserved for the case embeddings can't settle: the fused
// top-2 are within a hair of each other AND from the same house (EDT vs
// EDP vs Elixir in near-identical glass). ≤3 candidate images, 6 s cap.
//
// Cost: ~$0.02 per call. Fires on a small fraction of scans.
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
  // Callers should already respect the cap; enforce it here so a future
  // caller can't quietly send ten images through the slowest step we have.
  candidates = candidates.slice(0, TIEBREAK_MAX_CANDIDATES);

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
    const response = await openai.chat.completions.create(
      {
        model: TIEBREAK_MODEL,
        messages: [{ role: "user", content }],
        response_format: { type: "json_object" },
        max_tokens: 200,
      },
      { timeout: TIEBREAK_TIMEOUT_MS },
    );

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
  opts: OcrOptions = {},
): Promise<VisionRead> {
  if (provider === "gpt4o") return readBottleWithGPT4o(imageBase64, opts);
  return readBottleWithGoogleVision(imageBase64);
}

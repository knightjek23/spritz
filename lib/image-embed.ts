// Bottle image embeddings — the visual layer of scan v2 (SCAN_V2_DESIGN.md §4).
//
// One vector per image, cosine kNN in pgvector (bottle_image_embeddings,
// migration 0023). At scan time we embed the user photo ONCE, in parallel
// with OCR, and ask the index for the closest catalog bottles. It runs on
// every scan (unlike the old GPT-4o "look at 6 pictures" step) and it still
// works when the label is unreadable.
//
// Provider: Voyage `voyage-multimodal-3.5` over plain fetch — no SDK dep.
// $0.60 per billion pixels with a 150 B-pixel free tier; a 1024×768 scan
// photo is ~$0.0005. Swap providers by editing this file and re-running
// `pnpm embed:images` in scraper/ (the `model` column on the table is what
// makes that a re-run, not a migration).
//
// The scraper package keeps its own copy of the request shape in
// scraper/src/embed-bottle-images.ts — it's a separate ESM package and
// can't import from here (see the image-clean.ts precedent).
//
// Env:
//   SCAN_VISUAL_PROVIDER   "voyage" (default when VOYAGE_API_KEY is set) | "off"
//   VOYAGE_API_KEY         `al-…` (MongoDB Atlas model key) or `pa-…` (Voyage dashboard)
//   VOYAGE_BASE_URL        optional override; auto-picked from the key prefix
//   SCAN_EMBED_MODEL       default "voyage-multimodal-3.5"
//   SCAN_EMBED_TIMEOUT_MS  default 6000

export const EMBED_MODEL = process.env.SCAN_EMBED_MODEL ?? "voyage-multimodal-3.5";
export const EMBED_DIMENSIONS = 1024;

const TIMEOUT_MS = parseInt(process.env.SCAN_EMBED_TIMEOUT_MS ?? "6000", 10);

// Two key families, two hosts. Keys minted in MongoDB Atlas ("Model API
// Keys", prefix `al-`) route to ai.mongodb.com; keys from the original
// Voyage dashboard (prefix `pa-`) route to api.voyageai.com. Same paths,
// same request shape. Override with VOYAGE_BASE_URL if either changes.
function voyageUrl(): string {
  const base =
    process.env.VOYAGE_BASE_URL ??
    ((process.env.VOYAGE_API_KEY ?? "").startsWith("al-")
      ? "https://ai.mongodb.com/v1"
      : "https://api.voyageai.com/v1");
  return `${base.replace(/\/$/, "")}/multimodalembeddings`;
}

export type VisualProvider = "voyage";

export function visualProvider(): VisualProvider | null {
  const flag = process.env.SCAN_VISUAL_PROVIDER;
  if (flag === "off") return null;
  if (!process.env.VOYAGE_API_KEY) return null;
  return "voyage";
}

export interface ImageEmbedding {
  vector: number[];
  model: string;
  provider: VisualProvider;
}

/**
 * Embed a single image (base64, no data: prefix). Resolves null on any
 * failure — the visual layer must never break a scan, the route treats
 * null as "no visual signal this time".
 */
export async function embedImage(
  imageBase64: string,
  opts: { inputType?: "query" | "document"; mime?: string } = {},
): Promise<ImageEmbedding | null> {
  const provider = visualProvider();
  if (!provider) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(voyageUrl(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input_type: opts.inputType ?? "query",
        output_dimension: EMBED_DIMENSIONS,
        inputs: [
          {
            content: [
              {
                type: "image_base64",
                image_base64: `data:${opts.mime ?? "image/jpeg"};base64,${imageBase64}`,
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      console.warn(`[image-embed] ${provider} HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const vector = json.data?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length !== EMBED_DIMENSIONS) {
      console.warn("[image-embed] unexpected response shape");
      return null;
    }
    return { vector, model: EMBED_MODEL, provider };
  } catch (err) {
    console.warn(
      "[image-embed] failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Score shaping for fusion (SCAN_V2_DESIGN.md §4.4).
//
// Raw cosine similarities from Voyage cluster in a narrow, high band.
// Measured on the catalog 2026-08-26 (300 random bottles vs their nearest
// DIFFERENT bottle): p50 0.817, p90 0.944, p99 1.000 (duplicate product
// photos). So "as similar as a typical wrong bottle" is the floor (→ 0)
// and 0.96 is the ceiling (→ 1). Both ends are env knobs; re-fit from
// scan_events.candidates once real scans have accumulated.
// ---------------------------------------------------------------------------

const VISUAL_FLOOR = parseFloat(process.env.SCAN_VISUAL_FLOOR ?? "0.82");
const VISUAL_CEIL = parseFloat(process.env.SCAN_VISUAL_CEIL ?? "0.96");

export function normalizeVisual(cosine: number): number {
  const span = Math.max(VISUAL_CEIL - VISUAL_FLOOR, 0.01);
  const v = (cosine - VISUAL_FLOOR) / span;
  return Math.min(1, Math.max(0, v));
}

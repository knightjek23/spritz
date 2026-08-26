// Web visual lookup — scan v2 Phase 3 (SCAN_V2_DESIGN.md §5).
//
// Last resort when neither the label nor the bottle-embedding index could
// place a bottle: hand the photo to Google Lens (via SerpApi) and read the
// page titles it comes back with. Titles from retailers and Fragrantica
// almost always contain "<House> <Name> <concentration>", which is exactly
// what search_fragrances wants.
//
// OFF BY DEFAULT. This sends the user's photo to a third party, so it is
// gated three ways: SCAN_WEB_FALLBACK=true, signed-in users only (decided
// in the route), and its own daily budget (SCAN_WEB_DAILY_BUDGET, counted
// from scan_events.web_lookup). The privacy policy names the provider.
//
// Mechanics: SerpApi's google_lens engine needs a fetchable image URL, so
// the photo is uploaded to the private `scan-images` bucket, a short-lived
// signed URL is handed to SerpApi, and the object is deleted right after
// unless SCAN_WEB_KEEP_IMAGE=true (30-day retention per the privacy policy
// is the ceiling either way — add a lifecycle rule on the bucket).
//
// One-time setup: Storage -> New bucket -> "scan-images" -> Private.
//
// Env:
//   SCAN_WEB_FALLBACK        "true" to enable
//   SERPAPI_API_KEY
//   SCAN_WEB_DAILY_BUDGET    default 100
//   SCAN_WEB_TIMEOUT_MS      default 8000
//   SCAN_WEB_KEEP_IMAGE      "true" to leave the photo in the bucket

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

export const SCAN_IMAGE_BUCKET = "scan-images";
const SERPAPI_URL = "https://serpapi.com/search.json";
const TIMEOUT_MS = parseInt(process.env.SCAN_WEB_TIMEOUT_MS ?? "8000", 10);
export const WEB_DAILY_BUDGET = parseInt(
  process.env.SCAN_WEB_DAILY_BUDGET ?? "100",
  10,
);

export function webLookupEnabled(): boolean {
  return (
    process.env.SCAN_WEB_FALLBACK === "true" && !!process.env.SERPAPI_API_KEY
  );
}

export interface WebLookup {
  /** Page titles from visual/exact matches, best first, deduped. */
  titles: string[];
  /** Knowledge-graph title when Lens recognised the product outright. */
  entity: string | null;
}

interface LensResponse {
  knowledge_graph?: { title?: string } | Array<{ title?: string }>;
  exact_matches?: Array<{ title?: string }>;
  visual_matches?: Array<{ title?: string }>;
  error?: string;
}

function collectTitles(res: LensResponse): WebLookup {
  const kg = Array.isArray(res.knowledge_graph)
    ? res.knowledge_graph[0]?.title
    : res.knowledge_graph?.title;
  const raw = [
    ...(res.exact_matches ?? []).map((m) => m.title),
    ...(res.visual_matches ?? []).map((m) => m.title),
  ];
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const t of raw) {
    const clean = (t ?? "").replace(/\s+/g, " ").trim();
    if (clean.length < 4) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push(clean);
    if (titles.length >= 12) break;
  }
  return { titles, entity: kg?.trim() || null };
}

/**
 * Upload the photo, run Lens, clean up. Resolves null on any failure —
 * the route treats null as "the web didn't know either".
 */
export async function lookupBottleOnWeb(
  supabase: SupabaseClient<Database>,
  imageBase64: string,
  scanEventId: string,
): Promise<WebLookup | null> {
  if (!webLookupEnabled()) return null;

  const path = `${scanEventId}.jpg`;
  const bytes = Buffer.from(imageBase64, "base64");
  const { error: upErr } = await supabase.storage
    .from(SCAN_IMAGE_BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (upErr) {
    console.warn("[web-lookup] upload failed:", upErr.message);
    return null;
  }

  try {
    const { data: signed, error: signErr } = await supabase.storage
      .from(SCAN_IMAGE_BUCKET)
      .createSignedUrl(path, 600);
    if (signErr || !signed?.signedUrl) {
      console.warn("[web-lookup] sign failed:", signErr?.message);
      return null;
    }

    const params = new URLSearchParams({
      engine: "google_lens",
      url: signed.signedUrl,
      hl: "en",
      country: "us",
      api_key: process.env.SERPAPI_API_KEY ?? "",
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${SERPAPI_URL}?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        console.warn(`[web-lookup] serpapi HTTP ${res.status}`);
        return null;
      }
      const json = (await res.json()) as LensResponse;
      if (json.error) {
        console.warn("[web-lookup] serpapi error:", json.error);
        return null;
      }
      return collectTitles(json);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.warn(
      "[web-lookup] failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  } finally {
    if (process.env.SCAN_WEB_KEEP_IMAGE !== "true") {
      // Best effort. A leftover object is caught by the bucket lifecycle rule.
      void supabase.storage.from(SCAN_IMAGE_BUCKET).remove([path]);
    }
  }
}

// ---------------------------------------------------------------------------
// Turning titles into a (brand, name) guess.
//
// Retail titles look like "Dior Sauvage Elixir Parfum Spray 2 oz" or
// "Sauvage Eau de Parfum by Christian Dior | FragranceNet". We don't try
// to be clever here: the route runs the top titles through
// search_fragrances (trigram, house-weighted), which is far more forgiving
// than any regex. This helper only strips the obvious retail noise so the
// trigram sees fragrance words, not "oz" and "Free Shipping".
// ---------------------------------------------------------------------------

const NOISE =
  /\b(\d+(\.\d+)?\s?(oz|ml|fl)\b.*|spray|for (men|women)|men'?s|women'?s|unisex|free shipping|sale|buy|price|review|reviews|amazon\.com|ebay|walmart|sephora|ulta|fragrancenet|fragrancex|notino|jomashop|macy'?s|nordstrom|perfume|cologne|fragrance)\b/gi;

export function cleanTitle(title: string): string {
  return title
    .split(/\s[|:–\-]\s/)[0]
    .replace(NOISE, " ")
    .replace(/[^\p{L}\p{N}'’&.\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

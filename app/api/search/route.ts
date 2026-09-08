// GET /api/search?q=<query>
// Manual search fallback (PRD §6 P0.6). Trigram fuzzy match across name +
// house, plus keyword search: when every word in the query is a known
// note or family ("musk, iris, citrus"), the response also carries the
// most popular fragrances matching those terms (lib/search-terms.ts,
// migration 0029). Both run in parallel; the UI shows the keyword section
// above the name matches when it is present.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIpThrottle, clientIp } from "@/lib/rate-limit";
import {
  findByTerms,
  resolveKeywordQuery,
  type KeywordHit,
  type SearchHit,
  type SearchResponse,
} from "@/lib/search-terms";

export const runtime = "nodejs";

// Results are anonymous and deterministic per query, so let the CDN absorb
// repeats ("sauvage" gets typed thousands of times).
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

// The typeahead shows a handful per section; /search asks for the full
// list with ?full=1.
const NAME_LIMIT = 20;
const TERMS_LIMIT_DROPDOWN = 8;
const TERMS_LIMIT_FULL = 40;

export async function GET(req: Request) {
  // Best-effort per-instance throttle: trigram search is a real DB scan and
  // this endpoint is public. 120/min per IP is far above any typing rate.
  if (!checkIpThrottle(`search:${clientIp(req)}`, 120)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const full = url.searchParams.get("full") === "1";
  if (q.length < 2) {
    const empty: SearchResponse = { results: [], terms: null, byTerms: [] };
    return NextResponse.json(empty, { headers: CACHE_HEADERS });
  }

  const supabase = createAdminClient();

  // Same trigram matching as the scan endpoint, but the lite column list —
  // the UI renders 6 fields, so don't ship the full row per keystroke.
  const namesPromise = supabase
    .rpc("search_fragrances_lite", { p_brand: q, p_name: q, p_limit: NAME_LIMIT })
    .returns<SearchHit[]>();

  // Keyword resolution is in-memory after the first call (catalog note
  // list cached for an hour), so this costs one extra RPC only when the
  // query actually is a keyword query.
  const termsPromise = (async () => {
    try {
      const resolution = await resolveKeywordQuery(q, supabase);
      if (!resolution) return { terms: null, byTerms: [] as KeywordHit[] };
      const byTerms = await findByTerms(
        supabase,
        resolution,
        full ? TERMS_LIMIT_FULL : TERMS_LIMIT_DROPDOWN,
      );
      return { terms: resolution.terms, byTerms };
    } catch {
      // Keyword search is additive; never let it take the name search down.
      return { terms: null, byTerms: [] as KeywordHit[] };
    }
  })();

  const [{ data, error }, keyword] = await Promise.all([namesPromise, termsPromise]);

  if (error) {
    return NextResponse.json({ error: "search_failed" }, { status: 500 });
  }

  const body: SearchResponse = {
    results: data ?? [],
    terms: keyword.terms,
    byTerms: keyword.byTerms,
  };
  return NextResponse.json(body, { headers: CACHE_HEADERS });
}

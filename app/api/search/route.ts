// GET /api/search?q=<query>
// Manual search fallback (PRD §6 P0.6). Trigram fuzzy match across name + house.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIpThrottle, clientIp } from "@/lib/rate-limit";

// The lite RPC returns exactly what the typeahead + results list render.
// (The full-row search_fragrances RPC is still used by /api/scan.)
interface SearchHit {
  id: string;
  name: string;
  house: string;
  family: string[] | null;
  year: number | null;
  bottle_image_url: string | null;
  match_score: number;
}

export const runtime = "nodejs";

// Results are anonymous and deterministic per query, so let the CDN absorb
// repeats ("sauvage" gets typed thousands of times).
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

export async function GET(req: Request) {
  // Best-effort per-instance throttle: trigram search is a real DB scan and
  // this endpoint is public. 120/min per IP is far above any typing rate.
  if (!checkIpThrottle(`search:${clientIp(req)}`, 120)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] }, { headers: CACHE_HEADERS });
  }

  const supabase = createAdminClient();

  // Same trigram matching as the scan endpoint, but the lite column list —
  // the UI renders 6 fields, so don't ship the full row per keystroke.
  const { data, error } = await supabase
    .rpc("search_fragrances_lite", { p_brand: q, p_name: q, p_limit: 20 })
    .returns<SearchHit[]>();

  if (error) {
    return NextResponse.json({ error: "search_failed" }, { status: 500 });
  }

  return NextResponse.json({ results: data ?? [] }, { headers: CACHE_HEADERS });
}

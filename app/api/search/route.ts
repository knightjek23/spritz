// GET /api/search?q=<query>
// Manual search fallback (PRD §6 P0.6). Trigram fuzzy match across name + house.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Fragrance } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const supabase = createAdminClient();

  // Use the same RPC the scan endpoint uses so OCR-style matching and manual
  // search behave identically. For free-text we pass the whole query as both.
  const { data, error } = await supabase
    .rpc("search_fragrances", { p_brand: q, p_name: q, p_limit: 20 })
    .returns<Array<Fragrance & { match_score: number }>>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ results: data ?? [] });
}

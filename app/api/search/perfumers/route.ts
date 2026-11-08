// GET /api/search/perfumers?q=<query>
//
// Perfumer rows for the search typeahead, Pro only. Kept out of
// /api/search on purpose: that response is CDN-cached publicly per query,
// so anything per-user in it would be served to the next person who typed
// the same thing. This one is private and never cached.
//
// Free and signed-out users get an empty list (200, not 402) so the
// typeahead simply shows no perfumer section rather than an error.

import { NextResponse } from "next/server";
import { isProUser } from "@/lib/entitlement";
import { findPerfumers, type PerfumerHit } from "@/lib/search-perfumers";
import { checkIpThrottle, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: Request) {
  if (!checkIpThrottle(`search-perfumers:${clientIp(req)}`, 120)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: NO_STORE });
  }
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || !(await isProUser())) {
    return NextResponse.json({ perfumers: [] as PerfumerHit[] }, { headers: NO_STORE });
  }
  const perfumers = await findPerfumers(q);
  return NextResponse.json({ perfumers }, { headers: NO_STORE });
}

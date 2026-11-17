// GET /api/buy/[id]            -> constructed FragranceNet link
// GET /api/buy/[id]?retailer=X  -> that retailer's feed offer (fragrance_offers)
// 302s to the retailer. PRD §6 P0.7: every Buy CTA routes through here.
//
// This route no longer logs the click. It used to, and that counted every
// request: a crawler ignoring robots.txt walked the catalog and "clicked
// Buy" on 1,918 fragrances on 2026-11-01 (and ~800 more on Nov 5-6),
// against 85 real people on fragrance pages that fortnight. Taps are now
// logged by the page itself (lib/buy-tap.ts -> POST /api/buy/[id]/click),
// which a link-following bot never runs.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBuyTarget } from "@/lib/buy-target";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createAdminClient();
  const { data: f, error } = await supabase
    .from("fragrances")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (error || !f) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { url } = await resolveBuyTarget(
    supabase,
    f,
    new URL(req.url).searchParams.get("retailer"),
  );
  return NextResponse.redirect(url, 302);
}

// GET /api/buy/[id]
// Logs an affiliate click and 302s to the retailer.
// PRD §6 P0.7 — every Buy CTA routes through here so we get attribution.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAffiliateUrl } from "@/lib/affiliate";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createAdminClient();
  const { data: f, error } = await supabase
    .from("fragrances")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (error || !f) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { url, retailer } = buildAffiliateUrl(f);

  // Log the click (best-effort; don't block the redirect).
  const { userId: clerkUserId } = auth();
  let appUserId: string | null = null;
  if (clerkUserId) {
    const { data: u } = await supabase
      .from("users")
      .select("id")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();
    appUserId = u?.id ?? null;
  }
  supabase
    .from("affiliate_clicks")
    .insert({ user_id: appUserId, fragrance_id: f.id, retailer })
    .then(() => undefined);

  return NextResponse.redirect(url, 302);
}

// GET /api/buy/[id]            -> constructed FragranceNet link
// GET /api/buy/[id]?retailer=X  -> that retailer's feed offer (fragrance_offers)
// Logs an affiliate click and 302s to the retailer.
// PRD §6 P0.7 — every Buy CTA routes through here so we get attribution.
// Feed offers used to link straight out, which skipped this log entirely.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAffiliateUrl, normalizeOfferUrl, retailerSlug } from "@/lib/affiliate";

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

  // A feed offer when the CTA asked for one and it still exists; otherwise
  // the constructed link, so a stale offer never dead-ends the user.
  let url: string | null = null;
  let retailer: string | null = null;
  const offerRetailer = new URL(req.url).searchParams.get("retailer");
  if (offerRetailer) {
    const { data: offer } = await supabase
      .from("fragrance_offers")
      .select("retailer, product_url")
      .eq("fragrance_id", f.id)
      .eq("retailer", offerRetailer)
      .maybeSingle();
    if (offer?.product_url) {
      retailer = retailerSlug(offer.retailer);
      // FragranceNet feed URLs are legacy paths that FragranceNet 301s to
      // its current product URL, and that redirect strips impact.com's
      // im_ref click id, so the sale isn't credited. Tested 2026-10-29:
      // only the text-search landing keeps im_ref. Use the same verified
      // search deeplink as the main Buy CTA for FragranceNet offers.
      url =
        retailer === "fragrancenet"
          ? buildAffiliateUrl(f).url
          : normalizeOfferUrl(offer.product_url, offer.retailer);
    }
  }
  if (!url || !retailer) {
    const built = buildAffiliateUrl(f);
    url = built.url;
    retailer = built.retailer;
  }

  // Log the click. Awaited: on Vercel a fire-and-forget promise can be cut
  // off when the function returns, silently dropping the row. A failed
  // insert is logged but never blocks the redirect.
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
  const { error: clickErr } = await supabase
    .from("affiliate_clicks")
    .insert({ user_id: appUserId, fragrance_id: f.id, retailer });
  if (clickErr) console.warn("[buy] click log failed:", clickErr.message);

  return NextResponse.redirect(url, 302);
}

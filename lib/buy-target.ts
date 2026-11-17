// Where a Buy tap goes, and which retailer it counts against.
//
// Shared by the redirect (GET /api/buy/[id]) and the tap logger
// (POST /api/buy/[id]/click) so the retailer recorded for a tap is always
// the retailer the person was actually sent to. Server-only.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { buildAffiliateUrl, normalizeOfferUrl, retailerSlug } from "@/lib/affiliate";
import type { Fragrance } from "@/lib/types";

export async function resolveBuyTarget(
  supabase: SupabaseClient<Database>,
  f: Fragrance,
  offerRetailer: string | null,
): Promise<{ url: string; retailer: string }> {
  // A feed offer when the CTA asked for one and it still exists; otherwise
  // the constructed link, so a stale offer never dead-ends the user.
  if (offerRetailer) {
    const { data: offer } = await supabase
      .from("fragrance_offers")
      .select("retailer, product_url")
      .eq("fragrance_id", f.id)
      .eq("retailer", offerRetailer)
      .maybeSingle();
    if (offer?.product_url) {
      const retailer = retailerSlug(offer.retailer);
      // FragranceNet feed URLs are legacy paths that FragranceNet 301s to
      // its current product URL, and that redirect strips impact.com's
      // im_ref click id, so the sale isn't credited. Tested 2026-10-29:
      // only the text-search landing keeps im_ref. Use the same verified
      // search deeplink as the main Buy CTA for FragranceNet offers.
      const url =
        retailer === "fragrancenet"
          ? buildAffiliateUrl(f).url
          : normalizeOfferUrl(offer.product_url, offer.retailer);
      return { url, retailer };
    }
  }
  const built = buildAffiliateUrl(f);
  return { url: built.url, retailer: built.retailer };
}

// Affiliate link builder.
//
// Current state: every Buy CTA routes to FragranceNet's direct product
// page for that fragrance (constructed from house + name slugs). When
// the product URL doesn't exist on their catalog, FragranceNet's own
// server-side redirect sends the user to their in-site search — so
// dead-URL misses degrade gracefully to a search page instead of a 404.
//
// Multi-retailer routing (Scentbird for niche subscription, Nordstrom
// for designer) is scaffolded in pickRetailer() but disabled for now.
// Route back to it when we have real inventory + commission data per
// retailer.
//
// Affiliate tracking: FragranceNet uses Rakuten Advertising. When
// FRAGRANCENET_RAKUTEN_PUBLISHER_ID and FRAGRANCENET_RAKUTEN_MERCHANT_ID
// are both set, we wrap the destination URL in a Rakuten deeplink so
// clicks are attributed to Josh's affiliate account. Without those env
// vars, we link directly (no attribution but no broken flow either).

import type { Fragrance, Retailer } from "./types";

const FRAGRANCENET_RAKUTEN_PUBLISHER =
  process.env.FRAGRANCENET_RAKUTEN_PUBLISHER_ID ?? "";
const FRAGRANCENET_RAKUTEN_MERCHANT =
  process.env.FRAGRANCENET_RAKUTEN_MERCHANT_ID ?? "";

/**
 * FragranceNet URL slug rules (observed from their live catalog):
 *   - lowercase everything
 *   - strip diacritics (piña → pina)
 *   - "&" → "and"
 *   - apostrophes stripped, not hyphenated (L'Homme → lhomme)
 *   - every other non-alphanumeric run → single hyphen
 *   - trim leading/trailing hyphens
 */
export function fragranceNetSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accent marks
    .replace(/&/g, "and")
    .replace(/[''`]/g, "") // apostrophes drop out
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Which retailer wins for a given fragrance. Currently always
 * FragranceNet; kept as a function so the routing decision has a
 * single home when we add per-tier retailers back.
 */
export function pickRetailer(_f: Fragrance): Retailer {
  return "fragrancenet";
}

/**
 * Build the destination URL for the Buy CTA. Routes through
 * FragranceNet's own search page with "house name" as the query.
 *
 * URL scheme (verified against live site, 2026):
 *   https://www.fragrancenet.com/fn/search/{url-encoded-query}
 *
 * Path-based search, not a query param. Encoded via encodeURIComponent
 * so spaces become %20 and apostrophes/accents don't break the URL.
 *
 * Why search instead of direct product URLs:
 *   The direct product-URL pattern
 *   (/fn/fragrances/{brand}/{brand}-{name}) works for maybe 60-70% of
 *   the catalog. The rest need unpredictable suffixes (-cologne, -edp,
 *   -perfume) or drop the brand-repeat when the name IS the brand
 *   (e.g. Juliette Has a Gun / Juliette). Those cases 404 to a hard
 *   "EAU MY!" page with no soft fallback. Search always lands on
 *   valid results and the top result is nearly always the intended
 *   product, so users get one extra click but zero dead ends.
 *
 * Wraps in a Rakuten affiliate deeplink when the publisher + merchant
 * env vars are set; links directly otherwise.
 */
export function buildAffiliateUrl(f: Fragrance): {
  url: string;
  retailer: Retailer;
} {
  const retailer = pickRetailer(f);

  const query = encodeURIComponent(`${f.house} ${f.name}`);
  const searchUrl = `https://www.fragrancenet.com/fn/search/${query}`;

  // Rakuten affiliate wrapping — only when both IDs configured.
  // Format: https://click.linksynergy.com/deeplink?id=<pub>&mid=<merchant>&murl=<encoded target>
  if (FRAGRANCENET_RAKUTEN_PUBLISHER && FRAGRANCENET_RAKUTEN_MERCHANT) {
    const wrapped =
      `https://click.linksynergy.com/deeplink?id=${encodeURIComponent(
        FRAGRANCENET_RAKUTEN_PUBLISHER,
      )}&mid=${encodeURIComponent(FRAGRANCENET_RAKUTEN_MERCHANT)}` +
      `&murl=${encodeURIComponent(searchUrl)}`;
    return { url: wrapped, retailer };
  }

  return { url: searchUrl, retailer };
}

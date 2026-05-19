// Affiliate link builder — PRD §6 P0.7.
// Pick the best retailer per fragrance based on availability + commission.
// Stub: just rotate based on price tier for now. Day 10 will integrate real affiliate APIs.

import type { Fragrance, Retailer } from "./types";

const SCENTBIRD = process.env.SCENTBIRD_AFFILIATE_ID ?? "";
const FRAGRANCENET = process.env.FRAGRANCENET_AFFILIATE_ID ?? "";
const NORDSTROM = process.env.NORDSTROM_AFFILIATE_ID ?? "";

export function pickRetailer(f: Fragrance): Retailer {
  // Heuristic until we have inventory APIs:
  // - niche → Scentbird (subscription model fits high-priced niche)
  // - designer → Nordstrom
  // - mid / budget → FragranceNet (deepest discounts)
  if (f.price_tier === "niche") return "scentbird";
  if (f.price_tier === "designer") return "nordstrom";
  return "fragrancenet";
}

export function buildAffiliateUrl(f: Fragrance): { url: string; retailer: Retailer } {
  const retailer = pickRetailer(f);
  const query = encodeURIComponent(`${f.house} ${f.name}`);

  switch (retailer) {
    case "scentbird":
      return {
        retailer,
        url: `https://www.scentbird.com/perfume/search?q=${query}&aff=${SCENTBIRD}`,
      };
    case "fragrancenet":
      return {
        retailer,
        url: `https://www.fragrancenet.com/search?q=${query}&aff=${FRAGRANCENET}`,
      };
    case "nordstrom":
      return {
        retailer,
        url: `https://www.nordstrom.com/sr?keyword=${query}&aff=${NORDSTROM}`,
      };
  }
}

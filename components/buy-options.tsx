"use client";

// The "Buy this fragrance" CTA.
//
// Behaviour follows the Figma frame (node 193-44):
//   - One retailer  -> the solid button links straight out. No extra tap.
//   - Several       -> tapping the solid button REPLACES it in place with a
//                      stacked list of outlined options, each showing the
//                      retailer and its price.
//
// The list replaces the button rather than opening a dropdown overlay, so
// nothing floats above the page and the layout stays predictable on mobile.
//
// Offers are sorted cheapest-first by the server query. Prices come from
// affiliate feeds and go stale between refreshes, so they're framed as
// indicative and the retailer's own page stays authoritative.

import { useState } from "react";

export interface BuyOffer {
  retailer: string;
  productUrl: string;
  price: number | null;
  currency: string;
}

function formatPrice(price: number | null, currency: string): string {
  if (price == null) return "See price";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      // Whole dollars unless the cents matter.
      minimumFractionDigits: Number.isInteger(price) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `$${price}`;
  }
}

export function BuyOptions({
  offers,
  /** Used when there are no feed offers at all — the legacy constructed
   *  affiliate link, so the CTA never disappears. */
  fallbackUrl,
}: {
  offers: BuyOffer[];
  fallbackUrl?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  // No offers and no fallback: render nothing rather than a dead button.
  if (offers.length === 0 && !fallbackUrl) return null;

  // Single destination (one offer, or none plus the fallback): straight out.
  if (offers.length <= 1) {
    const href = offers[0]?.productUrl ?? fallbackUrl!;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className="block w-full text-center bg-emerald text-cream py-3 rounded-md font-medium hover:bg-emerald/90 transition"
      >
        Buy this fragrance
      </a>
    );
  }

  // Several retailers: solid button until tapped, then the option list.
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-expanded={false}
        className="block w-full text-center bg-emerald text-cream py-3 rounded-md font-medium hover:bg-emerald/90 transition"
      >
        Buy this fragrance
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {offers.map((o) => (
          <li key={o.retailer}>
            <a
              href={o.productUrl}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="flex w-full items-center justify-center gap-2 border border-emerald text-ink py-3 rounded-md hover:bg-emerald/5 transition"
            >
              <span className="font-medium">{o.retailer}</span>
              <span className="text-slate">
                ({formatPrice(o.price, o.currency)})
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className="text-center font-mono text-[10px] uppercase tracking-widest text-slate">
        Prices update periodically. Check the retailer for the current price.
      </p>
    </div>
  );
}

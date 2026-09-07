"use client";

// BottleImage — the single bottle-thumbnail primitive for every card
// surface (trending rows, popular-by-house, family/house scrollers).
//
// Why this exists: next/image has no built-in failure state. When a
// bottle_image_url 404s (dead fimgs.net link, mirrored file missing),
// the browser falls back to rendering the alt text as raw text inside
// the card — which is how "Yves Saint Laurent Libre" ended up spilling
// across a thumbnail instead of showing a graceful placeholder.
//
// Three cases, one component:
//   1. no URL          → house initials
//   2. URL that 404s   → house initials (via onError)
//   3. known placeholder graphic (Fragrantica's "image coming soon")
//      → house initials, without the network round-trip
//
// Initials are word-based (Yves Saint Laurent → YSL, Maison Francis
// Kurkdjian → MFK) rather than the old house.slice(0,2), which produced
// the meaningless "YV" seen on the Myslf card.

import { useState } from "react";
import Image from "next/image";
import { cleanBottleImageUrl } from "@/lib/bottle-image";
import { BottlePlaceholder, houseInitials } from "@/components/bottle-placeholder";

// Re-exported for callers that already imported it from here.
export { houseInitials };

// Hosts that must be fetched by the visitor's browser rather than by Vercel's
// image optimizer.
//
// 2026-09-07: FragranceNet and FragranceShop return 403 to the optimizer's
// fetch (Vercel datacenter IPs), so /_next/image answered 502
// OPTIMIZED_EXTERNAL_IMAGE_REQUEST_UNAUTHORIZED and ~40% of the catalog
// rendered as house initials. Nothing was wrong with the URLs or the DB: the
// same images returned 200 to a real browser on a residential connection,
// which is why scraper/src/audit-bottle-images.ts reported them all healthy.
// That script runs on a laptop, so it can never see this failure mode.
//
// unoptimized makes next/image emit the raw src, so the request comes from the
// visitor's own IP carrying the app's referer. That is the exact request these
// hosts already answer with a 200. Cost is no WebP/resize on these rows, which
// is close to nothing here: FragranceNet serves 250x250 and we display at 256.
//
// A visitor behind a VPN, corporate proxy, or datacenter IP range may still be
// refused. That falls through to onError below and shows the placeholder,
// which is the same thing they see today.
//
// Hotlinking is also the licensed behaviour: Rakuten's publisher agreement
// grants "use without modification", and FragranceNet's own terms require
// written permission to reproduce. Mirroring these to our own storage needs
// that permission first. See AFFILIATE_IMAGE_PLAYBOOK.md.
//
// ADD A HOSTNAME HERE when a retailer starts 502-ing. The tell is
// /_next/image returning 502 while the bare image URL loads fine in a tab.
const DIRECT_FETCH_HOSTS = new Set([
  "www.fragrancenet.com",
  "fragrancenet.com",
  "www.fragranceshop.com",
  "fragranceshop.com",
]);

function needsDirectFetch(url: string): boolean {
  try {
    return DIRECT_FETCH_HOSTS.has(new URL(url).host);
  } catch {
    // Malformed URL: let the optimizer have it, onError covers the fallout.
    return false;
  }
}

export function BottleImage({
  src,
  house,
  name,
  sizes = "140px",
  className = "object-contain p-2 mix-blend-multiply group-hover:scale-105 transition-transform",
  priority = false,
  caption,
}: {
  // Accepts undefined as well as null: several callers type the field as
  // optional (`bottle_image_url?: string | null`), and all three cases mean
  // the same thing here — no usable image, show the placeholder.
  src: string | null | undefined;
  house: string;
  name: string;
  sizes?: string;
  className?: string;
  /** Above-the-fold images (the detail hero) should preload. */
  priority?: boolean;
  /** Shown under the placeholder when there's no usable image. Only worth
   *  it where there's room, i.e. the hero — not on list thumbnails. */
  caption?: string;
}) {
  const [failed, setFailed] = useState(false);

  // cleanBottleImageUrl nulls placeholder graphics AND unlicensed sources
  // (Fragrantica CDN + our mirror bucket), so those fall to the initials.
  const cleaned = cleanBottleImageUrl(src);
  const usable = cleaned && !failed;

  if (!usable) {
    // Thumbnails keep a little breathing room; the hero (the only caller
    // that passes a caption) runs edge to edge so the bottle reads large.
    return (
      <div
        className={`absolute inset-0 flex items-center justify-center ${caption ? "p-0" : "p-2"}`}
      >
        <BottlePlaceholder house={house} caption={caption} />
      </div>
    );
  }

  return (
    <Image
      src={cleaned}
      alt={`${house} ${name}`}
      fill
      sizes={sizes}
      className={className}
      priority={priority}
      unoptimized={needsDirectFetch(cleaned)}
      onError={() => setFailed(true)}
    />
  );
}

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

export function BottleImage({
  src,
  house,
  name,
  sizes = "140px",
  className = "object-contain p-2 mix-blend-multiply group-hover:scale-105 transition-transform",
  priority = false,
  caption,
}: {
  src: string | null;
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
    return (
      <div className="absolute inset-0 flex items-center justify-center p-2">
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
      onError={() => setFailed(true)}
    />
  );
}

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

export function houseInitials(house: string): string {
  const words = house
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function BottleImage({
  src,
  house,
  name,
  sizes = "140px",
  className = "object-contain p-2 mix-blend-multiply group-hover:scale-105 transition-transform",
}: {
  src: string | null;
  house: string;
  name: string;
  sizes?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  // cleanBottleImageUrl nulls placeholder graphics AND unlicensed sources
  // (Fragrantica CDN + our mirror bucket), so those fall to the initials.
  const cleaned = cleanBottleImageUrl(src);
  const usable = cleaned && !failed;

  if (!usable) {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-slate uppercase tracking-wider"
        aria-hidden
      >
        {houseInitials(house)}
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
      onError={() => setFailed(true)}
    />
  );
}

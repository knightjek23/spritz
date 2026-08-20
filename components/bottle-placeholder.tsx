// "Photo coming soon" placeholder — the outlined bottle shown wherever a
// fragrance has no licensed image yet.
//
// Coverage from affiliate feeds is inventory-bound (a retailer either
// stocks the bottle or doesn't), so a large share of the catalog will sit
// on this placeholder for the foreseeable future. It needs to read as a
// deliberate design element rather than a broken image: hence the drawn
// bottle silhouette with the house initials set inside it.
//
// Pure SVG so it scales cleanly from a 48px list thumbnail to the 200px
// detail hero with no raster assets and no layout shift.

export function houseInitials(house: string): string {
  const words = (house ?? "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  // Single-word houses read better as two letters (Chanel -> CH) than as a
  // lone initial; multi-word houses use one letter per word (Yves Saint
  // Laurent -> YSL), capped at 3 so it still fits inside the bottle.
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function BottlePlaceholder({
  house,
  className = "",
  caption,
}: {
  house: string;
  className?: string;
  /** Optional line under the bottle, e.g. "Image coming soon". Used on the
   *  detail hero where there's room; omitted on small thumbnails. */
  caption?: string;
}) {
  const initials = houseInitials(house);
  // Shrink the type as the initial count grows so 3 letters still sit
  // comfortably inside the 107-wide bottle body. Playfair is a
  // high-contrast serif and reads wider than the old mono, so these run a
  // touch smaller than the equivalent mono sizes.
  const fontSize = initials.length >= 3 ? 30 : 38;

  const svg = (
    <svg
      viewBox="0 0 219 219"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`w-full h-full ${className}`}
      role="img"
      aria-label={`${house}. ${caption ?? "Image coming soon"}.`}
    >
      {/* Cap */}
      <rect x="88" y="16" width="43" height="27" rx="1.5" stroke="#114821" />
      {/* Neck */}
      <rect x="98" y="44" width="23" height="15" stroke="#114821" />
      {/* Body */}
      <rect x="56" y="60" width="107" height="143" rx="7.5" stroke="#114821" />
      {/* House initials, centred in the body: x = 56 + 107/2, y = 60 + 143/2 */}
      <text
        x="109.5"
        y="131.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#114821"
        fillOpacity="0.6"
        fontSize={fontSize}
        // Playfair Display, the app's display/heading face. Referenced via
        // the CSS variable next/font sets on <html>, with the same fallback
        // chain as tailwind's font-display token.
        fontFamily='var(--font-playfair), "Playfair Display", Georgia, serif'
        letterSpacing="1"
      >
        {initials}
      </text>
    </svg>
  );

  if (!caption) return svg;

  // Caption sits under the bottle. min-h-0 lets the SVG shrink inside a
  // fixed-height parent instead of pushing the caption out of the box.
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2">
      <div className="min-h-0 flex-1 w-full">{svg}</div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-slate shrink-0">
        {caption}
      </p>
    </div>
  );
}

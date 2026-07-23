// Shared bottle-image helpers. Safe on both client and server (no fs,
// no server-only import) — BottleImage uses it in the browser, the
// scraper uses it at write time.
//
// The problem it solves: Fragrantica serves a generic "IMAGE COMING
// SOON" graphic in the same <img itemprop="image"> slot as a real
// bottle photo when they don't have one. The scraper took it at face
// value, so those rows carry a bottle_image_url that loads fine and
// looks broken — a grey silhouette in an otherwise clean row.
//
// Detection heuristic: placeholder graphics are SHARED across many
// fragrances, while real bottle photos are unique per fragrance. Run
// scripts/audit-bottle-images.sql to list any URL used by more than one
// row — that query is what identifies new placeholder URLs when
// Fragrantica changes them. Add confirmed ones to PLACEHOLDER_PATTERNS.

const PLACEHOLDER_PATTERNS: RegExp[] = [
  // Fragrantica's own "no image / coming soon" assets. Their CDN names
  // these inconsistently, so match on the recognisable fragments rather
  // than one exact path.
  /no[_-]?image/i,
  /image[_-]?coming[_-]?soon/i,
  /coming[_-]?soon/i,
  /placeholder/i,
  /\/noimg/i,
  /\/nopic/i,
  /default[_-]?bottle/i,
];

// Unlicensed image SOURCES we must not serve pre-launch (legal exposure):
//   - fimgs.net: Fragrantica's CDN. Hotlinking their/brands' copyrighted
//     bottle photos.
//   - the "bottle-images" Supabase Storage bucket: copies mirrored from
//     Fragrantica by scraper/src/mirror-images.ts. Hosting the copies
//     ourselves is worse, not better, so these are blocked too.
// Blocked = treated as no image → the UI falls back to house initials.
// When licensed images (affiliate feeds) land at their own URLs, they
// won't match these patterns and will render normally.
const BLOCKED_SOURCE_PATTERNS: RegExp[] = [
  /(^|\.)fimgs\.net\//i,
  /\/storage\/v1\/object\/public\/bottle-images\//i,
];

/**
 * True when a bottle_image_url points at a known placeholder graphic
 * rather than an actual bottle photo. Callers should treat a true
 * result the same as a null URL.
 */
export function isPlaceholderBottleUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(url));
}

/**
 * True when a URL points at an unlicensed source we must not serve
 * (Fragrantica CDN or our mirror bucket of it). Kept separate from the
 * placeholder check so the reason is clear at the call site.
 */
export function isBlockedImageSource(url: string | null | undefined): boolean {
  if (!url) return false;
  return BLOCKED_SOURCE_PATTERNS.some((re) => re.test(url));
}

/**
 * Normalises a bottle image URL: returns null for placeholder graphics
 * AND for unlicensed sources (Fragrantica CDN / our mirror of it), so
 * the column reads as empty and the UI shows the house-initials
 * fallback instead of a legally-exposed photo.
 */
export function cleanBottleImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (isPlaceholderBottleUrl(url) || isBlockedImageSource(url)) return null;
  return url;
}

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
 * Normalises a scraped image URL: returns null for placeholders so the
 * column stays honestly empty instead of storing a fake photo.
 */
export function cleanBottleImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return isPlaceholderBottleUrl(url) ? null : url;
}

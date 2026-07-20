// Scraper-local copy of the placeholder-image guard.
//
// Kept here (not imported from the app's lib/bottle-image.ts) because the
// scraper is a separate ESM package: a cross-package relative import of a
// .ts file fails to resolve named exports at runtime under tsx/Node ESM.
// The regex list is tiny and rarely changes; if you edit one copy, mirror
// the other. Canonical version + rationale: ../../lib/bottle-image.ts.
//
// Fragrantica serves a generic "IMAGE COMING SOON" graphic in the same
// <img itemprop="image"> slot as a real bottle photo when it has none.
// cleanBottleImageUrl returns null for those so the column stays honestly
// empty instead of storing a fake photo that renders as a grey silhouette.

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /no[_-]?image/i,
  /image[_-]?coming[_-]?soon/i,
  /coming[_-]?soon/i,
  /placeholder/i,
  /\/noimg/i,
  /\/nopic/i,
  /default[_-]?bottle/i,
];

export function isPlaceholderBottleUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(url));
}

export function cleanBottleImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return isPlaceholderBottleUrl(url) ? null : url;
}

// Fragrantica's listed name sometimes differs from what's on the bottle
// and what the market (and our trending feeds) actually call a scent:
//
//   - CENSORED: Tom Ford "Vanilla Sex" is listed as plain "Vanilla".
//   - VERBOSE:  YSL "Myslf" is listed as "MYSLF Eau de Parfum".
//   - PREFIXED: Valentino "Donna Born in Roma" is listed as
//               "Valentino Donna Born in Roma".
//
// Storing Fragrantica's version means the catalog name won't match the
// feed name, so the trending card can't link and the detail page shows
// the wrong title. We override to the real on-bottle name at scrape
// time, keyed by the stable Fragrantica perfume id (the number at the
// tail of the URL, e.g. .../Vanilla-88588.html -> "88588").
//
// Only add an entry when the bottle name genuinely differs from
// Fragrantica's listing — confirmed against the product page / bottle.

export const NAME_OVERRIDES: Record<string, string> = {
  "88588": "Vanilla Sex", // Tom Ford — Fragrantica lists as "Vanilla"
  "84094": "Myslf", // YSL — Fragrantica lists as "MYSLF Eau de Parfum"
  "55963": "Uomo Born in Roma", // Valentino — FR: "Valentino Uomo Born in Roma"
  "55805": "Donna Born in Roma", // Valentino — FR: "Valentino Donna Born in Roma"
};

/** Extract the trailing Fragrantica perfume id from a URL, or null. */
export function fragranticaId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/-(\d+)\.html(?:$|[?#])/);
  return m ? m[1] : null;
}

/**
 * Apply a name override when the scraped Fragrantica name differs from
 * the real bottle name. Returns the original name unchanged when there's
 * no override for this fragrance.
 */
export function applyNameOverride(
  scrapedName: string,
  fragranticaUrl: string | null | undefined,
): string {
  const id = fragranticaId(fragranticaUrl);
  return (id && NAME_OVERRIDES[id]) || scrapedName;
}

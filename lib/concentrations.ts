// Perfume concentration reference — labels, short forms, plain-English
// descriptions, and a parser that extracts the concentration from a
// fragrance name when it's explicit.
//
// Four canonical types (industry standard):
//   edt      - Eau de Toilette
//   edp      - Eau de Parfum
//   parfum   - Parfum
//   extrait  - Extrait de Parfum
//
// The catalog stores these as an enum column (migration 0014). Most
// flanker releases carry the concentration in the fragrance name
// ("Bleu de Chanel Eau de Parfum" vs "Bleu de Toilette"), so the
// parser catches ~70-80% of the catalog for free without any API cost.
// Base fragrances with no concentration in the name stay NULL; the UI
// hides the field rather than guessing.

export const CONCENTRATION_ORDER = ["edt", "edp", "parfum", "extrait"] as const;
export type Concentration = (typeof CONCENTRATION_ORDER)[number];

/** Full display name, as printed on the bottle. */
export const CONCENTRATION_LABEL: Record<Concentration, string> = {
  edt: "Eau de Toilette",
  edp: "Eau de Parfum",
  parfum: "Parfum",
  extrait: "Extrait de Parfum",
};

/** Short form for compact chips / metadata lines. */
export const CONCENTRATION_SHORT: Record<Concentration, string> = {
  edt: "EDT",
  edp: "EDP",
  parfum: "Parfum",
  extrait: "Extrait",
};

/** Plain-English description a beginner can use to understand what
 *  "concentration" means in practice — projection, longevity,
 *  when-to-wear. Written in the Spritz voice (no em dashes, no jargon
 *  without a gloss, concrete sensory anchors). */
export const CONCENTRATION_DESCRIPTION: Record<Concentration, string> = {
  edt:
    "Lighter concentration, roughly 5 to 15 percent aromatic oils. Wears close to skin, usually needs a refresh after 3 to 5 hours. Better in warmer weather or when you want something quiet and easy.",
  edp:
    "Standard modern strength, roughly 15 to 20 percent aromatic oils. All-day wear with moderate projection. The default for most contemporary designer and niche releases.",
  parfum:
    "High concentration, roughly 20 to 30 percent aromatic oils. Wears long and close to skin, less projection but more intense one-on-one. Meant to be worn sparingly and dabbed rather than sprayed.",
  extrait:
    "The most concentrated form, roughly 25 to 40 percent aromatic oils. Deep, long-lasting, intimate wear. Historically the original form of a fragrance before lighter versions were introduced.",
};

/**
 * Parse a fragrance name for an explicit concentration keyword. Returns
 * null when the name doesn't clearly indicate one.
 *
 * Ordering matters: "Eau de Parfum" contains the word "parfum", so we
 * must match the full phrase BEFORE testing for standalone "parfum",
 * or we'd tag every EDP as Parfum. Same trap with "Extrait de Parfum".
 *
 * Word boundaries (\b) keep false positives out — "extraord..." can't
 * match "extrait", "parfumeur" can't match "parfum", etc.
 */
export function parseConcentrationFromName(name: string): Concentration | null {
  // Check longest / most-specific patterns first.
  if (/\beau\s+de\s+parfum\b/i.test(name)) return "edp";
  if (/\beau\s+de\s+toilette\b/i.test(name)) return "edt";
  if (/\bextrait(\s+de\s+parfum)?\b/i.test(name)) return "extrait";
  // Standalone "Parfum" only after eliminating the two-word phrases above.
  if (/\bparfum\b/i.test(name)) return "parfum";
  // Common abbreviations, sometimes appended to flanker names.
  if (/\bedp\b/i.test(name)) return "edp";
  if (/\bedt\b/i.test(name)) return "edt";
  return null;
}

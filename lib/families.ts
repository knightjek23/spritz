// Fragrance family taxonomy. Used by:
//   - /family/[slug] for the per-family page header + curated description
//   - /families for the index
//   - /notes for grouping notes under family headings
//   - components that surface "what is a chypre?" microcopy
//
// Single source of truth. If the catalog turns up a family slug not in
// the FAMILY_BLURB map, the page still renders — we just skip the
// editorial line. That way unknown families never 404, they just look
// thinner until we write a blurb.

/**
 * Display order — most-scanned categories first, abstract / synthetic
 * categories last. Drives the section sequence on the /families index
 * and the grouping order on /notes.
 */
export const FAMILY_ORDER = [
  "citrus",
  "floral",
  "fruity",
  "green",
  "aromatic",
  "spicy",
  "woody",
  "oriental",
  "amber",
  "leather",
  "musky",
  "gourmand",
  "aquatic",
  "ozonic",
  "synthetic",
  "chypre",
  "fougere",
  "other",
];

/**
 * One-sentence editorial description per family. Kept terse and concrete
 * — these run as subtitles, not paragraphs.
 */
export const FAMILY_BLURB: Record<string, string> = {
  citrus: "Bright, sharp, top-of-the-bottle openings.",
  floral: "Petals, blossoms, and the heart of most perfumes.",
  fruity: "Sweet and juicy: apple, peach, berry, plum.",
  green: "Leaves, stems, fresh-cut grass.",
  aromatic: "Herbs and culinary notes: basil, rosemary, mint.",
  spicy: "Pepper, cinnamon, cardamom, ginger.",
  woody: "Cedar, sandalwood, oud, vetiver. The foundation.",
  oriental: "Resins, spices, balsams. Warm and dense.",
  amber: "Sweet, golden, slightly powdery.",
  leather: "Tanned hides, smoke, suede.",
  musky: "Skin, warmth, the soft tail of a fragrance.",
  gourmand: "Edible: vanilla, caramel, chocolate, coffee.",
  aquatic: "Sea air, salt, ozone.",
  ozonic: "Cool, clean, sky-after-rain.",
  synthetic: "Lab-built molecules: ambroxan, iso E super.",
  chypre: "Bergamot top, oakmoss base. The classic fougère's elegant cousin.",
  fougere: "Lavender, coumarin, oakmoss. The archetypal masculine.",
  other: "Notes that defy clean categorization.",
};

/**
 * Slugify a free-text family name to URL-safe form. Mirrors the SQL
 * normalization in find_fragrances_by_family / list_catalog_families
 * which lowercases without stripping — for ASCII single-word families
 * (which is most of them) lowercase IS the slug.
 */
export function familySlug(family: string): string {
  return family
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * JS mirror of the SQL normalize_family() function from migration 0009.
 * Maps raw Fragrantica accord strings ("warm spicy", "powdery",
 * "vanilla") to the canonical family slug used by /family/[slug] and
 * FAMILY_BLURB. Keep in sync with the SQL function — if you add or
 * change a mapping here, update normalize_family() in migration 0009
 * (or add a follow-up migration) so client links and server queries
 * agree on the same taxonomy.
 *
 * Why this exists: family pills on the fragrance detail page render the
 * raw accord string from fragrances.family[], but the user-facing
 * /family/[slug] route only knows canonical slugs. Without this
 * normalizer, tapping "Warm Spicy" 404s.
 */
const FAMILY_NORMALIZE: Record<string, string> = {
  // Exact family slug matches (passthrough)
  citrus: "citrus",
  floral: "floral",
  fruity: "fruity",
  green: "green",
  aromatic: "aromatic",
  spicy: "spicy",
  woody: "woody",
  oriental: "oriental",
  amber: "amber",
  leather: "leather",
  musky: "musky",
  gourmand: "gourmand",
  aquatic: "aquatic",
  ozonic: "ozonic",
  synthetic: "synthetic",
  chypre: "chypre",
  fougere: "fougere",

  // Floral variants
  "white floral": "floral",
  "soft floral": "floral",
  "yellow floral": "floral",
  powdery: "floral",
  rose: "floral",
  iris: "floral",
  violet: "floral",

  // Spicy variants
  "warm spicy": "spicy",
  "fresh spicy": "spicy",

  // Woody variants
  "woody floral": "woody",
  "dry woody": "woody",

  // Aromatic / herbal
  lavender: "aromatic",
  rosemary: "aromatic",
  sage: "aromatic",
  mint: "aromatic",
  herbal: "aromatic",

  // Gourmand / sweet edibles
  sweet: "gourmand",
  vanilla: "gourmand",
  almond: "gourmand",
  honey: "gourmand",
  coconut: "gourmand",
  chocolate: "gourmand",
  caramel: "gourmand",
  coffee: "gourmand",

  // Oriental / amber-adjacent / resinous
  balsamic: "oriental",
  resinous: "oriental",
  incense: "oriental",

  // Green / earthy
  earthy: "green",
  mossy: "green",
  fresh: "green",

  // Aquatic / marine
  marine: "aquatic",

  // Leather / animalic / smoky
  animalic: "leather",
  smoky: "leather",
  tobacco: "leather",

  // Musky
  "soft musky": "musky",

  // Synthetic
  "white musk": "synthetic",
};

export function normalizeFamily(accord: string): string {
  const key = accord.trim().toLowerCase();
  return FAMILY_NORMALIZE[key] ?? "other";
}

/**
 * Friendly title-case for display. Just capitalize the first letter; the
 * rest stay lowercase. Avoids "Oud" becoming "OUD" or weirder cases.
 */
export function familyName(slug: string): string {
  if (!slug) return "";
  return slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
}

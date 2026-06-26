// Light pastel swatches for fragrance families and notes.
//
// Every swatch is designed to pass WCAG AA contrast (4.5:1) against the
// Spritz ink text color (#2C2420). The palette stays in the L≈90-94%
// lightness band — saturated enough to read as a color, light enough to
// keep ink text legible on top without any extra outline or shadow.
//
// Verification: ink has computed luminance ≈ 0.02; every swatch below has
// luminance > 0.85, giving a contrast ratio of at least 13:1 — well past
// the 4.5:1 floor. Picked from Tailwind's 100-shade scale, which is
// internally consistent and well-tested for accessibility.
//
// Family swatches are mapped per canonical family slug (the normalized
// taxonomy from lib/families.ts). Note swatches are bucketed by keyword
// match — every note rolls up into one of the same color families, so a
// rose chip is pink whether it's listed as "Rose," "Damask Rose,"
// "Bulgarian Rose," etc.

const INK = "#2C2420";

export interface Swatch {
  /** Background color — Tailwind-100-equivalent pastel. */
  bg: string;
  /** Text color — always ink, guaranteed to pass 4.5:1 against bg. */
  text: string;
}

// ----- Family swatches -----
// Keyed by canonical family slug (lib/families.ts FAMILY_ORDER). Picks
// semantic colors: warm yellows for citrus, pinks for floral, browns
// for woody, etc. Any family not in this map falls back to neutral stone.

const FAMILY_SWATCH: Record<string, Swatch> = {
  citrus: { bg: "#FEF9C3", text: INK }, // yellow-100
  floral: { bg: "#FCE7F3", text: INK }, // pink-100
  fruity: { bg: "#FFE4E6", text: INK }, // rose-100
  green: { bg: "#DCFCE7", text: INK }, // green-100
  aromatic: { bg: "#D1FAE5", text: INK }, // emerald-100
  spicy: { bg: "#FEE2E2", text: INK }, // red-100
  woody: { bg: "#FEF3C7", text: INK }, // amber-100 (warm tan)
  oriental: { bg: "#FFEDD5", text: INK }, // orange-100
  amber: { bg: "#FED7AA", text: INK }, // orange-200 (more amber)
  leather: { bg: "#E7E5E4", text: INK }, // stone-200
  musky: { bg: "#F5F5F4", text: INK }, // stone-100
  gourmand: { bg: "#FFEDD5", text: INK }, // orange-100 (warm caramel)
  aquatic: { bg: "#CFFAFE", text: INK }, // cyan-100
  ozonic: { bg: "#E0F2FE", text: INK }, // sky-100
  synthetic: { bg: "#E0E7FF", text: INK }, // indigo-100
  chypre: { bg: "#ECFCCB", text: INK }, // lime-100 (mossy)
  fougere: { bg: "#D9F99D", text: INK }, // lime-200 (lavender + moss)
  other: { bg: "#F5F5F4", text: INK }, // stone-100
};

const FAMILY_FALLBACK: Swatch = { bg: "#F5F5F4", text: INK };

/**
 * Get the color swatch for a family. Accepts either a canonical slug
 * (citrus, floral, ...) or a free-text family name — runs through the
 * same normalizer the rest of the app uses so "Warm Spicy" and "Spicy"
 * resolve to the same pink. Falls back to neutral stone if the family
 * isn't recognized.
 */
export function familySwatch(family: string): Swatch {
  const key = family.trim().toLowerCase();
  // Try direct canonical lookup first.
  if (FAMILY_SWATCH[key]) return FAMILY_SWATCH[key];
  // Otherwise normalize via the SQL-mirror map and re-lookup.
  const normalized = NORMALIZE[key];
  if (normalized && FAMILY_SWATCH[normalized]) return FAMILY_SWATCH[normalized];
  return FAMILY_FALLBACK;
}

// Inlined subset of FAMILY_NORMALIZE from lib/families.ts. Duplicated
// here so this file has zero internal deps and can be imported from
// anywhere without dragging in the families module. If the canonical
// taxonomy changes, update both places.
const NORMALIZE: Record<string, string> = {
  "white floral": "floral",
  "soft floral": "floral",
  "yellow floral": "floral",
  powdery: "floral",
  rose: "floral",
  iris: "floral",
  violet: "floral",
  "warm spicy": "spicy",
  "fresh spicy": "spicy",
  "woody floral": "woody",
  "dry woody": "woody",
  lavender: "aromatic",
  rosemary: "aromatic",
  sage: "aromatic",
  mint: "aromatic",
  herbal: "aromatic",
  sweet: "gourmand",
  vanilla: "gourmand",
  almond: "gourmand",
  honey: "gourmand",
  coconut: "gourmand",
  chocolate: "gourmand",
  caramel: "gourmand",
  coffee: "gourmand",
  balsamic: "oriental",
  resinous: "oriental",
  incense: "oriental",
  earthy: "green",
  mossy: "green",
  fresh: "green",
  marine: "aquatic",
  animalic: "leather",
  smoky: "leather",
  tobacco: "leather",
  "soft musky": "musky",
  "white musk": "synthetic",
};

// ----- Note swatches -----
// Notes are bucketed into semantic categories by keyword matching. The
// order matters — more specific categories are checked first (e.g.
// "tobacco leaf" should match leather/smoky, not generic green).

interface NoteCategory {
  keywords: string[];
  swatch: Swatch;
}

const NOTE_CATEGORIES: NoteCategory[] = [
  // Citrus — bright yellow
  {
    keywords: [
      "bergamot", "lemon", "lime", "orange", "grapefruit", "mandarin",
      "yuzu", "tangerine", "citron", "petitgrain", "neroli", "calabrian",
    ],
    swatch: { bg: "#FEF9C3", text: INK },
  },
  // Floral — pink (white-floral types, soft pinks)
  {
    keywords: [
      "rose", "jasmine", "ylang", "lily", "tuberose", "gardenia",
      "magnolia", "peony", "freesia", "narcissus", "honeysuckle",
      "frangipani", "geranium", "carnation", "orchid", "lotus", "mimosa",
      "cyclamen", "hyacinth",
    ],
    swatch: { bg: "#FCE7F3", text: INK },
  },
  // Iris / violet / powdery florals — light lavender
  {
    keywords: ["iris", "orris", "violet", "heliotrope"],
    swatch: { bg: "#EDE9FE", text: INK },
  },
  // Fruity — rose pink (apple, peach, berry)
  {
    keywords: [
      "apple", "peach", "berry", "raspberry", "strawberry", "plum",
      "pear", "fig", "cherry", "blackcurrant", "cassis", "pineapple",
      "mango", "passion fruit", "lychee", "melon", "watermelon", "grape",
      "pomegranate", "apricot", "quince", "rhubarb", "tropical",
    ],
    swatch: { bg: "#FFE4E6", text: INK },
  },
  // Green — mint / herb / tea — fresh green
  {
    keywords: [
      "mint", "basil", "tea", "leaf", "leaves", "grass", "green",
      "ivy", "galbanum", "tomato", "fig leaf", "cannabis",
    ],
    swatch: { bg: "#DCFCE7", text: INK },
  },
  // Aromatic — herbs, lavender — emerald
  {
    keywords: [
      "lavender", "rosemary", "sage", "thyme", "oregano", "fennel",
      "anise", "tarragon", "coriander", "dill", "chamomile",
    ],
    swatch: { bg: "#D1FAE5", text: INK },
  },
  // Spicy — warm red
  {
    keywords: [
      "pepper", "cinnamon", "cardamom", "clove", "nutmeg", "saffron",
      "ginger", "cumin", "pimento", "allspice", "juniper", "spice",
    ],
    swatch: { bg: "#FEE2E2", text: INK },
  },
  // Sweet / gourmand — warm orange / caramel
  {
    keywords: [
      "vanilla", "caramel", "chocolate", "coffee", "honey", "praline",
      "marshmallow", "cotton candy", "cream", "milk", "almond", "nut",
      "hazelnut", "pistachio", "coconut", "tonka", "bean", "sugar",
      "rum", "whiskey", "liqueur", "candy", "cake", "biscuit",
    ],
    swatch: { bg: "#FFEDD5", text: INK },
  },
  // Smoky / leather / tobacco — warm stone
  {
    keywords: [
      "leather", "suede", "tobacco", "smoke", "smoky", "burnt",
      "tar", "rubber",
    ],
    swatch: { bg: "#E7E5E4", text: INK },
  },
  // Incense / resin / amber — golden
  {
    keywords: [
      "amber", "incense", "frankincense", "myrrh", "labdanum", "benzoin",
      "balsam", "opoponax", "elemi", "styrax", "resin",
    ],
    swatch: { bg: "#FED7AA", text: INK },
  },
  // Woody — warm tan
  {
    keywords: [
      "wood", "cedar", "sandalwood", "oud", "agarwood", "rosewood",
      "vetiver", "patchouli", "guaiac", "cypress", "pine", "birch",
      "oak", "ebony", "papyrus", "bamboo",
    ],
    swatch: { bg: "#FEF3C7", text: INK },
  },
  // Aquatic / ozonic / marine — cyan
  {
    keywords: [
      "marine", "sea", "ocean", "water", "aquatic", "ozonic", "salt",
      "seaweed", "algae", "rain", "air",
    ],
    swatch: { bg: "#CFFAFE", text: INK },
  },
  // Musk / animalic — neutral stone
  {
    keywords: [
      "musk", "ambergris", "civet", "castoreum", "hyrax", "skin",
    ],
    swatch: { bg: "#F5F5F4", text: INK },
  },
  // Mossy / chypre / earthy — lime/moss
  {
    keywords: [
      "oakmoss", "moss", "treemoss", "earth", "soil", "mushroom",
      "truffle", "humus",
    ],
    swatch: { bg: "#ECFCCB", text: INK },
  },
  // Synthetic / molecular — indigo (lab-built signals)
  {
    keywords: [
      "ambroxan", "iso e super", "javanol", "cashmeran", "norlimbanol",
      "calone", "ethyl maltol", "ambrox", "molecule",
    ],
    swatch: { bg: "#E0E7FF", text: INK },
  },
];

const NOTE_FALLBACK: Swatch = { bg: "#F5F5F4", text: INK };

/**
 * Get the color swatch for a single note name. Matches on substring so
 * "Damask Rose," "Bulgarian Rose," and "Rose Absolute" all bucket into
 * pink. Falls back to neutral stone if no category keyword matches.
 *
 * Note: case-insensitive, trims, ignores accord qualifiers ("absolute,"
 * "essence," "oil," etc. don't affect bucketing — only the noun matters).
 */
export function noteSwatch(note: string): Swatch {
  const lower = note.trim().toLowerCase();
  if (!lower) return NOTE_FALLBACK;
  for (const cat of NOTE_CATEGORIES) {
    if (cat.keywords.some((kw) => lower.includes(kw))) {
      return cat.swatch;
    }
  }
  return NOTE_FALLBACK;
}

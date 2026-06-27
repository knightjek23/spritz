// Soft, lightened vintage swatches for fragrance families and notes.
//
// Design intent: every pill should look like it lives in the Spritz world
// (cream + ink + emerald + brass + periwinkle), not like an Easter
// pastel pulled from a Tailwind chart. This iteration takes the previous
// muted vintage palette and lifts each tone ~30% toward white WITHOUT
// raising saturation — the result is softer and paler (a "milky" version
// of each color) while still readable as the same underlying hue. Lifts
// brightness without bumping vibrancy. Targets L≈82-92% (vs prior
// 70-82%).
//
// Why lighten by mixing with white, not by raising HSL lightness alone:
// raising L alone often nudges perceived saturation up (because higher L
// at the same S pushes toward "luminous pure color"). Mixing toward
// white desaturates as it lightens, which is exactly the "softer + paler"
// the Spritz palette asks for — dusty rose stays dusty, just paler.
//
// Contrast: ink (#2C2420) has luminance ≈ 0.02. Every swatch below
// targets L = 0.45–0.78, giving contrast ratios of 7:1 to 12:1 against
// ink text — comfortably past WCAG AA (4.5:1) and AAA (7:1). Spot-
// checked at the darkest new tone (#B8B5A6 earthy wood) = 7.3:1.
//
// Granularity preserved from the prior pass: ~35 distinct note categories
// so rose, jasmine, violet, iris, and tuberose each get their own tone
// instead of all collapsing to "pink." Family swatches pull the most
// representative note tone from their category so a fragrance's family
// pill harmonizes with its notes.

const INK = "#2C2420";

export interface Swatch {
  /** Background color — soft lightened tone at L≈82–92%. */
  bg: string;
  /** Text color — always ink, verified ≥7:1 contrast against bg. */
  text: string;
}

// ----- Family swatches -----
// One color per canonical family slug (lib/families.ts FAMILY_ORDER).
// Each pulled from the most representative note tone in that family.

const FAMILY_SWATCH: Record<string, Swatch> = {
  citrus: { bg: "#EFE2AB", text: INK }, // soft golden citrus
  floral: { bg: "#E2C0C0", text: INK }, // soft dusty rose
  fruity: { bg: "#E4C2B0", text: INK }, // soft peach
  green: { bg: "#C2CDB8", text: INK }, // soft sage
  aromatic: { bg: "#C1C2A8", text: INK }, // soft olive sage
  spicy: { bg: "#D5B3A6", text: INK }, // soft terracotta
  woody: { bg: "#D9C8B7", text: INK }, // soft warm sand
  oriental: { bg: "#CBB69F", text: INK }, // soft bronze
  amber: { bg: "#E1CDAC", text: INK }, // soft honey
  leather: { bg: "#C2B1A0", text: INK }, // soft tobacco
  musky: { bg: "#E2D9CD", text: INK }, // soft bone
  gourmand: { bg: "#D9C2A1", text: INK }, // soft toffee
  aquatic: { bg: "#C2D2CF", text: INK }, // soft seafoam
  ozonic: { bg: "#CDD6DB", text: INK }, // soft sky
  synthetic: { bg: "#B8B5C8", text: INK }, // soft slate-lavender
  chypre: { bg: "#C2B5A6", text: INK }, // soft sage-umber
  fougere: { bg: "#C2C0D0", text: INK }, // soft lavender-blue
  other: { bg: "#D6D1C8", text: INK }, // soft warm stone
};

const FAMILY_FALLBACK: Swatch = { bg: "#D6D1C8", text: INK };

/**
 * Get the color swatch for a family. Accepts a canonical slug or a
 * free-text family name — runs through the same normalizer the rest of
 * the app uses so "Warm Spicy" and "Spicy" resolve to the same
 * terracotta. Falls back to warm stone if the family isn't recognized.
 */
export function familySwatch(family: string): Swatch {
  const key = family.trim().toLowerCase();
  if (FAMILY_SWATCH[key]) return FAMILY_SWATCH[key];
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
// Bucketed into ~35 semantic categories. Order matters — narrowest
// categories (specific notes) first, broadest (generic family keywords)
// last, so "rose pepper" matches the rose category instead of generic
// spice. Each category gets its own distinct tone.

interface NoteCategory {
  keywords: string[];
  swatch: Swatch;
}

const NOTE_CATEGORIES: NoteCategory[] = [
  // --- Citrus variants (3 distinct tones) ---
  {
    // Bright citrus — lemon, bergamot, lime, citron
    keywords: ["bergamot", "lemon", "lime", "citron", "calabrian", "verbena"],
    swatch: { bg: "#EFE2AB", text: INK }, // soft golden
  },
  {
    // Sweet citrus — orange, mandarin, tangerine, neroli
    keywords: [
      "orange", "mandarin", "tangerine", "neroli", "petitgrain", "clementine",
    ],
    swatch: { bg: "#E9CBB1", text: INK }, // soft apricot
  },
  {
    // Tart citrus — grapefruit, yuzu
    keywords: ["grapefruit", "yuzu", "pomelo"],
    swatch: { bg: "#E2E0AE", text: INK }, // soft pale lime
  },

  // --- Florals (5 distinct tones) ---
  {
    // Rose — the canonical pink floral
    keywords: ["rose"],
    swatch: { bg: "#E2C0C0", text: INK }, // soft dusty rose
  },
  {
    // White florals — jasmine, tuberose, gardenia, magnolia
    keywords: [
      "jasmine", "tuberose", "gardenia", "magnolia", "frangipani",
      "honeysuckle", "champaca",
    ],
    swatch: { bg: "#EDE0DB", text: INK }, // soft ivory blush
  },
  {
    // Ylang, lily, lotus — exotic floral
    keywords: ["ylang", "lily", "lotus", "orchid"],
    swatch: { bg: "#E7D9CD", text: INK }, // soft champagne
  },
  {
    // Iris / violet / orris — powdery floral
    keywords: ["iris", "orris", "violet", "heliotrope", "mimosa"],
    swatch: { bg: "#CDC0D6", text: INK }, // soft lavender
  },
  {
    // Soft pink florals — peony, freesia, geranium, carnation
    keywords: [
      "peony", "freesia", "geranium", "carnation", "hyacinth",
      "narcissus", "cyclamen",
    ],
    swatch: { bg: "#E1CBCD", text: INK }, // soft blush
  },

  // --- Fruity (4 distinct tones) ---
  {
    // Berries — raspberry, strawberry, blackcurrant
    keywords: [
      "berry", "raspberry", "strawberry", "blackcurrant", "cassis",
      "blueberry", "cherry",
    ],
    swatch: { bg: "#CBACB5", text: INK }, // soft plum
  },
  {
    // Stone fruit — peach, apricot, plum
    keywords: ["peach", "apricot", "plum", "nectarine"],
    swatch: { bg: "#E4C2B0", text: INK }, // soft peach
  },
  {
    // Orchard fruit — apple, pear, quince, fig
    keywords: ["apple", "pear", "quince", "fig", "pomegranate"],
    swatch: { bg: "#D6D0BC", text: INK }, // soft celadon
  },
  {
    // Tropical — mango, passion fruit, lychee, melon, pineapple
    keywords: [
      "mango", "passion fruit", "lychee", "melon", "watermelon",
      "pineapple", "papaya", "tropical", "grape", "rhubarb",
    ],
    swatch: { bg: "#E1B8B5", text: INK }, // soft coral
  },

  // --- Green / aromatic (4 distinct tones) ---
  {
    // Green leafy — tea, leaves, grass, galbanum, fig leaf
    keywords: [
      "tea", "leaf", "leaves", "grass", "galbanum", "ivy", "tomato",
      "cannabis", "bamboo", "green",
    ],
    swatch: { bg: "#C2CDB8", text: INK }, // soft sage
  },
  {
    // Mint — distinct from herbs
    keywords: ["mint", "peppermint", "spearmint"],
    swatch: { bg: "#C0D4C8", text: INK }, // soft seafoam-green
  },
  {
    // Aromatic herbs — basil, sage, thyme, rosemary, anise
    keywords: [
      "basil", "sage", "thyme", "rosemary", "oregano", "fennel",
      "anise", "tarragon", "coriander", "dill", "chamomile",
    ],
    swatch: { bg: "#C1C2A8", text: INK }, // soft olive sage
  },
  {
    // Lavender — its own thing, neither herb nor floral exactly
    keywords: ["lavender"],
    swatch: { bg: "#C2C0D0", text: INK }, // soft lavender-blue
  },

  // --- Spicy (3 distinct tones) ---
  {
    // Warm spice — cinnamon, clove, nutmeg
    keywords: ["cinnamon", "clove", "nutmeg", "allspice", "pimento"],
    swatch: { bg: "#D5B3A6", text: INK }, // soft terracotta
  },
  {
    // Sharp spice — pepper, cardamom, juniper
    keywords: ["pepper", "cardamom", "juniper", "cumin"],
    swatch: { bg: "#CDAA9E", text: INK }, // soft rust
  },
  {
    // Exotic spice — saffron, ginger
    keywords: ["saffron", "ginger", "spice"],
    swatch: { bg: "#D9C1A5", text: INK }, // soft ochre
  },

  // --- Gourmand (4 distinct tones) ---
  {
    // Vanilla — its own thing
    keywords: ["vanilla", "tonka", "bean"],
    swatch: { bg: "#EBDFCB", text: INK }, // soft cream
  },
  {
    // Chocolate, coffee — bitter sweet
    keywords: ["chocolate", "cocoa", "coffee", "espresso"],
    swatch: { bg: "#C2B3A6", text: INK }, // soft mocha
  },
  {
    // Caramel, honey, sugar — golden sweet
    keywords: [
      "caramel", "honey", "sugar", "praline", "candy", "marshmallow",
      "cotton candy", "rum", "whiskey", "liqueur",
    ],
    swatch: { bg: "#D9C2A1", text: INK }, // soft toffee
  },
  {
    // Nuts, almond, coconut, cream
    keywords: [
      "almond", "nut", "hazelnut", "pistachio", "coconut", "cream",
      "milk", "biscuit", "cake",
    ],
    swatch: { bg: "#D6C0AC", text: INK }, // soft hazelnut
  },

  // --- Resin / amber / oriental (2 distinct tones) ---
  {
    // Amber — warm golden resin
    keywords: ["amber", "labdanum", "benzoin", "balsam"],
    swatch: { bg: "#E1CDAC", text: INK }, // soft honey
  },
  {
    // Incense, myrrh, frankincense — smoky resin
    keywords: [
      "incense", "frankincense", "myrrh", "opoponax", "elemi",
      "styrax", "resin", "olibanum",
    ],
    swatch: { bg: "#CBB69F", text: INK }, // soft bronze
  },

  // --- Smoky / leather / tobacco (3 distinct tones) ---
  {
    // Leather, suede — warm hide
    keywords: ["leather", "suede"],
    swatch: { bg: "#C2B1A0", text: INK }, // soft tobacco brown
  },
  {
    // Tobacco, hay — dried golden
    keywords: ["tobacco", "hay", "straw"],
    swatch: { bg: "#CDBBA2", text: INK }, // soft golden tobacco
  },
  {
    // Smoke, burnt, tar — dark ash
    keywords: ["smoke", "smoky", "burnt", "tar", "rubber", "asphalt"],
    swatch: { bg: "#BCB6B1", text: INK }, // soft ash
  },

  // --- Woody (3 distinct tones) ---
  {
    // Soft woods — sandalwood, cedar, rosewood
    keywords: [
      "sandalwood", "cedar", "rosewood", "cypress", "pine", "fir",
      "birch", "oak", "papyrus",
    ],
    swatch: { bg: "#D9C8B7", text: INK }, // soft warm sand
  },
  {
    // Dark woods — oud, agarwood, ebony
    keywords: ["oud", "agarwood", "ebony", "guaiac"],
    swatch: { bg: "#C2B4A0", text: INK }, // soft walnut
  },
  {
    // Earthy wood — vetiver, patchouli
    keywords: ["vetiver", "patchouli"],
    swatch: { bg: "#B8B5A6", text: INK }, // soft moss-brown
  },
  {
    // Generic "wood" catchall — must come AFTER specific wood types
    // so "sandalwood" hits warm sand, not generic.
    keywords: ["wood", "woody"],
    swatch: { bg: "#D9C8B7", text: INK }, // soft warm sand (same as soft woods)
  },

  // --- Aquatic / ozonic / marine (2 distinct tones) ---
  {
    // Marine / sea / salt — deeper aquatic
    keywords: [
      "marine", "sea", "ocean", "water", "aquatic", "salt", "seaweed",
      "algae",
    ],
    swatch: { bg: "#C2D2CF", text: INK }, // soft seafoam
  },
  {
    // Ozonic / air / rain — lighter, sky-toned
    keywords: ["ozonic", "ozone", "rain", "air", "atmosphere", "cloud"],
    swatch: { bg: "#CDD6DB", text: INK }, // soft sky
  },

  // --- Musk / animalic / powdery (2 distinct tones) ---
  {
    // Musk, ambergris — soft skin musk
    keywords: ["musk", "ambergris", "civet", "castoreum", "hyrax", "skin"],
    swatch: { bg: "#E2D9CD", text: INK }, // soft bone
  },
  {
    // Powdery — orris, talc, makeup-adjacent
    keywords: ["powder", "powdery", "talc", "cosmetic"],
    swatch: { bg: "#E1CBCD", text: INK }, // soft blush
  },

  // --- Mossy / earthy ---
  {
    keywords: [
      "oakmoss", "moss", "treemoss", "earth", "soil", "mushroom",
      "truffle", "humus", "petrichor",
    ],
    swatch: { bg: "#C2B5A6", text: INK }, // soft sage-umber
  },

  // --- Synthetic / molecular ---
  {
    keywords: [
      "ambroxan", "iso e super", "javanol", "cashmeran", "norlimbanol",
      "calone", "ethyl maltol", "ambrox", "molecule",
    ],
    swatch: { bg: "#B8B5C8", text: INK }, // soft slate-lavender
  },
];

const NOTE_FALLBACK: Swatch = { bg: "#D6D1C8", text: INK };

/**
 * Get the color swatch for a single note name. Matches on substring so
 * "Damask Rose," "Bulgarian Rose," and "Rose Absolute" all bucket into
 * dusty rose. More-specific categories are checked before more-general
 * ones, so "sandalwood" hits warm-sand instead of generic-wood. Falls
 * back to warm stone if no category keyword matches.
 *
 * Case-insensitive, trims whitespace.
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

// Muted, vintage-apothecary swatches for fragrance families and notes.
//
// Design intent: every pill should look like it lives in the Spritz world
// (cream + ink + emerald + brass + periwinkle), not like an Easter
// pastel pulled from a Tailwind chart. Earlier pass used Tailwind-100
// pastels at L≈92% — visually loud against the warm cream page and
// reused only ~10 distinct tones across the catalog. This pass uses ~35
// distinct hues at L≈70–82%, slightly desaturated and warm-shifted to
// match the vintage feel: dusty rose for rose, walnut for oud, mocha
// for coffee, seafoam for marine, terracotta for cinnamon, etc.
//
// Contrast: ink (#2C2420) has luminance ≈ 0.02. Every swatch below
// targets L = 0.30–0.55, giving contrast ratios of 5:1 to 9:1 against
// ink text — past the WCAG AA threshold (4.5:1) with safety margin
// for older eyes and glare. The two darkest swatches (mossy umber and
// charcoal smoke at L≈0.30) were spot-checked at 5.08:1 minimum.
//
// Granularity: notes are bucketed into ~35 categories instead of the
// previous ~10. So rose, jasmine, violet, iris, and tuberose each get
// their own tone instead of all collapsing to "pink." Catalogs with
// hundreds of distinct notes finally read as varied instead of
// repetitive. Family swatches pull the most representative note tone
// from their category (citrus → bright citrus yellow, woody → warm
// sand, etc.) so a fragrance's family pill harmonizes with its notes.

const INK = "#2C2420";

export interface Swatch {
  /** Background color — muted vintage tone at L≈70–82%. */
  bg: string;
  /** Text color — always ink, verified ≥5:1 contrast against bg. */
  text: string;
}

// ----- Family swatches -----
// One color per canonical family slug (lib/families.ts FAMILY_ORDER).
// Each pulled from the most representative note tone in that family.

const FAMILY_SWATCH: Record<string, Swatch> = {
  citrus: { bg: "#E8D687", text: INK }, // muted golden citrus
  floral: { bg: "#D5A5A5", text: INK }, // dusty rose
  fruity: { bg: "#D9A88E", text: INK }, // muted peach
  green: { bg: "#A8B89A", text: INK }, // sage
  aromatic: { bg: "#A6A883", text: INK }, // olive sage
  spicy: { bg: "#C39280", text: INK }, // muted terracotta
  woody: { bg: "#C8B198", text: INK }, // warm sand
  oriental: { bg: "#B59676", text: INK }, // muted bronze
  amber: { bg: "#D4B789", text: INK }, // muted honey
  leather: { bg: "#A89077", text: INK }, // tobacco brown
  musky: { bg: "#D5C8B8", text: INK }, // muted bone
  gourmand: { bg: "#C9A878", text: INK }, // muted toffee
  aquatic: { bg: "#A8BFBA", text: INK }, // muted seafoam
  ozonic: { bg: "#B8C5CC", text: INK }, // muted sky
  synthetic: { bg: "#9A95B0", text: INK }, // muted slate-lavender
  chypre: { bg: "#A89580", text: INK }, // sage-umber
  fougere: { bg: "#A8A5BC", text: INK }, // dusty lavender-blue
  other: { bg: "#C5BDB0", text: INK }, // warm stone
};

const FAMILY_FALLBACK: Swatch = { bg: "#C5BDB0", text: INK };

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
    swatch: { bg: "#E8D687", text: INK }, // muted golden
  },
  {
    // Sweet citrus — orange, mandarin, tangerine, neroli
    keywords: [
      "orange", "mandarin", "tangerine", "neroli", "petitgrain", "clementine",
    ],
    swatch: { bg: "#E0B58F", text: INK }, // muted apricot
  },
  {
    // Tart citrus — grapefruit, yuzu
    keywords: ["grapefruit", "yuzu", "pomelo"],
    swatch: { bg: "#D6D38C", text: INK }, // muted pale lime
  },

  // --- Florals (5 distinct tones) ---
  {
    // Rose — the canonical pink floral
    keywords: ["rose"],
    swatch: { bg: "#D5A5A5", text: INK }, // dusty rose
  },
  {
    // White florals — jasmine, tuberose, gardenia, magnolia
    keywords: [
      "jasmine", "tuberose", "gardenia", "magnolia", "frangipani",
      "honeysuckle", "champaca",
    ],
    swatch: { bg: "#E5D3CB", text: INK }, // ivory blush
  },
  {
    // Ylang, lily, lotus — exotic floral
    keywords: ["ylang", "lily", "lotus", "orchid"],
    swatch: { bg: "#DDC8B8", text: INK }, // muted champagne
  },
  {
    // Iris / violet / orris — powdery floral
    keywords: ["iris", "orris", "violet", "heliotrope", "mimosa"],
    swatch: { bg: "#B8A5C4", text: INK }, // dusty lavender
  },
  {
    // Soft pink florals — peony, freesia, geranium, carnation
    keywords: [
      "peony", "freesia", "geranium", "carnation", "hyacinth",
      "narcissus", "cyclamen",
    ],
    swatch: { bg: "#D4B5B8", text: INK }, // muted blush
  },

  // --- Fruity (4 distinct tones) ---
  {
    // Berries — raspberry, strawberry, blackcurrant
    keywords: [
      "berry", "raspberry", "strawberry", "blackcurrant", "cassis",
      "blueberry", "cherry",
    ],
    swatch: { bg: "#B58895", text: INK }, // muted plum
  },
  {
    // Stone fruit — peach, apricot, plum
    keywords: ["peach", "apricot", "plum", "nectarine"],
    swatch: { bg: "#D9A88E", text: INK }, // muted peach
  },
  {
    // Orchard fruit — apple, pear, quince, fig
    keywords: ["apple", "pear", "quince", "fig", "pomegranate"],
    swatch: { bg: "#C5BCA0", text: INK }, // muted celadon
  },
  {
    // Tropical — mango, passion fruit, lychee, melon, pineapple
    keywords: [
      "mango", "passion fruit", "lychee", "melon", "watermelon",
      "pineapple", "papaya", "tropical", "grape", "rhubarb",
    ],
    swatch: { bg: "#D49A95", text: INK }, // muted coral
  },

  // --- Green / aromatic (4 distinct tones) ---
  {
    // Green leafy — tea, leaves, grass, galbanum, fig leaf
    keywords: [
      "tea", "leaf", "leaves", "grass", "galbanum", "ivy", "tomato",
      "cannabis", "bamboo", "green",
    ],
    swatch: { bg: "#A8B89A", text: INK }, // sage
  },
  {
    // Mint — distinct from herbs
    keywords: ["mint", "peppermint", "spearmint"],
    swatch: { bg: "#A5C2B0", text: INK }, // muted seafoam-green
  },
  {
    // Aromatic herbs — basil, sage, thyme, rosemary, anise
    keywords: [
      "basil", "sage", "thyme", "rosemary", "oregano", "fennel",
      "anise", "tarragon", "coriander", "dill", "chamomile",
    ],
    swatch: { bg: "#A6A883", text: INK }, // olive sage
  },
  {
    // Lavender — its own thing, neither herb nor floral exactly
    keywords: ["lavender"],
    swatch: { bg: "#A8A5BC", text: INK }, // dusty lavender-blue
  },

  // --- Spicy (3 distinct tones) ---
  {
    // Warm spice — cinnamon, clove, nutmeg
    keywords: ["cinnamon", "clove", "nutmeg", "allspice", "pimento"],
    swatch: { bg: "#C39280", text: INK }, // muted terracotta
  },
  {
    // Sharp spice — pepper, cardamom, juniper
    keywords: ["pepper", "cardamom", "juniper", "cumin"],
    swatch: { bg: "#B88575", text: INK }, // muted rust
  },
  {
    // Exotic spice — saffron, ginger
    keywords: ["saffron", "ginger", "spice"],
    swatch: { bg: "#C9A77F", text: INK }, // muted ochre
  },

  // --- Gourmand (4 distinct tones) ---
  {
    // Vanilla — its own thing
    keywords: ["vanilla", "tonka", "bean"],
    swatch: { bg: "#E2D2B5", text: INK }, // muted cream
  },
  {
    // Chocolate, coffee — bitter sweet
    keywords: ["chocolate", "cocoa", "coffee", "espresso"],
    swatch: { bg: "#A89280", text: INK }, // muted mocha
  },
  {
    // Caramel, honey, sugar — golden sweet
    keywords: [
      "caramel", "honey", "sugar", "praline", "candy", "marshmallow",
      "cotton candy", "rum", "whiskey", "liqueur",
    ],
    swatch: { bg: "#C9A878", text: INK }, // muted toffee
  },
  {
    // Nuts, almond, coconut, cream
    keywords: [
      "almond", "nut", "hazelnut", "pistachio", "coconut", "cream",
      "milk", "biscuit", "cake",
    ],
    swatch: { bg: "#C5A589", text: INK }, // muted hazelnut
  },

  // --- Resin / amber / oriental (2 distinct tones) ---
  {
    // Amber — warm golden resin
    keywords: ["amber", "labdanum", "benzoin", "balsam"],
    swatch: { bg: "#D4B789", text: INK }, // muted honey
  },
  {
    // Incense, myrrh, frankincense — smoky resin
    keywords: [
      "incense", "frankincense", "myrrh", "opoponax", "elemi",
      "styrax", "resin", "olibanum",
    ],
    swatch: { bg: "#B59676", text: INK }, // muted bronze
  },

  // --- Smoky / leather / tobacco (3 distinct tones) ---
  {
    // Leather, suede — warm hide
    keywords: ["leather", "suede"],
    swatch: { bg: "#A89077", text: INK }, // tobacco brown
  },
  {
    // Tobacco, hay — dried golden
    keywords: ["tobacco", "hay", "straw"],
    swatch: { bg: "#B89F7B", text: INK }, // muted golden tobacco
  },
  {
    // Smoke, burnt, tar — dark ash
    keywords: ["smoke", "smoky", "burnt", "tar", "rubber", "asphalt"],
    swatch: { bg: "#A09790", text: INK }, // muted ash
  },

  // --- Woody (3 distinct tones) ---
  {
    // Soft woods — sandalwood, cedar, rosewood
    keywords: [
      "sandalwood", "cedar", "rosewood", "cypress", "pine", "fir",
      "birch", "oak", "papyrus",
    ],
    swatch: { bg: "#C8B198", text: INK }, // warm sand
  },
  {
    // Dark woods — oud, agarwood, ebony
    keywords: ["oud", "agarwood", "ebony", "guaiac"],
    swatch: { bg: "#A89377", text: INK }, // muted walnut
  },
  {
    // Earthy wood — vetiver, patchouli
    keywords: ["vetiver", "patchouli"],
    swatch: { bg: "#9A9580", text: INK }, // muted moss-brown
  },
  {
    // Generic "wood" catchall — must come AFTER specific wood types
    // so "sandalwood" hits warm sand, not generic.
    keywords: ["wood", "woody"],
    swatch: { bg: "#C8B198", text: INK }, // warm sand (same as soft woods)
  },

  // --- Aquatic / ozonic / marine (2 distinct tones) ---
  {
    // Marine / sea / salt — deeper aquatic
    keywords: [
      "marine", "sea", "ocean", "water", "aquatic", "salt", "seaweed",
      "algae",
    ],
    swatch: { bg: "#A8BFBA", text: INK }, // muted seafoam
  },
  {
    // Ozonic / air / rain — lighter, sky-toned
    keywords: ["ozonic", "ozone", "rain", "air", "atmosphere", "cloud"],
    swatch: { bg: "#B8C5CC", text: INK }, // muted sky
  },

  // --- Musk / animalic / powdery (2 distinct tones) ---
  {
    // Musk, ambergris — soft skin musk
    keywords: ["musk", "ambergris", "civet", "castoreum", "hyrax", "skin"],
    swatch: { bg: "#D5C8B8", text: INK }, // muted bone
  },
  {
    // Powdery — orris, talc, makeup-adjacent
    keywords: ["powder", "powdery", "talc", "cosmetic"],
    swatch: { bg: "#D4B5B8", text: INK }, // muted blush
  },

  // --- Mossy / earthy ---
  {
    keywords: [
      "oakmoss", "moss", "treemoss", "earth", "soil", "mushroom",
      "truffle", "humus", "petrichor",
    ],
    swatch: { bg: "#A89580", text: INK }, // sage-umber
  },

  // --- Synthetic / molecular ---
  {
    keywords: [
      "ambroxan", "iso e super", "javanol", "cashmeran", "norlimbanol",
      "calone", "ethyl maltol", "ambrox", "molecule",
    ],
    swatch: { bg: "#9A95B0", text: INK }, // muted slate-lavender
  },
];

const NOTE_FALLBACK: Swatch = { bg: "#C5BDB0", text: INK };

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

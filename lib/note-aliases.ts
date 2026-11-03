// Canonical + spelling aliases for the note lookup RPC.
//
// The catalog stores notes exactly as Fragrantica publishes them:
// trademark suffixes, spelling variants, parenthetical qualifiers, and
// multi-name synonyms. The find_fragrances_by_note RPC does an
// exact-match on lower(name), so any slug that doesn't map 1:1 to a
// stored name returns zero rows and the /note/[slug] page 404s.
//
// This map + the smart candidate loop in app/note/[slug]/page.tsx
// resolves the top offenders without needing a DB migration:
//
//   1. Route calls resolveNoteQueries(slug) to get an ordered list of
//      candidate DB names.
//   2. Route calls the RPC for each candidate in sequence, unions the
//      results, dedupes by fragrance id.
//   3. If EVERY candidate returns nothing AND there's no editorial file
//      for the slug, the route shows a soft 404 (not a hard notFound()).
//
// Generated from the note-coverage SQL audit (top 900+ notes ranked by
// fragrance count). Entries below cover: (a) trademark-suffixed notes,
// (b) confirmed scraper spelling errors, (c) the same name stored with
// different spacing or punctuation.
//
// To add a new alias: pick the URL slug as the key; put every catalog
// name that should feed into it as the value array (with the "primary"
// name first so the RPC hits it first for the most-populous match).

/**
 * Given a URL slug (already normalized by noteSlug), return an ordered
 * list of catalog note names to try in the RPC. First entry hit that
 * returns rows wins for editorial matching, but ALL entries get
 * unioned into the fragrance list so the page shows every variant
 * side-by-side.
 */
export function resolveNoteQueries(slug: string, editorialName?: string): string[] {
  // Start with the editorial's canonical name (if we have one), then
  // the slug's natural form (spaces instead of hyphens).
  const natural = slug.replace(/-/g, " ");
  const seed = editorialName ?? natural;
  const explicit = NOTE_ALIASES[slug];

  const candidates: string[] = [];
  candidates.push(seed);
  if (seed !== natural) candidates.push(natural);
  // Trademark-suffixed variants — catches ambrofix→ambrofix™, orcanox→
  // orcanox™, etc. Cheap to try, high hit rate.
  candidates.push(`${seed}™`);
  candidates.push(`${seed}®`);
  if (seed !== natural) {
    candidates.push(`${natural}™`);
    candidates.push(`${natural}®`);
  }
  if (explicit) candidates.push(...explicit);

  // Dedupe (case-insensitive) while preserving order.
  const seen = new Set<string>();
  return candidates.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Hand-curated aliases. Keyed by URL slug (post noteSlug()). Values are
 * catalog names to try after the automatic seed+trademark candidates.
 *
 * Categories:
 *   - Spelling corrections: scraper picked up Fragrantica typos like
 *     "vanila", "myrhh". Slug is the correct spelling; alias is what's
 *     actually in the DB.
 *   - Same-name variants: the same note stored with different spacing,
 *     hyphens or a parenthetical. NOT synonyms: different words are
 *     different notes with their own pages (see the rule below).
 *   - Bracket-suffix variants: "agarwood (oud)" style, where the slug
 *     collapses parens away.
 */
export const NOTE_ALIASES: Record<string, string[]> = {
  // Rule (2026-11-03): an alias only merges names that are the SAME note
  // written differently: a trademark mark, spacing or hyphens, a
  // parenthetical that repeats the name ("agarwood (oud)"), or a catalog
  // typo. Different words are different notes and get their own pages,
  // even near-synonyms. Before this, /note/frankincense showed Incense,
  // orris folded into Iris, olibanum into Frankincense, cassis into
  // Blackcurrant, the regional vanillas/cedars/sandalwoods/vetivers into
  // the plain note, and so on. If two notes should share a page, that is
  // an editorial decision to make on purpose, not an alias.

  // --- Trademark-suffixed synthetics (the auto ™/® appender covers
  //     these too; listed so the ™ variant is tried first) ---
  ambrofix: ["ambrofix™"],
  orcanox: ["orcanox™"],
  ambrostar: ["ambrostar™"],
  ambermax: ["ambermax™"],
  pepperwood: ["pepperwood™"],
  norlimbanol: ["norlimbanol™"],
  nympheal: ["nympheal™"],
  habanolide: ["habanolide®"],
  physcool: ["physcool®"],
  suederal: ["suederal®"],
  velvione: ["velvione™"],
  tonquitone: ["tonquitone™"],
  lilybelle: ["lilybelle®"],
  cocoapulse: ["cocoapulse™"],
  cosmofruit: ["cosmofruit™", "cosmofruit™ (iff)"],
  z11: ["z11™"],
  "ambrox-super": ["ambrox® super", "ambrox super"],

  // --- Same name, different spacing / hyphenation / parenthetical ---
  oud: ["oud", "agarwood (oud)"],
  agarwood: ["agarwood", "agarwood (oud)"],
  "agarwood-oud": ["agarwood (oud)"],
  oakmoss: ["oakmoss", "oak moss"],
  "oak-moss": ["oak moss", "oakmoss"],
  "ylang-ylang": ["ylang-ylang", "ylang ylang"],
  "lily-of-the-valley": ["lily-of-the-valley", "lily of the valley"],
  "black-currant": ["black currant", "blackcurrant"],
  blackcurrant: ["blackcurrant", "black currant"],

  // --- Catalog typos (Fragrantica spellings), both directions ---
  vanila: ["vanila", "vanilla"],
  vanilla: ["vanilla", "vanila"],
  myrhh: ["myrhh", "myrrh"],
  myrrh: ["myrrh", "myrhh"],
  sandalowood: ["sandalowood", "sandalwood"],
  sandalwood: ["sandalwood", "sandalowood"],
  vetyver: ["vetyver", "vetiver"],
  vetiver: ["vetiver", "vetyver"],
  cardamon: ["cardamon", "cardamom"],
  cardamom: ["cardamom", "cardamon"],
  cinammon: ["cinammon", "cinnamon"],
  cinnamon: ["cinnamon", "cinammon"],
  hiacynth: ["hiacynth", "hyacinth"],
  hyacinth: ["hyacinth", "hiacynth"],
  rhuburb: ["rhuburb", "rhubarb"],
  rhubarb: ["rhubarb", "rhuburb"],
  graperfuit: ["graperfuit", "grapefruit"],
  grapefruit: ["grapefruit", "graperfuit"],
  marshamallow: ["marshamallow", "marshmallow"],
  marshmallow: ["marshmallow", "marshamallow"],
  "coton-candy": ["coton candy", "cotton candy"],
  "cotton-candy": ["cotton candy", "coton candy"],

  // --- Stored names whose punctuation the slug drops ---
  "ambrette-musk-mallow": ["ambrette (musk mallow)"],
  "carambola-star-fruit": ["carambola (star fruit)"],
  "buchu-or-agathosma": ["buchu or agathosma"],
  "cypriol-oil-or-nagarmotha": ["cypriol oil or nagarmotha"],
  "lime-linden-blossom": ["lime (linden blossom)", "lime (linden) blossom"],
  "mastic-or-lentisque": ["mastic or lentisque"],
  "nard-himalayan-jatamansi": ["nard himalayan (jatamansi)"],
  "pepperwood-or-hercules-club": ["pepperwood or hercules club"],
  "erigeron-fleabane": ["erigeron (fleabane)"],
  "quandong-desert-peach": ["quandong, desert peach"],
  "ishpink-ocotea-quixos": ["ishpink, ocotea quixos"],
  "confetti-sugared-almonds": ["confetti (sugared almonds)"],
  "beer-ale": ["beer/ale"],
  "donut-or-doughnut": ["donut or doughnut"],
  "frosting-glac": ["frosting [glacé]"],
  "champagne-ros": ["champagne rosé"],
  "ac-cia": ["acácia"],
  "cacha-a": ["cachaça"],
  "drag-e": ["dragée"],
  "pi-a-colada": ["piña colada"],
  "caff-latte": ["caffè latte"],
  "foug-re-accord": ["fougère accord"],
  "s-mores": ["strawberry s'mores"],
  "priest-s-clothes": ["priest's clothes"],
  "dyer-s-greenweed": ["dyer's greenweed"],
};

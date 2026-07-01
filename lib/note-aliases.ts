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
// (b) confirmed scraper spelling errors, (c) canonical synonyms where
// multiple names refer to the same molecule/material.
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
 *   - Canonical synonyms: same material stored under multiple names.
 *     Slug is what the user is most likely to type; aliases cover the
 *     other stored variants.
 *   - Bracket-suffix variants: "agarwood (oud)" style, where the slug
 *     collapses parens away.
 */
export const NOTE_ALIASES: Record<string, string[]> = {
  // --- Trademark-suffixed synthetics (already handled by the auto ™
  //     appender, but list explicitly for the common cases so the RPC
  //     hits the ™ variant FIRST for these known trademarks) ---
  ambrofix: ["ambrofix™", "ambroxan"],
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

  // --- Canonical synonyms (same material, multiple stored names) ---
  oud: ["agarwood (oud)", "oud", "agarwood"],
  agarwood: ["agarwood (oud)", "agarwood", "oud"],
  "agarwood-oud": ["agarwood (oud)", "oud", "agarwood"],
  ambroxan: ["ambroxan", "ambrofix™", "cetalox", "ambrox", "ambroxide"],
  oakmoss: ["oakmoss", "oak moss", "moss"],
  "oak-moss": ["oak moss", "oakmoss", "moss"],
  tonka: ["tonka bean", "tonka"],
  "tonka-bean": ["tonka bean", "tonka"],
  orris: ["orris", "orris root", "iris"],
  "orris-root": ["orris root", "orris"],
  frankincense: ["frankincense", "olibanum"],
  olibanum: ["olibanum", "frankincense"],
  vetiver: ["vetiver", "vetyver", "haitian vetiver", "bourbon vetiver"],
  "ylang-ylang": ["ylang-ylang", "ylang ylang"],
  vanilla: ["vanilla", "vanille", "bourbon vanilla", "madagascar vanilla", "tahitian vanilla"],
  "lily-of-the-valley": ["lily-of-the-valley", "lily of the valley"],
  cedar: ["cedar", "cedarwood", "virginia cedar", "atlas cedar"],
  cedarwood: ["cedarwood", "cedar", "virginia cedar"],
  sandalwood: ["sandalwood", "sandalowood", "australian sandalwood", "mysore sandalwood"],
  "black-currant": ["black currant", "blackcurrant", "cassis"],
  blackcurrant: ["blackcurrant", "black currant", "cassis"],
  cassis: ["cassis", "blackcurrant", "black currant"],

  // --- Spelling variants confirmed in the audit ---
  vanila: ["vanila", "vanilla"],
  myrhh: ["myrhh", "myrrh"],
  sandalowood: ["sandalowood", "sandalwood"],
  vetyver: ["vetyver", "vetiver"],
  cardamon: ["cardamon", "cardamom"],
  cinammon: ["cinammon", "cinnamon"],
  hiacynth: ["hiacynth", "hyacinth"],
  rhuburb: ["rhuburb", "rhubarb"],
  graperfuit: ["graperfuit", "grapefruit"],
  marshamallow: ["marshamallow", "marshmallow"],
  "coton-candy": ["coton candy", "cotton candy"],

  // --- Bracket-suffix variants where slug drops the paren ---
  "ambrette-musk-mallow": ["ambrette (musk mallow)", "ambrette"],
  "carambola-star-fruit": ["carambola (star fruit)", "carambola"],
  "buchu-or-agathosma": ["buchu or agathosma", "buchu"],
  "cypriol-oil-or-nagarmotha": ["cypriol oil or nagarmotha", "cypriol", "nagarmotha"],
  "lime-linden-blossom": ["lime (linden blossom)", "lime (linden) blossom", "linden blossom"],
  "mastic-or-lentisque": ["mastic or lentisque", "mastic"],
  "nard-himalayan-jatamansi": ["nard himalayan (jatamansi)", "nard", "jatamansi"],
  "pepperwood-or-hercules-club": ["pepperwood or hercules club", "pepperwood"],
  "erigeron-fleabane": ["erigeron (fleabane)", "erigeron"],
  "quandong-desert-peach": ["quandong, desert peach", "quandong"],
  "ishpink-ocotea-quixos": ["ishpink, ocotea quixos", "ishpink"],
  "confetti-sugared-almonds": ["confetti (sugared almonds)"],
  "beer-ale": ["beer/ale"],
  "donut-or-doughnut": ["donut or doughnut", "donut"],
  "frosting-glac": ["frosting [glacé]", "frosting"],
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

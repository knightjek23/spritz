// Second-pass resolver for data/scent-research.json entries the name+house
// matcher (lib/trending/join.ts) misses. Pure: no Supabase, no network.
//
// Why the first pass misses (measured on the 2026-10-31 run, 122 of 258
// unmatched):
//   1. Fragrantica prefixes many names with the house: the catalog row is
//      "Emporio Armani Stronger With You", "Versace Pour Homme Dylan Blue",
//      "Prada Paradoxe", while editorial sources write "Stronger With You".
//   2. Concentration and year suffixes differ: "Grey Vetiver Eau de Parfum"
//      vs "Grey Vetiver", "Ombre Leather" vs "Ombre Leather (2018)".
//   3. Accents and symbols: "Acqua di Giò" vs "Acqua di Gio", "N°5" vs "No 5".
//   4. About 40 entries are indie houses the scraper never collected. Those
//      are not in the catalog at all and correctly stay unmatched.
//
// The resolver looks the entry up in the scraper's per-house URL lists
// (scraper/data/house-fragrances/*.json, the same lists the catalog was
// scraped from) and returns the Fragrantica perfume id. The caller then
// finds the catalog row by that id, which is exact.
//
// Two tiers, strictest first:
//   T1  names equal after accent folding and removing the house name.
//   T2  also ignoring concentration words, 4-digit years and the
//       "Replica" line prefix.
// Ties inside a tier go to the most-voted URL (the flagship).

export interface HouseUrl {
  url: string;
  votes?: number | null;
}

export interface Resolved {
  fragranticaId: string;
  url: string;
  tier: 1 | 2;
}

const STOP = new Set(["de", "di", "la", "le", "les", "of", "the", "and", "du", "des", "et"]);
const CONCENTRATION = new Set([
  "eau", "de", "parfum", "toilette", "extrait", "edp", "edt", "perfume",
]);
const LINE_PREFIX = new Set(["replica"]);

// House spellings that share no token with Fragrantica's folder for them.
const HOUSE_ALIASES: Record<string, string[]> = {
  "emporio armani": ["giorgio armani"],
  armani: ["giorgio armani"],
  "maison margiela": ["maison martin margiela"],
  "paco rabanne": ["rabanne"],
  "christian dior": ["dior"],
  kilian: ["by kilian"],
};

export function fold(s: string): string {
  return s
    .replace(/n°\s*/gi, "no ")
    .replace(/&/g, " and ")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function tokens(s: string): string[] {
  return fold(s).split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Folder name ("Maison-Martin-Margiela") -> "maison martin margiela".
 * Runs of single letters join up, so "D.S. & Durga" and the folder
 * "DS-Durga" both read "ds durga".
 */
export function houseKey(s: string): string {
  return tokens(s)
    .filter((t) => t !== "and")
    .join(" ")
    .replace(/\b([a-z0-9]) (?=[a-z0-9]\b)/g, "$1");
}

/** Which house folders a research house maps to. */
export function houseFolders(house: string, folders: string[]): string[] {
  const keys = [houseKey(house), ...(HOUSE_ALIASES[houseKey(house)] ?? [])];
  const out = new Set<string>();
  for (const f of folders) {
    const fk = houseKey(f);
    if (keys.includes(fk)) out.add(f);
  }
  return [...out];
}

/** Remove the house from a name: affixes fully, "by <house>" and significant house words anywhere. */
function stripHouse(words: string[], houseWords: Set<string>): string[] {
  const w = [...words];
  while (w.length > 1 && houseWords.has(w[0])) w.shift();
  while (w.length > 1 && houseWords.has(w[w.length - 1])) w.pop();
  // Fragrantica's "for him" / "for her" right after the house prefix
  // ("Narciso Rodriguez for Him Bleu Noir").
  if (w.length > 2 && w[0] === "for" && (w[1] === "him" || w[1] === "her") && words.length !== w.length) {
    w.splice(0, 2);
  }
  const out: string[] = [];
  for (let i = 0; i < w.length; i++) {
    const t = w[i];
    if (houseWords.has(t) && !STOP.has(t) && w.length > 1) {
      if (out[out.length - 1] === "by") out.pop();
      continue;
    }
    out.push(t);
  }
  return out.length ? out : w;
}

function canon(name: string, houseWords: Set<string>, tier: 1 | 2): string {
  let w = stripHouse(tokens(name), houseWords);
  if (tier === 2) {
    w = w.filter((t) => !CONCENTRATION.has(t) && !/^(19|20)\d\d$/.test(t));
    while (w.length > 1 && LINE_PREFIX.has(w[0])) w.shift();
  }
  return w.join(" ");
}

function slugOf(url: string): { name: string; id: string } | null {
  const m = url.match(/\/perfume\/[^/]+\/(.+)-(\d+)\.html$/);
  return m ? { name: m[1].replace(/-/g, " "), id: m[2] } : null;
}

/**
 * Resolve one research entry against the URL lists of its house folder(s).
 * Returns null when nothing matches at either tier.
 */
export function resolveResearchEntry(
  entry: { name: string; house: string },
  lists: Record<string, HouseUrl[]>,
): Resolved | null {
  const folders = houseFolders(entry.house, Object.keys(lists));
  if (folders.length === 0) return null;
  const houseWords = new Set([
    ...tokens(entry.house),
    ...folders.flatMap((f) => tokens(f)),
  ]);
  houseWords.delete("and");

  for (const tier of [1, 2] as const) {
    const want = canon(entry.name, houseWords, tier);
    if (!want) continue;
    let best: { url: string; id: string; votes: number } | null = null;
    for (const f of folders) {
      for (const u of lists[f]) {
        const s = slugOf(u.url);
        if (!s || canon(s.name, houseWords, tier) !== want) continue;
        const votes = u.votes ?? 0;
        if (!best || votes > best.votes) best = { url: u.url, id: s.id, votes };
      }
    }
    if (best) return { fragranticaId: best.id, url: best.url, tier };
  }
  return null;
}

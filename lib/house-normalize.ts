// House-name normalization for trending-feed → catalog matching.
//
// The problem: trending feeds (especially google_trends) carry house
// names in whatever form the source used — often community abbreviations
// like "MFK" or "YSL". The catalog stores canonical full names
// ("Maison Francis Kurkdjian", "Yves Saint Laurent"). The fuzzy match
// RPC scores 0.65 * name_similarity + 0.35 * house_similarity against a
// 0.85 cutoff, so an abbreviated house drags a perfect name match down
// to ~0.65 and the entry silently fails to join — no catalog id, so the
// card renders unclickable with a placeholder instead of the bottle.
//
// Normalizing the house before the RPC restores the 0.35 house weight
// and lets these entries match. Safe on client and server.
//
// Keys are lowercased/trimmed for lookup; add new aliases as feeds
// surface them (scripts/audit-trending-matches.md explains how to find
// unmatched entries).

const HOUSE_NAME_ALIASES: Record<string, string> = {
  mfk: "Maison Francis Kurkdjian",
  fk: "Maison Francis Kurkdjian",
  ysl: "Yves Saint Laurent",
  tf: "Tom Ford",
  pdm: "Parfums de Marly",
  mmm: "Maison Margiela",
  "maison martin margiela": "Maison Margiela",
  adp: "Acqua di Parma",
  cdg: "Comme des Garçons",
  "comme des garcons": "Comme des Garçons",
  jpg: "Jean Paul Gaultier",
  dg: "Dolce & Gabbana",
  "d&g": "Dolce & Gabbana",
  "dolce and gabbana": "Dolce & Gabbana",
  ck: "Calvin Klein",
  ariana: "Ariana Grande",
  vc: "Viktor & Rolf",
  "viktor and rolf": "Viktor & Rolf",
  lv: "Louis Vuitton",
  ilm: "Initio Parfums Prives",
  initio: "Initio Parfums Prives",
  bdk: "BDK Parfums",
  xerjoff: "Xerjoff",
  moo: "By Kilian",
  kilian: "By Kilian",
  "le labo": "Le Labo",
  mugler: "Mugler",
  "thierry mugler": "Mugler",
  ga: "Giorgio Armani",
  armani: "Giorgio Armani",
};

/**
 * Normalize a feed house name to its canonical catalog form. Returns the
 * input unchanged (trimmed) when no alias applies, so full names pass
 * through untouched.
 */
export function normalizeHouseName(house: string | null | undefined): string {
  if (!house) return "";
  const key = house.trim().toLowerCase();
  return HOUSE_NAME_ALIASES[key] ?? house.trim();
}

// Season inference from accords. Pure.
//
// fragrances.season_tags was never populated (0 of the top 300 on the
// 2026-10-31 audit), so for seasonal picks this is the primary source, with
// the research file's seasonal lists layered on top. A stored season_tags
// value, if one ever exists, always wins over inference (lib/discovery/lists).
//
// `family` holds raw accord strings in dominance order ("citrus", "aromatic",
// "fresh spicy", ...). Each known accord votes for seasons and earlier
// accords count much more (weight 1, 0.56, 0.38, 0.29...). A fragrance gets
// its best season, plus its second-best if that scores at least 60% of the
// best: never more than two, so the seasonal lists stay seasonal (first audit
// with no cap put Bleu de Chanel and Le Male in all four). Unknown accords
// vote for nothing, and a fragrance with no known accords gets no season at
// all: it never guesses. "aromatic" votes evenly because it marks winter
// fougeres (Le Male) as often as summer fresh scents.

import type { Season } from "./season";

type Vote = readonly [spring: number, summer: number, fall: number, winter: number];

const V: Record<string, Vote> = {
  citrus: [2, 3, 0, 0],
  aquatic: [1, 3, 0, 0],
  marine: [1, 3, 0, 0],
  ozonic: [1, 3, 0, 0],
  salty: [0, 3, 0, 0],
  tropical: [0, 3, 0, 0],
  coconut: [0, 3, 0, 0],
  fresh: [2, 2, 0, 0],
  "fresh spicy": [1, 2, 1, 0],
  green: [3, 2, 0, 0],
  herbal: [2, 2, 0, 0],
  aromatic: [1, 1, 1, 1],
  mint: [1, 3, 0, 0],
  lavender: [2, 1, 1, 0],
  fruity: [2, 2, 0, 0],
  floral: [3, 1, 0, 0],
  "white floral": [2, 2, 0, 0],
  "yellow floral": [2, 2, 0, 0],
  rose: [3, 0, 1, 0],
  "soft floral": [3, 1, 0, 0],
  powdery: [2, 0, 1, 1],
  iris: [2, 0, 1, 1],
  violet: [2, 0, 1, 1],
  aldehydic: [1, 0, 1, 1],
  musky: [1, 1, 1, 1],
  woody: [1, 1, 2, 1],
  "dry woody": [0, 1, 2, 1],
  "woody floral": [2, 0, 1, 0],
  earthy: [0, 0, 2, 1],
  mossy: [0, 0, 2, 1],
  chypre: [1, 0, 2, 1],
  fougere: [1, 0, 2, 1],
  patchouli: [0, 0, 3, 2],
  "warm spicy": [0, 0, 3, 3],
  spicy: [0, 0, 2, 2],
  cinnamon: [0, 0, 3, 3],
  amber: [0, 0, 2, 3],
  oriental: [0, 0, 2, 3],
  balsamic: [0, 0, 2, 3],
  resinous: [0, 0, 2, 3],
  incense: [0, 0, 2, 3],
  oud: [0, 0, 2, 3],
  leather: [0, 0, 3, 3],
  animalic: [0, 0, 2, 3],
  smoky: [0, 0, 3, 3],
  tobacco: [0, 0, 3, 3],
  vanilla: [0, 0, 2, 3],
  sweet: [0, 0, 2, 3],
  gourmand: [0, 0, 2, 3],
  honey: [0, 0, 2, 3],
  caramel: [0, 0, 2, 3],
  chocolate: [0, 0, 2, 3],
  almond: [0, 0, 2, 2],
  coffee: [0, 0, 2, 2],
  rum: [0, 0, 2, 3],
  boozy: [0, 0, 2, 3],
  // Added after the 2026-10-31 audit's unknown-accord list.
  "soft spicy": [1, 0, 2, 2],
  lactonic: [1, 0, 2, 2],
  nutty: [0, 0, 3, 2],
  tuberose: [2, 2, 0, 0],
  metallic: [1, 1, 1, 1],
  cacao: [0, 0, 2, 3],
  cherry: [1, 0, 2, 2],
  camphor: [1, 1, 1, 1],
  mineral: [1, 2, 0, 0],
  bitter: [1, 1, 1, 0],
  anis: [0, 0, 2, 2],
  cannabis: [0, 0, 2, 1],
};

const SEASONS: Season[] = ["spring", "summer", "fall", "winter"];
const MAX_ACCORDS = 6;
const SECOND_RATIO = 0.6;
const DECAY = 0.8;

export function inferSeasons(accords: string[] | null | undefined): Season[] {
  const totals = [0, 0, 0, 0];
  let known = 0;
  (accords ?? []).slice(0, MAX_ACCORDS).forEach((raw, i) => {
    const vote = V[raw.trim().toLowerCase()];
    if (!vote) return;
    known++;
    const w = 1 / (1 + DECAY * i);
    for (let s = 0; s < 4; s++) totals[s] += vote[s] * w;
  });
  if (known === 0) return [];
  const ranked = SEASONS.map((season, s) => ({ season, score: totals[s] }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return [];
  const out = [ranked[0].season];
  if (ranked[1] && ranked[1].score >= SECOND_RATIO * ranked[0].score) out.push(ranked[1].season);
  return out;
}

/** Stored tags win; otherwise infer from accords. */
export function seasonsOf(row: { season_tags?: string[] | null; family?: string[] | null }): Season[] {
  const stored = (row.season_tags ?? []).filter((s): s is Season =>
    (SEASONS as string[]).includes(s),
  );
  return stored.length > 0 ? stored : inferSeasons(row.family);
}

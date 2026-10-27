import "server-only";

// Layering — which bottles on the user's Owned shelf pair well with one
// fragrance.
//
// A good layer is two scents that share an anchor and differ on top:
//
//   anchor       shared base notes (vanilla under both, say)         up to +0.40
//   complement   the two families are a known pairing (lib table)       +0.35
//                same family: safe but flat                             +0.10
//   lift         the partner brings new top notes                     up to +0.15
//   near-dupe    note vectors almost identical (cosine > 0.85)          −0.50
//   two loud     both project hard (sillage ≥ 7.5)                      −0.20
//
// Pairs under 0.30 are dropped; the top three are returned with a
// templated reason built only from notes both rows actually carry.
// Templated, not generated: instant, free, never invents a note.

import { cosineSimilarity } from "@/lib/dupe-engine";
import { lower, parseVector, type TasteRow } from "@/lib/taste";
import type { Fragrance, Note } from "@/lib/types";

export type LayerRow = TasteRow & Pick<Fragrance, "bottle_image_url" | "sillage_score">;

export const LAYER_COLUMNS =
  "id, name, house, family, season_tags, top_notes, mid_notes, base_notes, note_vector, bottle_image_url, sillage_score";

export interface LayerPair {
  partner: Pick<LayerRow, "id" | "name" | "house" | "bottle_image_url">;
  score: number;
  reason: string;
  sharedBase: string[];
}

/** Family pairs that read as intentional, both orders. */
const COMPLEMENTS: Array<[string, string]> = [
  ["citrus", "woody"],
  ["citrus", "musky"],
  ["citrus", "amber"],
  ["aquatic", "woody"],
  ["green", "woody"],
  ["aromatic", "woody"],
  ["aromatic", "amber"],
  ["floral", "musky"],
  ["floral", "woody"],
  ["floral", "gourmand"],
  ["fruity", "gourmand"],
  ["fruity", "musky"],
  ["gourmand", "amber"],
  ["gourmand", "woody"],
  ["gourmand", "oriental"],
  ["spicy", "amber"],
  ["spicy", "woody"],
  ["leather", "amber"],
  ["leather", "oriental"],
  ["leather", "floral"],
  ["chypre", "musky"],
  ["fougere", "citrus"],
];

function complementary(a: string[], b: string[]): { rel: "pair" | "same" | "none"; family: string | null } {
  for (const x of a) for (const y of b) if (x === y) return { rel: "same", family: x };
  for (const [p, q] of COMPLEMENTS) {
    if ((a.includes(p) && b.includes(q)) || (a.includes(q) && b.includes(p))) return { rel: "pair", family: null };
  }
  return { rel: "none", family: null };
}

function names(notes: Note[] | null | undefined): string[] {
  return (notes ?? []).map((n) => (typeof n === "string" ? n : n.name)).filter(Boolean);
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function joinNames(xs: string[]): string {
  const t = xs.map(titleCase);
  if (t.length <= 1) return t.join("");
  return `${t.slice(0, -1).join(", ")} and ${t[t.length - 1]}`;
}

export function scoreLayer(target: LayerRow, partner: LayerRow): LayerPair | null {
  if (target.id === partner.id) return null;

  const baseT = lower(names(target.base_notes));
  const baseP = new Set(lower(names(partner.base_notes)));
  const sharedBase = baseT.filter((n) => baseP.has(n));
  const anchor = Math.min(1, sharedBase.length / 2) * 0.4;

  const famT = lower(target.family);
  const famP = lower(partner.family);
  const { rel, family: sameFamily } = complementary(famT, famP);
  const complement = rel === "pair" ? 0.35 : rel === "same" ? 0.1 : 0;

  const topT = new Set(lower([...names(target.top_notes), ...names(target.mid_notes)]));
  const newTop = lower(names(partner.top_notes)).filter((n) => !topT.has(n));
  const lift = Math.min(1, newTop.length / 3) * 0.15;

  const va = parseVector(target.note_vector);
  const vb = parseVector(partner.note_vector);
  const cos = va && vb ? cosineSimilarity(va, vb) : 0;
  const dupePenalty = cos > 0.85 ? 0.5 : 0;
  const loudPenalty = (target.sillage_score ?? 0) >= 7.5 && (partner.sillage_score ?? 0) >= 7.5 ? 0.2 : 0;

  const score = anchor + complement + lift - dupePenalty - loudPenalty;
  if (score < 0.3) return null;

  const parts: string[] = [];
  if (sharedBase.length) parts.push(`Both sit on ${joinNames(sharedBase.slice(0, 2))}.`);
  if (newTop.length) parts.push(`${partner.name} adds ${joinNames(newTop.slice(0, 2))} on top.`);
  else if (rel === "pair" && famT[0] && famP[0]) parts.push(`${titleCase(famT[0])} and ${famP[0]} are a classic pairing.`);
  else if (rel === "same" && sameFamily) parts.push(`Two ${sameFamily} scents that deepen each other.`);
  if (parts.length === 0) parts.push(`A quieter partner that lets ${target.name} lead.`);

  return {
    partner: { id: partner.id, name: partner.name, house: partner.house, bottle_image_url: partner.bottle_image_url },
    score: Math.round(score * 100) / 100,
    reason: parts.slice(0, 2).join(" "),
    sharedBase: sharedBase.slice(0, 3),
  };
}

export function bestLayers(target: LayerRow, shelf: LayerRow[], top = 3): LayerPair[] {
  return shelf
    .map((p) => scoreLayer(target, p))
    .filter((x): x is LayerPair => !!x)
    .sort((a, b) => b.score - a.score || a.partner.name.localeCompare(b.partner.name))
    .slice(0, top);
}

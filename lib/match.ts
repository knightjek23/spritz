import "server-only";

// Match score — "Will I like this?" for one fragrance against the user's
// taste profile (lib/taste.ts).
//
//   score = 0.70 · note similarity   cosine(profile, fragrance), scaled so
//                                    0.6 (a very close fit for an averaged
//                                    profile) reads as 100%
//         + 0.20 · family fit        how heavily the user's shelf leans on
//                                    this fragrance's strongest family
//         + 0.10 · season fit        same, for season tags
//   − 10 points when one of the fragrance's three heaviest notes is a note
//     the user has disliked more than liked. The reason text names it.
//
// Reasons are templated from the profile, never generated: instant, free,
// and they never claim a note the data doesn't carry. Only Pro users
// receive them (the route strips them for free users).

import { profileSimilarity, noteEntries, lower, parseVector, type TasteProfile, type TasteRow } from "@/lib/taste";

export type MatchLabel = "Strong match" | "Likely a match" | "Mixed" | "Probably not for you";

export interface MatchResult {
  /** 0–100 */
  score: number;
  label: MatchLabel;
  /** One or two short sentences, Pro only. */
  reasons: string[];
  /** Notes shared with the profile, strongest first (max 3). */
  sharedNotes: string[];
  /** A disliked note that is prominent here, if any. */
  warningNote: string | null;
}

const COSINE_FULL = 0.6;

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function joinNames(xs: string[]): string {
  const t = xs.map(titleCase);
  if (t.length <= 1) return t.join("");
  if (t.length === 2) return `${t[0]} and ${t[1]}`;
  return `${t.slice(0, -1).join(", ")} and ${t[t.length - 1]}`;
}

export function labelFor(score: number): MatchLabel {
  if (score >= 75) return "Strong match";
  if (score >= 55) return "Likely a match";
  if (score >= 35) return "Mixed";
  return "Probably not for you";
}

/** Share of the profile's strongest family/season weight that `tags` reach. */
function coverage(weights: Map<string, number>, tags: string[]): number {
  if (weights.size === 0 || tags.length === 0) return 0;
  let max = 0;
  for (const w of weights.values()) if (w > max) max = w;
  if (max === 0) return 0;
  let best = 0;
  for (const t of tags) best = Math.max(best, (weights.get(t) ?? 0) / max);
  return best;
}

export function scoreMatch(profile: TasteProfile, f: TasteRow): MatchResult {
  const cos = profileSimilarity(profile, parseVector(f.note_vector));
  const noteFit = Math.min(1, Math.max(0, cos) / COSINE_FULL);
  const families = lower(f.family);
  const seasons = lower(f.season_tags);
  const famFit = coverage(profile.familyWeights, families);
  const seasonFit = coverage(profile.seasonWeights, seasons);

  let score = Math.round((0.7 * noteFit + 0.2 * famFit + 0.1 * seasonFit) * 100);

  // Notes on this fragrance, ranked by how much the user's shelf leans on them.
  const entries = noteEntries(f);
  const byName = new Map<string, number>();
  for (const [name, w] of entries) byName.set(name, Math.max(byName.get(name) ?? 0, w));
  const shared = [...byName.keys()]
    .filter((n) => (profile.noteWeights.get(n) ?? 0) > 0)
    .sort((a, b) => (profile.noteWeights.get(b) ?? 0) - (profile.noteWeights.get(a) ?? 0));

  // Heaviest three notes on the fragrance itself, for the dislike check.
  const heaviest = [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
  const warningNote = heaviest.find((n) => profile.dislikedNotes.has(n)) ?? null;
  if (warningNote) score -= 10;

  score = Math.max(5, Math.min(99, score));

  // Reasons -------------------------------------------------------------
  const reasons: string[] = [];
  let maxNote = 0;
  for (const w of profile.noteWeights.values()) if (w > maxNote) maxNote = w;
  const strong = shared.filter((n) => (profile.noteWeights.get(n) ?? 0) >= maxNote * 0.4).slice(0, 2);

  if (strong.length === 2) {
    reasons.push(`You love ${joinNames(strong)}; this is built on both.`);
  } else if (strong.length === 1) {
    reasons.push(`You keep coming back to ${titleCase(strong[0])}, and it's front and center here.`);
  } else if (shared.length > 0) {
    reasons.push(`Shares ${joinNames(shared.slice(0, 3))} with your shelf, but none of your favorites.`);
  } else {
    const lean = families.slice(0, 2);
    reasons.push(
      lean.length
        ? `Not much overlap with your shelf. This leans ${joinNames(lean)}.`
        : "Not much overlap with the notes on your shelf.",
    );
  }

  let topFamily: string | null = null;
  let topFamilyW = 0;
  for (const [fam, w] of profile.familyWeights) if (w > topFamilyW) { topFamily = fam; topFamilyW = w; }
  if (topFamily && families.includes(topFamily) && famFit >= 0.99) {
    reasons.push(`${titleCase(topFamily)} is the family you own most.`);
  } else if (families.length && famFit < 0.2 && profile.familyWeights.size > 0) {
    reasons.push(`You don't own anything ${families[0]} yet, so this would be a new direction.`);
  }

  if (warningNote) {
    reasons.push(`Heads up: ${titleCase(warningNote)} is prominent here, and you've disliked it before.`);
  }

  return {
    score,
    label: labelFor(score),
    reasons: reasons.slice(0, 3),
    sharedNotes: shared.slice(0, 3),
    warningNote,
  };
}

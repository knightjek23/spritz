// Scoring for the discovery lists. Pure.
//
// Four signals, each normalized to 0..1 among the candidates, then weighted.
// A fragrance missing a signal scores 0 for it; it is never dropped.
// Research leads because it is the only signal that is both current and
// gender- and season-aware. Weights live here so they can be tuned without
// touching logic. Spec: docs/superpowers/specs/2026-10-31-seasonal-and-top-scents-design.md

export interface Signals {
  /** Decayed research mention weight per fragrance id (lib/discovery/research). */
  research: Map<string, number>;
  /** Catalog popularity_rank; 1 = most popular. */
  popularityRank: Map<string, number>;
  /** Weekly trends-collector score. */
  trends: Map<string, number>;
  /** Collection adds + buy clicks, last 30 days. */
  inApp: Map<string, number>;
}

export const WEIGHTS = { research: 0.45, popularity: 0.3, trends: 0.1, inApp: 0.15 };
export type Weights = typeof WEIGHTS;

function byMax(ids: string[], m: Map<string, number>): (id: string) => number {
  let max = 0;
  for (const id of ids) max = Math.max(max, m.get(id) ?? 0);
  return (id) => (max > 0 ? (m.get(id) ?? 0) / max : 0);
}

function byRank(ids: string[], m: Map<string, number>): (id: string) => number {
  let maxRank = 0;
  for (const id of ids) {
    const r = m.get(id);
    if (r !== undefined) maxRank = Math.max(maxRank, r);
  }
  return (id) => {
    const r = m.get(id);
    return r === undefined || maxRank === 0 ? 0 : 1 - (r - 1) / maxRank;
  };
}

export function combineScores(ids: string[], s: Signals, w: Weights = WEIGHTS): Map<string, number> {
  const research = byMax(ids, s.research);
  const popularity = byRank(ids, s.popularityRank);
  const trends = byMax(ids, s.trends);
  const inApp = byMax(ids, s.inApp);
  const out = new Map<string, number>();
  for (const id of ids) {
    out.set(
      id,
      w.research * research(id) +
        w.popularity * popularity(id) +
        w.trends * trends(id) +
        w.inApp * inApp(id),
    );
  }
  return out;
}

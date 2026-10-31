// The monthly research file (data/scent-research.json) and how it turns into
// a per-fragrance signal. Pure.
//
// Each entry is one fragrance with the lists it supports and its citations.
// A source counts once per fragrance however many of its pages mention it,
// so one outlet cannot dominate, and a source whose newest citation is more
// than 90 days old counts half. Entries the matcher could not resolve to a
// catalog id (fragrance_id null) are kept in the file for review and
// skipped here. Citations are internal: no user-facing string names a source.

import type { Season } from "./season";

export type ResearchList = "men" | "women" | `seasonal-${Season}`;

export interface ResearchCitation {
  source: string;
  url: string;
  /** YYYY-MM-DD the page was published or last updated. */
  date: string;
}

export interface ResearchEntry {
  name: string;
  house: string;
  fragrance_id: string | null;
  lists: ResearchList[];
  citations: ResearchCitation[];
}

export interface ResearchFile {
  generated_at: string;
  entries: ResearchEntry[];
}

/** List keys the loaders use: "men", "women", "seasonal-men-fall", ... */
export type DiscoveryList = "men" | "women" | `seasonal-${"men" | "women"}-${Season}`;

const STALE_DAYS = 90;

function researchKeyFor(list: DiscoveryList): ResearchList {
  if (list === "men" || list === "women") return list;
  const season = list.split("-")[2] as Season;
  return `seasonal-${season}`;
}

export function researchMentions(
  file: { entries: Array<Omit<ResearchEntry, "lists"> & { lists: string[] }> },
  list: DiscoveryList,
  now: Date,
): Map<string, number> {
  const key = researchKeyFor(list);
  const cutoff = now.getTime() - STALE_DAYS * 86_400_000;
  const out = new Map<string, number>();
  for (const e of file.entries) {
    if (!e.fragrance_id || !e.lists.includes(key)) continue;
    const newestBySource = new Map<string, number>();
    for (const c of e.citations) {
      const t = Date.parse(c.date);
      if (Number.isNaN(t)) continue;
      newestBySource.set(c.source, Math.max(newestBySource.get(c.source) ?? 0, t));
    }
    let weight = 0;
    for (const t of newestBySource.values()) weight += t >= cutoff ? 1 : 0.5;
    if (weight > 0) out.set(e.fragrance_id, (out.get(e.fragrance_id) ?? 0) + weight);
  }
  return out;
}

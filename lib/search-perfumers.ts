// Perfumer rows for the search typeahead. Pro only: the route that calls
// this (app/api/search/perfumers) checks the plan first, because perfumer
// credits are a Pro feature everywhere else too (migration 0034, the
// fragrance page credit, /perfumers).
//
// Index: every credited perfumer from listPerfumers() (lib/perfumers.ts,
// cached for an hour, so no query per keystroke). Match rule, same as
// houses and notes: every query word must be the start of a word in the
// name, accents ignored, so "kurk" finds Francis Kurkdjian, "celine"
// finds Céline Ellena and "alberto mor" finds Alberto Morillas.
// Exact full-name matches first, then the most prolific.

import { listPerfumers } from "@/lib/perfumers";

export interface PerfumerHit {
  name: string;
  slug: string;
  count: number;
}

export const MAX_PERFUMERS = 2;

function words(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export async function findPerfumers(q: string): Promise<PerfumerHit[]> {
  const qw = words(q);
  if (qw.length === 0 || (qw.length === 1 && qw[0].length < 3)) return [];
  const joined = qw.join(" ");
  try {
    const all = await listPerfumers();
    const hits = all
      .map((p) => ({ p, w: words(p.name) }))
      .filter(({ w }) => qw.every((q1) => w.some((x) => x.startsWith(q1))));
    hits.sort((a, b) => {
      const ae = a.w.join(" ") === joined ? 1 : 0;
      const be = b.w.join(" ") === joined ? 1 : 0;
      return be - ae || b.p.count - a.p.count || a.p.name.localeCompare(b.p.name);
    });
    return hits.slice(0, MAX_PERFUMERS).map(({ p }) => ({ name: p.name, slug: p.slug, count: p.count }));
  } catch {
    return [];
  }
}

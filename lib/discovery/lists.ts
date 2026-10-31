// Seasonal Suggestions and Top Scents for Men / Women. Server-only.
//
// Pipeline per list: candidates (quality floor) -> eligibility (gender,
// season) -> score (lib/discovery/score) -> top-30 pool -> rotation
// (lib/discovery/rotation) -> ScrollerRow[]. Cached until the window ends:
// the key carries the list, the window number and, for seasonal lists, the
// season, so on the first day of a new season the seasonal lists switch
// immediately instead of waiting out the window. Never throws: on any error
// a list returns [] and its section self-hides, like the trending sections.
// Spec: docs/superpowers/specs/2026-10-31-seasonal-and-top-scents-design.md

import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ScrollerRow } from "@/components/fragrance-scroller";
import { loadTrendingFeed } from "@/lib/trending/feed";
import { joinTrendingToCatalogCached } from "@/lib/trending/join";
import research from "@/data/scent-research.json";
import { seasonFor, windowIndex, type Season } from "./season";
import { seasonsOf } from "./infer-season";
import { combineScores, type Signals } from "./score";
import { researchMentions, type DiscoveryList, type ResearchFile } from "./research";
import { rotate } from "./rotation";

export type Gender = "men" | "women";

const POOL_SIZE = 30;
const PICKS = 10;
const MAX_UNISEX = 3;
const CANDIDATE_LIMIT = 1500;
const IN_APP_DAYS = 30;
const CACHE_SECONDS = 3600;

interface Candidate {
  id: string;
  name: string;
  house: string;
  bottle_image_url: string | null;
  gender: "masculine" | "feminine" | "unisex" | null;
  season_tags: string[] | null;
  family: string[] | null;
  popularity_rank: number | null;
  top_notes: unknown[] | null;
}

function warn(where: string, err: unknown) {
  console.warn(`[discovery] ${where}:`, err instanceof Error ? err.message : err);
}

// ---------------------------------------------------------------- data

const loadCandidates = unstable_cache(
  async (): Promise<Candidate[]> => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("fragrances")
      .select("id, name, house, bottle_image_url, gender, season_tags, family, popularity_rank, top_notes")
      .not("bottle_image_url", "is", null)
      .not("popularity_rank", "is", null)
      .order("popularity_rank", { ascending: true })
      .limit(CANDIDATE_LIMIT);
    if (error) throw new Error(error.message);
    // Quality floor: a picture and at least one note.
    return ((data ?? []) as Candidate[]).filter((c) => (c.top_notes ?? []).length > 0);
  },
  ["discovery-candidates"],
  { revalidate: CACHE_SECONDS },
);

const loadInApp = unstable_cache(
  async (): Promise<Array<[string, number]>> => {
    const supabase = createAdminClient();
    const since = new Date(Date.now() - IN_APP_DAYS * 86_400_000).toISOString();
    const counts = new Map<string, number>();
    const { data: adds, error } = await supabase
      .from("collection_items")
      .select("fragrance_id")
      .gte("added_at", since)
      .limit(5000);
    if (error) warn("in-app adds", error.message);
    for (const a of adds ?? []) counts.set(a.fragrance_id, (counts.get(a.fragrance_id) ?? 0) + 1);
    const { data: clicks, error: cErr } = await supabase.rpc("most_clicked_fragrances", {
      p_days: IN_APP_DAYS,
      p_limit: 500,
    });
    if (cErr) warn("in-app clicks", cErr.message);
    for (const c of (clicks ?? []) as Array<{ fragrance_id: string; clicks: number }>) {
      counts.set(c.fragrance_id, (counts.get(c.fragrance_id) ?? 0) + Number(c.clicks));
    }
    return [...counts];
  },
  ["discovery-in-app"],
  { revalidate: CACHE_SECONDS },
);

async function loadTrends(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const feed = await loadTrendingFeed();
    if (!feed) return out;
    const joined = await joinTrendingToCatalogCached("discovery", feed.generated_at, feed.entries);
    const n = joined.length;
    for (const j of joined) {
      if (j.fragranceId) out.set(j.fragranceId, Math.max(out.get(j.fragranceId) ?? 0, n - j.rank + 1));
    }
  } catch (err) {
    warn("trends", err);
  }
  return out;
}

// ---------------------------------------------------------- eligibility

function fitsGender(c: Candidate, gender: Gender): boolean {
  if (c.gender === "unisex") return true;
  return gender === "men" ? c.gender === "masculine" : c.gender === "feminine";
}

function researchSeasonIds(season: Season): Set<string> {
  const ids = new Set<string>();
  for (const e of (research as ResearchFile).entries) {
    if (e.fragrance_id && e.lists.includes(`seasonal-${season}`)) ids.add(e.fragrance_id);
  }
  return ids;
}

// ----------------------------------------------------------------- build

async function buildList(gender: Gender, season: Season | null, window: number): Promise<ScrollerRow[]> {
  const [candidates, inApp, trends] = await Promise.all([loadCandidates(), loadInApp(), loadTrends()]);
  const fromResearch = season ? researchSeasonIds(season) : null;

  const eligible = candidates.filter(
    (c) =>
      fitsGender(c, gender) &&
      (!season || seasonsOf(c).includes(season) || fromResearch!.has(c.id)),
  );
  if (eligible.length === 0) return [];

  const list: DiscoveryList = season ? `seasonal-${gender}-${season}` : gender;
  const now = new Date();
  const signals: Signals = {
    research: researchMentions(research as ResearchFile, list, now),
    popularityRank: new Map(eligible.map((c) => [c.id, c.popularity_rank as number])),
    trends,
    inApp: new Map(inApp),
  };
  const ids = eligible.map((c) => c.id);
  const scores = combineScores(ids, signals);
  const byId = new Map(eligible.map((c) => [c.id, c]));

  const pool = [...ids]
    .sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0))
    .slice(0, POOL_SIZE)
    .map((id) => ({ id, score: scores.get(id) ?? 0, unisex: byId.get(id)!.gender === "unisex" }));

  return rotate(pool, list, window, { size: PICKS, maxUnisex: MAX_UNISEX }).map((id) => {
    const c = byId.get(id)!;
    return { id: c.id, name: c.name, house: c.house, bottle_image_url: c.bottle_image_url };
  });
}

// -------------------------------------------------------------- public

/** Top Scents for Men / Women: rotates every 3 days. */
export async function getTopScents(gender: Gender): Promise<ScrollerRow[]> {
  const window = windowIndex(new Date());
  try {
    return await unstable_cache(() => buildList(gender, null, window), ["discovery", gender, String(window)], {
      revalidate: CACHE_SECONDS,
    })();
  } catch (err) {
    warn(`top ${gender}`, err);
    return [];
  }
}

/** Seasonal Suggestions: strictly in-season, switches on the season's first day. */
export async function getSeasonalPicks(gender: Gender): Promise<{ season: Season; rows: ScrollerRow[] }> {
  const now = new Date();
  const season = seasonFor(now);
  const window = windowIndex(now);
  try {
    const rows = await unstable_cache(
      () => buildList(gender, season, window),
      ["discovery", "seasonal", gender, season, String(window)],
      { revalidate: CACHE_SECONDS },
    )();
    return { season, rows };
  } catch (err) {
    warn(`seasonal ${gender}`, err);
    return { season, rows: [] };
  }
}

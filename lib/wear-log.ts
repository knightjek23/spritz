// Wear log — "What are you wearing today?" and the history behind it.
//
// Server-side reads for the home prompt and /account/history. Writes go
// through app/api/wear (auth + Owned-shelf check). Dates are YYYY-MM-DD
// strings in the user's local calendar; see migration 0036 for why the
// server never computes "today" itself.

import { createAdminClient } from "@/lib/supabase/admin";

export interface WearEntry {
  id: string;
  wornOn: string;
  createdAt: string;
  fragrance: {
    id: string;
    name: string;
    house: string;
    bottle_image_url: string | null;
  };
}

/** Bottle shape the home picker needs: just enough to render a tile. */
export interface OwnedBottle {
  id: string;
  name: string;
  house: string;
  bottle_image_url: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && DATE_RE.test(s) && !Number.isNaN(Date.parse(s));
}

type RawRow = {
  id: string;
  worn_on: string;
  created_at: string;
  fragrance: WearEntry["fragrance"] | null;
};

function toEntry(r: RawRow): WearEntry | null {
  if (!r.fragrance) return null;
  return { id: r.id, wornOn: r.worn_on, createdAt: r.created_at, fragrance: r.fragrance };
}

/** The user's Owned shelf, most recently added first. */
export async function ownedBottles(appUserId: string): Promise<OwnedBottle[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("collection_items")
    .select("fragrance:fragrances(id, name, house, bottle_image_url)")
    .eq("user_id", appUserId)
    .eq("status", "own")
    .order("added_at", { ascending: false })
    .limit(200);
  return (data ?? [])
    .map((r) => (r as unknown as { fragrance: OwnedBottle | null }).fragrance)
    .filter((f): f is OwnedBottle => !!f);
}

/** Entries for one local day (usually today), oldest logged first. */
export async function wornOn(appUserId: string, day: string): Promise<WearEntry[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("wear_log")
    .select("id, worn_on, created_at, fragrance:fragrances(id, name, house, bottle_image_url)")
    .eq("user_id", appUserId)
    .eq("worn_on", day)
    .order("created_at", { ascending: true });
  return ((data ?? []) as unknown as RawRow[]).map(toEntry).filter((e): e is WearEntry => !!e);
}

/** Full history, newest day first (then newest entry first within a day). */
export async function wearHistory(appUserId: string, limit = 500): Promise<WearEntry[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("wear_log")
    .select("id, worn_on, created_at, fragrance:fragrances(id, name, house, bottle_image_url)")
    .eq("user_id", appUserId)
    .order("worn_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown as RawRow[]).map(toEntry).filter((e): e is WearEntry => !!e);
}

/** Number of distinct days with at least one entry. */
export async function daysLogged(appUserId: string): Promise<number> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("wear_log")
    .select("worn_on")
    .eq("user_id", appUserId);
  return new Set((data ?? []).map((r) => r.worn_on)).size;
}

/** Most-worn bottles over the trailing window, by number of days worn. */
export function mostWorn(entries: WearEntry[], sinceDay: string, top = 3) {
  const byId = new Map<string, { fragrance: WearEntry["fragrance"]; days: Set<string> }>();
  for (const e of entries) {
    if (e.wornOn < sinceDay) continue;
    const cur = byId.get(e.fragrance.id) ?? { fragrance: e.fragrance, days: new Set<string>() };
    cur.days.add(e.wornOn);
    byId.set(e.fragrance.id, cur);
  }
  return [...byId.values()]
    .map((v) => ({ fragrance: v.fragrance, count: v.days.size }))
    .sort((a, b) => b.count - a.count || a.fragrance.name.localeCompare(b.fragrance.name))
    .slice(0, top);
}

/** Every distinct day with an entry, newest first (capped; enough for any streak). */
export async function wearDays(appUserId: string, limit = 800): Promise<string[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("wear_log")
    .select("worn_on")
    .eq("user_id", appUserId)
    .order("worn_on", { ascending: false })
    .limit(limit);
  return [...new Set((data ?? []).map((r) => r.worn_on))];
}

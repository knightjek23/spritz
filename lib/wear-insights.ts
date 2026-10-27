import "server-only";

// Wear insights (Pro) — what the wear log says once there's enough of it.
//
//   cost per wear       price_paid_cents / distinct days worn, per owned
//                       bottle with a price entered. Best value first.
//   most complimented   sum of "got a compliment" taps per bottle.
//   seasonal patterns   for each season, the family the user reaches for
//                       most (by wear days). Seasons by month, northern
//                       hemisphere; good enough for a US audience.
//   neglected           owned bottles not worn in 60+ days, or never.
//
// Pure functions over rows the history page already loads, plus one
// query for owned items with prices. Nothing is stored.

import { createAdminClient } from "@/lib/supabase/admin";
import type { WearEntry } from "@/lib/wear-log";

export const NEGLECT_DAYS = 60;

export interface OwnedForInsights {
  fragranceId: string;
  name: string;
  house: string;
  bottle_image_url: string | null;
  pricePaidCents: number | null;
  addedAt: string;
}

export async function ownedForInsights(appUserId: string): Promise<OwnedForInsights[]> {
  const { data } = await createAdminClient()
    .from("collection_items")
    .select("price_paid_cents, added_at, fragrance:fragrances(id, name, house, bottle_image_url)")
    .eq("user_id", appUserId)
    .eq("status", "own")
    .limit(300);
  return (data ?? [])
    .map((r) => {
      const f = (r as unknown as { fragrance: { id: string; name: string; house: string; bottle_image_url: string | null } | null }).fragrance;
      if (!f) return null;
      return {
        fragranceId: f.id,
        name: f.name,
        house: f.house,
        bottle_image_url: f.bottle_image_url,
        pricePaidCents: (r as { price_paid_cents: number | null }).price_paid_cents,
        addedAt: (r as { added_at: string }).added_at,
      };
    })
    .filter((x): x is OwnedForInsights => !!x);
}

function daysWornByFragrance(entries: WearEntry[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const e of entries) {
    const s = m.get(e.fragrance.id) ?? new Set<string>();
    s.add(e.wornOn);
    m.set(e.fragrance.id, s);
  }
  return m;
}

export interface CostPerWear {
  fragranceId: string;
  name: string;
  house: string;
  bottle_image_url: string | null;
  pricePaidCents: number;
  days: number;
  /** Cents per day worn; null when never worn. */
  centsPerWear: number | null;
}

export function costPerWear(owned: OwnedForInsights[], entries: WearEntry[]): CostPerWear[] {
  const days = daysWornByFragrance(entries);
  return owned
    .filter((o) => o.pricePaidCents !== null && o.pricePaidCents > 0)
    .map((o) => {
      const d = days.get(o.fragranceId)?.size ?? 0;
      return {
        fragranceId: o.fragranceId,
        name: o.name,
        house: o.house,
        bottle_image_url: o.bottle_image_url,
        pricePaidCents: o.pricePaidCents as number,
        days: d,
        centsPerWear: d > 0 ? Math.round((o.pricePaidCents as number) / d) : null,
      };
    })
    .sort((a, b) => {
      if (a.centsPerWear === null) return 1;
      if (b.centsPerWear === null) return -1;
      return a.centsPerWear - b.centsPerWear;
    });
}

export interface Complimented {
  fragrance: WearEntry["fragrance"];
  compliments: number;
  days: number;
}

export function mostComplimented(entries: WearEntry[], top = 3): Complimented[] {
  const m = new Map<string, Complimented>();
  for (const e of entries) {
    const cur = m.get(e.fragrance.id) ?? { fragrance: e.fragrance, compliments: 0, days: 0 };
    cur.compliments += e.compliments;
    cur.days += 1;
    m.set(e.fragrance.id, cur);
  }
  return [...m.values()]
    .filter((c) => c.compliments > 0)
    .sort((a, b) => b.compliments - a.compliments || a.days - b.days)
    .slice(0, top);
}

export type Season = "winter" | "spring" | "summer" | "fall";

export function seasonOf(day: string): Season {
  const m = Number(day.slice(5, 7));
  if (m === 12 || m <= 2) return "winter";
  if (m <= 5) return "spring";
  if (m <= 8) return "summer";
  return "fall";
}

export interface SeasonPattern {
  season: Season;
  days: number;
  /** Family with the most wear days that season, and its share (0–1). */
  topFamily: string | null;
  share: number;
}

export function seasonalPatterns(entries: WearEntry[]): SeasonPattern[] {
  const perSeason = new Map<Season, { days: Set<string>; fam: Map<string, Set<string>> }>();
  for (const e of entries) {
    const s = seasonOf(e.wornOn);
    const cur = perSeason.get(s) ?? { days: new Set<string>(), fam: new Map<string, Set<string>>() };
    cur.days.add(e.wornOn);
    const fam = (e.fragrance.family ?? [])[0]?.toLowerCase();
    if (fam) {
      const d = cur.fam.get(fam) ?? new Set<string>();
      d.add(e.wornOn);
      cur.fam.set(fam, d);
    }
    perSeason.set(s, cur);
  }
  const order: Season[] = ["winter", "spring", "summer", "fall"];
  return order
    .filter((s) => perSeason.has(s))
    .map((s) => {
      const { days, fam } = perSeason.get(s)!;
      let topFamily: string | null = null;
      let best = 0;
      for (const [f, d] of fam) if (d.size > best) { best = d.size; topFamily = f; }
      return { season: s, days: days.size, topFamily, share: days.size ? best / days.size : 0 };
    });
}

export interface Neglected {
  fragranceId: string;
  name: string;
  house: string;
  bottle_image_url: string | null;
  /** Days since last worn; null when never logged. */
  daysSince: number | null;
}

export function neglected(owned: OwnedForInsights[], entries: WearEntry[], today: string, top = 4): Neglected[] {
  const last = new Map<string, string>();
  for (const e of entries) {
    const cur = last.get(e.fragrance.id);
    if (!cur || e.wornOn > cur) last.set(e.fragrance.id, e.wornOn);
  }
  const t = Date.parse(`${today}T00:00:00Z`);
  return owned
    .map((o) => {
      const l = last.get(o.fragranceId);
      const daysSince = l ? Math.floor((t - Date.parse(`${l}T00:00:00Z`)) / 86_400_000) : null;
      return { fragranceId: o.fragranceId, name: o.name, house: o.house, bottle_image_url: o.bottle_image_url, daysSince };
    })
    .filter((n) => n.daysSince === null || n.daysSince >= NEGLECT_DAYS)
    .sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999))
    .slice(0, top);
}

export function dollars(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

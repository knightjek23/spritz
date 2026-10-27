import "server-only";

// Weekly free-tier caps for match score and compare.
//
// A "use" is a distinct key (fragrance id, or a compare pair) first opened
// in the trailing 7 days. Opening the same key again is free, so a user
// who keeps coming back to one bottle is never charged twice. Pro users
// bypass this module entirely (the routes check the plan first).
//
// Days are the client's local YYYY-MM-DD, passed in by the route, for the
// same reason wear_log does it (migration 0036).

import { createAdminClient } from "@/lib/supabase/admin";

export type CappedFeature = "match" | "compare";

export const FREE_WEEKLY_CAP: Record<CappedFeature, number> = {
  match: 3,
  compare: 2,
};

export interface UseResult {
  /** True when the user may see the content this request. */
  allowed: boolean;
  /** Uses left after this request (0 when blocked). */
  remaining: number;
  /** The cap for this feature, for the gate copy. */
  cap: number;
}

function daysAgo(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Spend a use if needed and report whether the content may be shown.
 * Idempotent per key: the same key within the window never spends twice.
 */
export async function spendUse(
  appUserId: string,
  feature: CappedFeature,
  key: string,
  today: string,
): Promise<UseResult> {
  const supabase = createAdminClient();
  const cap = FREE_WEEKLY_CAP[feature];
  const since = daysAgo(today, 6);

  const { data: rows } = await supabase
    .from("feature_uses")
    .select("key, used_on")
    .eq("user_id", appUserId)
    .eq("feature", feature)
    .gte("used_on", since);

  const recent = rows ?? [];
  const alreadyUsed = recent.some((r) => r.key === key);
  if (alreadyUsed) {
    return { allowed: true, remaining: Math.max(0, cap - recent.length), cap };
  }
  if (recent.length >= cap) {
    return { allowed: false, remaining: 0, cap };
  }

  await supabase
    .from("feature_uses")
    .upsert({ user_id: appUserId, feature, key, used_on: today }, { onConflict: "user_id,feature,key" });

  return { allowed: true, remaining: Math.max(0, cap - recent.length - 1), cap };
}

/** Uses left without spending one, for "2 free this week" labels. */
export async function remainingUses(
  appUserId: string,
  feature: CappedFeature,
  today: string,
): Promise<number> {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from("feature_uses")
    .select("key", { count: "exact", head: true })
    .eq("user_id", appUserId)
    .eq("feature", feature)
    .gte("used_on", daysAgo(today, 6));
  return Math.max(0, FREE_WEEKLY_CAP[feature] - (count ?? 0));
}

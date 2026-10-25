// 7-day Pro trial: state, eligibility, and every piece of copy about it.
//
// Pricing decision (2026-07-13): the trial sits on Monthly only, so the
// worst-case charge after a forgotten trial is $4.99, never $29.99.
// Design (2026-10-25): the trial is surfaced at every Pro gate ("Try Pro
// free for 7 days" with the billed amount in equal weight, per App Store
// guideline 3.1.2(c)), explained on /pricing as a three-step timeline,
// shown on the Account plan card while running, and backed by three
// server-sent pushes (day 1, day 5, day 7) that stop the moment the trial
// converts or is cancelled (users.trial_ends_at → null).

import { createAdminClient } from "@/lib/supabase/admin";

export const TRIAL_DAYS = 7;
export const MONTHLY_PRICE = "$4.99";

/** Button + sub-line for a Pro gate. Billed amount always travels with the offer. */
export const TRIAL_CTA = {
  label: `Try Pro free for ${TRIAL_DAYS} days`,
  sub: `Then ${MONTHLY_PRICE}/mo. Cancel anytime.`,
} as const;

/** Pricing-page timeline (Monthly only). */
export const TRIAL_TIMELINE = [
  { when: "Today", what: "Everything unlocks: perfumers, dupes, the full library, unlimited shelf." },
  { when: `Day ${TRIAL_DAYS - 2}`, what: "One reminder from us, so the end never sneaks up on you." },
  { when: `Day ${TRIAL_DAYS}`, what: `${MONTHLY_PRICE}/mo begins. Cancel before then and you pay nothing.` },
] as const;

/** Copy for the push-permission primer shown before a native trial purchase. */
export const TRIAL_PRIMER = {
  title: "We'll remind you before it ends",
  body: `Turn on notifications and we'll send one reminder on day ${TRIAL_DAYS - 2}, two days before ${MONTHLY_PRICE}/mo would begin.`,
} as const;

export interface TrialState {
  /** Non-null while a free trial is running. ISO timestamp. */
  endsAt: string | null;
  /** Whole days left, rounded up; 0 on the last day. Null when not trialing. */
  daysLeft: number | null;
  /** The user has had a trial before (running or not). */
  used: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function trialStateFrom(
  row: { trial_ends_at: string | null; trial_used_at: string | null } | null | undefined,
  now = Date.now(),
): TrialState {
  const endsAt = row?.trial_ends_at ?? null;
  const ends = endsAt ? Date.parse(endsAt) : NaN;
  const active = Number.isFinite(ends) && ends > now;
  return {
    endsAt: active ? endsAt : null,
    daysLeft: active ? Math.max(0, Math.ceil((ends - now) / DAY_MS)) : null,
    used: !!row?.trial_used_at || !!endsAt,
  };
}

/** Trial state for a Clerk user; a missing row reads as never trialed. */
export async function trialStateForClerkUser(clerkUserId: string): Promise<TrialState> {
  const { data } = await createAdminClient()
    .from("users")
    .select("trial_ends_at, trial_used_at")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  return trialStateFrom(data);
}

/** "Thursday" / "Oct 30" style label for the conversion date. */
export function trialEndLabel(endsAt: string, now = Date.now()): string {
  const d = new Date(endsAt);
  const days = (d.getTime() - now) / DAY_MS;
  if (days < 6) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ---- Push copy (lib/push-trial.ts sends these) ---- */

export type TrialPushDay = "trial_day1" | "trial_day5" | "trial_day7";

export function trialPush(day: TrialPushDay, endsAt: string): { title: string; body: string; url: string } {
  switch (day) {
    case "trial_day1":
      return {
        title: "Pro is on",
        body: "Try a perfumer's full catalog, or find a dupe for something on your shelf.",
        url: "/perfumers",
      };
    case "trial_day5":
      return {
        title: "Your Pro trial ends in two days",
        body: `${MONTHLY_PRICE}/mo begins ${trialEndLabel(endsAt)} unless you cancel.`,
        url: "/account",
      };
    case "trial_day7":
      return {
        title: "Last day of your Pro trial",
        body: "Keep it, or cancel from your Account page.",
        url: "/account",
      };
  }
}

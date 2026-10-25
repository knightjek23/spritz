// The Pro-trial reminder campaign (design approved 2026-10-25). SERVER ONLY.
//
// Three pushes per trial, chosen by how far the trial end is from now:
//   trial_day1  — the morning after it started      (ends in > 5 days)
//   trial_day5  — two days before it converts       (ends in 1–2 days)
//   trial_day7  — the last day                      (ends in < 1 day)
// Called by the daily cron (app/api/cron/push-scan-followup, 10:00 Pacific)
// after the scan follow-up.
//
// Rules:
//   - only users with users.trial_ends_at set; converting or cancelling
//     clears it (webhooks), so a user who cancelled on day 2 hears nothing
//   - each step at most once per trial (push_sends.campaign + the trial's
//     end time in `fragrance_id`-free rows: we key on user + campaign +
//     sent_at within the trial window), which also makes re-runs idempotent
//   - a dead token is disabled, not retried (same as scan follow-up)
//   - the day-5 push is the promise the pricing page makes; it is never
//     skipped for the 24-hour cross-campaign cap the scan job uses

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendApns } from "@/lib/apns";
import { sendFcm } from "@/lib/fcm";
import { trialPush, type TrialPushDay } from "@/lib/trial";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TrialRunResult {
  considered: number;
  sent: number;
  skippedAlreadySent: number;
  skippedNoToken: number;
  failed: number;
  tokensDisabled: number;
  details: string[];
}

function stepFor(endsAtMs: number, nowMs: number, startedAtMs: number | null): TrialPushDay | null {
  const left = endsAtMs - nowMs;
  if (left <= 0) return null;
  if (left < 1 * DAY_MS) return "trial_day7";
  if (left < 2.5 * DAY_MS) return "trial_day5";
  // Day 1: at least ~12 h in, so a trial started an hour before the job
  // waits for tomorrow's run.
  if (startedAtMs !== null && nowMs - startedAtMs >= 12 * 3600 * 1000 && left > 5 * DAY_MS) {
    return "trial_day1";
  }
  return null;
}

export async function runTrialReminders(opts: { onlyUserId?: string } = {}): Promise<TrialRunResult> {
  const supabase = createAdminClient();
  const result: TrialRunResult = {
    considered: 0,
    sent: 0,
    skippedAlreadySent: 0,
    skippedNoToken: 0,
    failed: 0,
    tokensDisabled: 0,
    details: [],
  };
  const nowMs = Date.now();

  // 1. Everyone currently in a trial.
  let q = supabase
    .from("users")
    .select("id, trial_ends_at, trial_used_at")
    .not("trial_ends_at", "is", null)
    .gt("trial_ends_at", new Date(nowMs).toISOString())
    .limit(5000);
  if (opts.onlyUserId) q = q.eq("id", opts.onlyUserId);
  const { data: users, error } = await q;
  if (error) throw new Error(`users read failed: ${error.message}`);

  const plan = new Map<string, { step: TrialPushDay; endsAt: string; endsAtMs: number }>();
  for (const u of users ?? []) {
    if (!u.trial_ends_at) continue;
    const endsAtMs = Date.parse(u.trial_ends_at);
    const startedAtMs = u.trial_used_at ? Date.parse(u.trial_used_at) : null;
    const step = stepFor(endsAtMs, nowMs, startedAtMs);
    if (step) plan.set(u.id, { step, endsAt: u.trial_ends_at, endsAtMs });
  }
  result.considered = plan.size;
  if (plan.size === 0) return result;

  // 2. Already sent this step during this trial? (window = the 8 days
  //    before the trial ends, generous enough for any clock skew)
  const { data: prior } = await supabase
    .from("push_sends")
    .select("user_id, campaign, sent_at")
    .in("user_id", [...plan.keys()])
    .in("campaign", ["trial_day1", "trial_day5", "trial_day7"])
    .gte("sent_at", new Date(nowMs - 9 * DAY_MS).toISOString());
  for (const p of prior ?? []) {
    const planned = plan.get(p.user_id);
    if (!planned) continue;
    const sentAt = Date.parse(p.sent_at);
    if (p.campaign === planned.step && sentAt > planned.endsAtMs - 8 * DAY_MS) {
      plan.delete(p.user_id);
      result.skippedAlreadySent++;
    }
  }
  if (plan.size === 0) return result;

  // 3. Tokens.
  const { data: tokens } = await supabase
    .from("push_tokens")
    .select("id, user_id, token, platform")
    .in("user_id", [...plan.keys()])
    .eq("enabled", true);
  const tokensByUser = new Map<string, NonNullable<typeof tokens>>();
  for (const t of tokens ?? []) {
    const list = tokensByUser.get(t.user_id) ?? [];
    list.push(t);
    tokensByUser.set(t.user_id, list);
  }

  // 4. Send.
  for (const [userId, { step, endsAt }] of plan) {
    const userTokens = tokensByUser.get(userId) ?? [];
    if (userTokens.length === 0) {
      result.skippedNoToken++;
      continue;
    }
    const copy = trialPush(step, endsAt);

    for (const t of userTokens) {
      const send = t.platform === "android" ? sendFcm : sendApns;
      const provider = t.platform === "android" ? "fcm" : "apns";

      const { data: sendRow, error: insErr } = await supabase
        .from("push_sends")
        .insert({ user_id: userId, token_id: t.id, campaign: step })
        .select("id")
        .single();
      if (insErr || !sendRow) {
        result.failed++;
        result.details.push(`push_sends insert failed: ${insErr?.message}`);
        continue;
      }

      try {
        const r = await send(t.token, {
          title: copy.title,
          body: copy.body,
          path: copy.url,
          sendId: sendRow.id,
        });
        await supabase
          .from("push_sends")
          .update({ apns_status: r.status, apns_reason: r.reason })
          .eq("id", sendRow.id);
        if (r.status === 200) {
          result.sent++;
        } else {
          result.failed++;
          result.details.push(`${provider} ${r.status} ${r.reason ?? ""} for user ${userId}`);
          if (r.tokenDead) {
            await supabase.from("push_tokens").update({ enabled: false }).eq("id", t.id);
            result.tokensDisabled++;
          }
        }
      } catch (e) {
        result.failed++;
        const msg = e instanceof Error ? e.message : String(e);
        result.details.push(`${provider} transport error: ${msg}`);
        await supabase
          .from("push_sends")
          .update({ apns_status: 0, apns_reason: msg.slice(0, 120) })
          .eq("id", sendRow.id);
      }
    }
  }

  return result;
}

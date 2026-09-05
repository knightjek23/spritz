// The scan follow-up campaign (D20). SERVER ONLY.
//
// The day after a scan that produced a match, the person who scanned it
// gets one notification pointing back at that bottle. Called by the daily
// cron (app/api/cron/push-scan-followup) and, with `now: true`, by
// scripts/push-test.ts so the round trip can be shown working today.
//
// Rules, from the slice 5 brief:
//   - one push per user per day; if they scanned three bottles, they get
//     one, for the most recent match
//   - nothing for scans older than 48 hours, so a job that missed a day
//     never sends a stale batch
//   - nothing for a user with no enabled token, or with a send already in
//     the last 24 hours (this is also what makes a second run idempotent)
//   - a dead token (APNs 410 / BadDeviceToken) is disabled, not retried

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendApns } from "@/lib/apns";

export const CAMPAIGN = "scan_followup";

export interface FollowupRunOptions {
  /** Restrict to one app user id. Used by the test script. */
  onlyUserId?: string;
  /**
   * Ignore the "yesterday" window and the 24-hour cap, and use the user's
   * most recent matched scan whatever its age. Test script only.
   */
  now?: boolean;
}

export interface FollowupRunResult {
  considered: number;
  sent: number;
  skippedCapped: number;
  skippedNoToken: number;
  failed: number;
  tokensDisabled: number;
  details: string[];
}

interface Candidate {
  userId: string;
  scanId: string;
  fragranceId: string;
  scannedAt: string;
}

export async function runScanFollowup(opts: FollowupRunOptions = {}): Promise<FollowupRunResult> {
  const supabase = createAdminClient();
  const result: FollowupRunResult = {
    considered: 0,
    sent: 0,
    skippedCapped: 0,
    skippedNoToken: 0,
    failed: 0,
    tokensDisabled: 0,
    details: [],
  };

  // 1. Candidate scans. In normal operation: matched scans from the last
  //    48 hours that are at least 12 hours old, so a scan at 11:55 the
  //    night before still counts as "yesterday" and a scan five minutes
  //    before the job does not.
  const nowMs = Date.now();
  let q = supabase
    .from("scan_events")
    .select("id, user_id, matched_fragrance_id, created_at")
    .not("user_id", "is", null)
    .not("matched_fragrance_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (!opts.now) {
    q = q
      .gte("created_at", new Date(nowMs - 48 * 3600 * 1000).toISOString())
      .lte("created_at", new Date(nowMs - 12 * 3600 * 1000).toISOString());
  }
  if (opts.onlyUserId) q = q.eq("user_id", opts.onlyUserId);

  const { data: scans, error: scanErr } = await q;
  if (scanErr) throw new Error(`scan_events read failed: ${scanErr.message}`);

  // Most recent match per user wins (rows arrive newest first).
  const byUser = new Map<string, Candidate>();
  for (const s of scans ?? []) {
    if (!s.user_id || !s.matched_fragrance_id) continue;
    if (byUser.has(s.user_id)) continue;
    byUser.set(s.user_id, {
      userId: s.user_id,
      scanId: s.id,
      fragranceId: s.matched_fragrance_id,
      scannedAt: s.created_at,
    });
  }
  result.considered = byUser.size;
  if (byUser.size === 0) return result;

  const userIds = [...byUser.keys()];

  // 2. Cap: anyone sent to in the last 24 hours is out.
  if (!opts.now) {
    const { data: recent } = await supabase
      .from("push_sends")
      .select("user_id")
      .in("user_id", userIds)
      .gte("sent_at", new Date(nowMs - 24 * 3600 * 1000).toISOString());
    for (const r of recent ?? []) {
      if (byUser.delete(r.user_id)) result.skippedCapped++;
    }
  }
  if (byUser.size === 0) return result;

  // 3. Tokens. One enabled token per platform per user; a user with an
  //    iPhone and an Android phone gets it on both, which is correct.
  const { data: tokens } = await supabase
    .from("push_tokens")
    .select("id, user_id, token, platform")
    .in("user_id", [...byUser.keys()])
    .eq("enabled", true);

  const tokensByUser = new Map<string, NonNullable<typeof tokens>>();
  for (const t of tokens ?? []) {
    const list = tokensByUser.get(t.user_id) ?? [];
    list.push(t);
    tokensByUser.set(t.user_id, list);
  }

  // 4. Fragrance names for the copy.
  const fragranceIds = [...new Set([...byUser.values()].map((c) => c.fragranceId))];
  const { data: frags } = await supabase
    .from("fragrances")
    .select("id, name, house")
    .in("id", fragranceIds);
  const fragById = new Map((frags ?? []).map((f) => [f.id, f]));

  // 5. Send.
  for (const cand of byUser.values()) {
    const userTokens = tokensByUser.get(cand.userId) ?? [];
    if (userTokens.length === 0) {
      result.skippedNoToken++;
      continue;
    }
    const frag = fragById.get(cand.fragranceId);
    if (!frag) {
      result.details.push(`fragrance ${cand.fragranceId} missing, skipped`);
      continue;
    }

    for (const t of userTokens) {
      if (t.platform !== "ios") {
        // FCM lands with the Android half of slice 5.
        continue;
      }

      // The send row is written first so the sendId can ride in the
      // payload; status is filled in after APNs answers.
      const { data: sendRow, error: insErr } = await supabase
        .from("push_sends")
        .insert({
          user_id: cand.userId,
          token_id: t.id,
          campaign: CAMPAIGN,
          fragrance_id: cand.fragranceId,
          scan_event_id: cand.scanId,
        })
        .select("id")
        .single();
      if (insErr || !sendRow) {
        result.failed++;
        result.details.push(`push_sends insert failed: ${insErr?.message}`);
        continue;
      }

      try {
        const r = await sendApns(t.token, {
          title: `${frag.name} by ${frag.house}`,
          body: "Here's how it wears, and what to compare it to.",
          path: `/fragrance/${frag.id}`,
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
          result.details.push(`apns ${r.status} ${r.reason ?? ""} for user ${cand.userId}`);
          if (r.tokenDead) {
            await supabase.from("push_tokens").update({ enabled: false }).eq("id", t.id);
            result.tokensDisabled++;
          }
        }
      } catch (e) {
        result.failed++;
        const msg = e instanceof Error ? e.message : String(e);
        result.details.push(`apns transport error: ${msg}`);
        await supabase
          .from("push_sends")
          .update({ apns_status: 0, apns_reason: msg.slice(0, 120) })
          .eq("id", sendRow.id);
      }
    }
  }

  return result;
}

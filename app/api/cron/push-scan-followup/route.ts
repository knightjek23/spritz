// GET /api/cron/push-scan-followup
//
// Also runs the Pro-trial reminder campaign (lib/push-trial.ts) after the
// scan follow-up; one Vercel cron slot, two campaigns.
//
// Daily, from vercel.json (17:00 UTC = 10:00 Pacific). Vercel calls it with
// `Authorization: Bearer <CRON_SECRET>`; anything else is a 401 so the
// route cannot be used to send from outside. The job is idempotent: a
// second call the same day sends nothing (lib/push-scan-followup.ts).

import { NextResponse } from "next/server";
import { runScanFollowup } from "@/lib/push-scan-followup";
import { runTrialReminders } from "@/lib/push-trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runScanFollowup();
    console.log("[cron/push-scan-followup]", JSON.stringify(result));
    // Pro-trial reminders ride the same daily slot (lib/push-trial.ts). A
    // failure there must not mask the scan job's result, and vice versa.
    let trial: unknown = null;
    try {
      trial = await runTrialReminders();
      console.log("[cron/push-trial]", JSON.stringify(trial));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[cron/push-trial] failed", msg);
      trial = { error: msg };
    }
    return NextResponse.json({ ...result, trial });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/push-scan-followup] failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

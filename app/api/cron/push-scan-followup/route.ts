// GET /api/cron/push-scan-followup
//
// Daily, from vercel.json (17:00 UTC = 10:00 Pacific). Vercel calls it with
// `Authorization: Bearer <CRON_SECRET>`; anything else is a 401 so the
// route cannot be used to send from outside. The job is idempotent: a
// second call the same day sends nothing (lib/push-scan-followup.ts).

import { NextResponse } from "next/server";
import { runScanFollowup } from "@/lib/push-scan-followup";

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
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/push-scan-followup] failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

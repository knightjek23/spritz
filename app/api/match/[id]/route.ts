// GET /api/match/[id]?day=YYYY-MM-DD
//
// The signed-in user's match score for one fragrance.
//
//   401  signed out
//   404  fragrance not found
//   200  { state: "needs_shelf", contributing, min }      fewer than 3 bottles
//   200  { state: "ok", score, label, reasons, sharedNotes, warningNote,
//          pro, remaining }                                 reasons only for Pro
//   402  { state: "locked", cap }                           free cap reached
//
// Free users: FREE_WEEKLY_CAP.match new fragrances a week (lib/feature-uses).
// `day` is the client's local day; it only decides which week a use lands
// in, so a missing or malformed value falls back to UTC today.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAppUser } from "@/lib/users";
import { tasteProfile, profileReady, MIN_SHELF, TASTE_COLUMNS, type TasteRow } from "@/lib/taste";
import { scoreMatch } from "@/lib/match";
import { spendUse } from "@/lib/feature-uses";
import { isIsoDate } from "@/lib/wear-log";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await ensureAppUser(userId);
  if (!user) return NextResponse.json({ error: "user_provision_failed" }, { status: 500 });

  const dayParam = new URL(req.url).searchParams.get("day");
  const day = dayParam && isIsoDate(dayParam) ? dayParam : new Date().toISOString().slice(0, 10);
  const isPro = user.plan === "pro";

  const supabase = createAdminClient();
  const [{ data: row }, profile] = await Promise.all([
    supabase.from("fragrances").select(TASTE_COLUMNS).eq("id", params.id).maybeSingle(),
    tasteProfile(user.id),
  ]);
  if (!row) return NextResponse.json({ error: "fragrance_not_found" }, { status: 404 });

  if (!profileReady(profile)) {
    return NextResponse.json({ state: "needs_shelf", contributing: profile.contributing, min: MIN_SHELF });
  }

  let remaining: number | null = null;
  if (!isPro) {
    const use = await spendUse(user.id, "match", params.id, day);
    if (!use.allowed) return NextResponse.json({ state: "locked", cap: use.cap }, { status: 402 });
    remaining = use.remaining;
  }

  const result = scoreMatch(profile, row as unknown as TasteRow);
  return NextResponse.json({
    state: "ok",
    score: result.score,
    label: result.label,
    reasons: isPro ? result.reasons : [],
    sharedNotes: isPro ? result.sharedNotes : [],
    warningNote: isPro ? result.warningNote : null,
    pro: isPro,
    remaining,
  });
}

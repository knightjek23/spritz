// POST /api/dupes/ai/[id]
//
// RETIRED (Oct 2026). The "Known dupes" section was replaced by
// cost-effective options (/api/cost-effective/[id], migration 0037), which
// ranks by scent similarity and live retailer price instead of relying on
// an editorial or AI entry per fragrance. Nothing in the app calls this
// route any more; it returns 410 so an old client or a bookmarked request
// can't trigger a paid OpenAI call. The generator in lib/ai-dupes.ts is
// kept for the scraper's batch use.
//
// Original behaviour, for reference: generates AI dupes for a fragrance
// and caches them to the DB. Pro-only. Idempotent.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDupesWithAI } from "@/lib/ai-dupes";
import { checkAiGenLimit } from "@/lib/rate-limit";
import type { DupeRecommendation, Fragrance } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Flip to true only to bring the old generator back deliberately. */
const RETIRED_ROUTE_ENABLED = false;

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!RETIRED_ROUTE_ENABLED) {
    return NextResponse.json(
      { error: "gone", message: "Known dupes was replaced by cost-effective options." },
      { status: 410 },
    );
  }

  // 1. Identity
  const { userId: clerkUserId } = auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // 2. Pro plan check
  const { data: appUser } = await supabase
    .from("users")
    .select("id, plan")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (!appUser) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }
  if (appUser.plan !== "pro") {
    return NextResponse.json(
      { error: "pro_required", message: "AI dupes are a Pro feature." },
      { status: 402 },
    );
  }

  // 3. Load the fragrance
  const { data: fragrance, error: fragErr } = await supabase
    .from("fragrances")
    .select("*")
    .eq("id", params.id)
    .maybeSingle<Fragrance>();
  if (fragErr || !fragrance) {
    return NextResponse.json({ error: "fragrance_not_found" }, { status: 404 });
  }

  // 4. Cache check — return existing dupes if present
  if (fragrance.dupes && fragrance.dupes.length > 0) {
    return NextResponse.json({ dupes: fragrance.dupes, cached: true });
  }

  // 4b. Burst ceiling — only reached on a cache miss (a real model call).
  if (!checkAiGenLimit(appUser.id)) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "You're generating a lot right now. Give it a minute and try again.",
      },
      { status: 429 },
    );
  }

  // 5. Generate via OpenAI
  let dupes: DupeRecommendation[];
  try {
    dupes = await generateDupesWithAI(fragrance);
  } catch (err) {
    console.error("[ai-dupes] generation failed", err);
    return NextResponse.json(
      { error: "generation_failed", message: String(err) },
      { status: 500 },
    );
  }

  if (dupes.length === 0) {
    // Don't write empty arrays to the DB — leaves the door open for a future
    // model run to find dupes a current run missed.
    return NextResponse.json({ dupes: [], cached: false, generated: 0 });
  }

  // 6. Save to DB (cache for next request)
  const { error: updErr } = await supabase
    .from("fragrances")
    .update({ dupes })
    .eq("id", fragrance.id);
  if (updErr) {
    console.error("[ai-dupes] cache write failed", updErr);
    // Still return the dupes — caching is best-effort
  }

  return NextResponse.json({ dupes, cached: false, generated: dupes.length });
}

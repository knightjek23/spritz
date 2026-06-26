// POST /api/consensus/[id]
//
// Generates the AI community-consensus take for a fragrance and caches
// it to the DB. Pro-only. Idempotent: if a consensus has already been
// generated (any prior request), returns the cached record without a
// new OpenAI call.
//
// Mirrors the shape of /api/dupes/ai/[id] — same auth, same Pro gate,
// same cache-then-generate flow, same Pro-required (402) behavior.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateConsensusWithAI } from "@/lib/ai-consensus";
import type { Fragrance } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
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
      { error: "pro_required", message: "AI consensus is a Pro feature." },
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

  // 4. Cache check — return existing consensus if present
  if (fragrance.consensus_summary && fragrance.consensus_generated_at) {
    return NextResponse.json({
      consensus: {
        summary: fragrance.consensus_summary,
        verdict: fragrance.consensus_verdict ?? "",
        pros: fragrance.consensus_pros ?? [],
        cons: fragrance.consensus_cons ?? [],
        confidence: fragrance.consensus_confidence ?? 0.5,
        generated_at: fragrance.consensus_generated_at,
      },
      cached: true,
    });
  }

  // 5. Generate via OpenAI
  let consensus: Awaited<ReturnType<typeof generateConsensusWithAI>>;
  try {
    consensus = await generateConsensusWithAI(fragrance);
  } catch (err) {
    console.error("[ai-consensus] generation failed", err);
    return NextResponse.json(
      { error: "generation_failed", message: String(err) },
      { status: 500 },
    );
  }

  if (!consensus) {
    // Model returned malformed output — don't poison the cache; let a
    // future request try again with a fresh roll of the dice.
    return NextResponse.json(
      { error: "no_consensus", message: "Couldn't synthesize a clean consensus. Try again in a moment." },
      { status: 503 },
    );
  }

  // 6. Save to DB (cache for next request)
  const { error: updErr } = await supabase
    .from("fragrances")
    .update({
      consensus_summary: consensus.summary,
      consensus_verdict: consensus.verdict,
      consensus_pros: consensus.pros,
      consensus_cons: consensus.cons,
      consensus_confidence: consensus.confidence,
      consensus_generated_at: consensus.generated_at,
    })
    .eq("id", fragrance.id);
  if (updErr) {
    console.error("[ai-consensus] cache write failed", updErr);
    // Still return the consensus — caching is best-effort.
  }

  return NextResponse.json({ consensus, cached: false });
}

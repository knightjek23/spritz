// GET /api/dupes/[id]?tier=budget|mid|designer|niche
// Returns ranked similar fragrances (PRD §6 P0.5 + §8).
//
// Two-tier strategy:
//   1. Pre-computed dupe_pairs (fast, sortable, batch-built nightly).
//   2. Runtime pgvector fallback via find_similar_fragrances() RPC for
//      anything dupe_pairs doesn't cover yet (newly added rows, fragrances
//      whose vectors were null when the batch ran, etc.).
//
// Free tier: top 5. Pro: top 25. (Per PRD §6 P0.5 revised.)

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DupeResult, Fragrance, PriceTier } from "@/lib/types";

export const runtime = "nodejs";

const VALID_TIERS: PriceTier[] = ["budget", "mid", "designer", "niche"];

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const url = new URL(req.url);
  const tierParam = url.searchParams.get("tier");
  const tier = VALID_TIERS.includes(tierParam as PriceTier)
    ? (tierParam as PriceTier)
    : null;

  // Identity → free vs pro
  const { userId: clerkUserId } = auth();
  const supabase = createAdminClient();
  let isPro = false;
  if (clerkUserId) {
    const { data: u } = await supabase
      .from("users")
      .select("plan")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();
    isPro = u?.plan === "pro";
  }
  // Per PRD §6 P0.5 (revised): 5 free / 25 Pro for the opt-in section.
  const limit = isPro ? 25 : 5;

  // Source fragrance (for price delta + existence check)
  const { data: source, error: sourceErr } = await supabase
    .from("fragrances")
    .select("*")
    .eq("id", params.id)
    .maybeSingle<Fragrance>();
  if (sourceErr || !source) {
    return NextResponse.json({ error: "fragrance_not_found" }, { status: 404 });
  }

  // ---- Tier 1: pre-computed dupe_pairs ----
  const { data: pairs, error: pairsErr } = await supabase
    .from("dupe_pairs")
    .select(
      `
        score,
        shared_notes,
        fragrance:fragrances!dupe_pairs_fragrance_b_fkey(*)
      `,
    )
    .eq("fragrance_a", params.id)
    .order("score", { ascending: false });

  if (pairsErr) {
    return NextResponse.json({ error: pairsErr.message }, { status: 500 });
  }

  let results: DupeResult[] = (pairs ?? [])
    .map((p: any) => {
      const f = p.fragrance as Fragrance;
      return {
        fragrance: f,
        similarity: p.score,
        similarity_pct: Math.round(p.score * 100),
        price_delta:
          source.avg_retail_price !== null && f.avg_retail_price !== null
            ? Number(f.avg_retail_price) - Number(source.avg_retail_price)
            : null,
        shared_notes: Array.isArray(p.shared_notes)
          ? p.shared_notes.slice(0, 3).map((s: any) => s.name)
          : [],
      };
    })
    .filter((r) => (tier ? r.fragrance.price_tier === tier : true))
    .slice(0, limit);

  // ---- Tier 2: runtime pgvector fallback ----
  // Triggers when the pre-computed table has nothing for this source. The
  // RPC uses the existing ivfflat cosine index, so this is cheap at our
  // scale (~10k rows). A tier filter narrows after the fact, so we ask
  // for a slightly larger pool to keep the requested limit reachable.
  if (results.length === 0) {
    const fallbackPool = tier ? Math.max(limit * 4, 20) : limit;
    const { data: similar, error: similarErr } = await supabase.rpc(
      "find_similar_fragrances",
      { p_id: params.id, p_limit: fallbackPool },
    );

    if (similarErr) {
      // Don't fail the response — the pre-computed query already succeeded
      // with an empty result. Log and return [] so the UI shows the
      // "no close matches yet" state instead of an error.
      console.warn(
        "[api/dupes] find_similar_fragrances RPC failed:",
        similarErr.message,
      );
    } else if (Array.isArray(similar) && similar.length > 0) {
      // Enrich each hit with shared_notes via the helper RPC. We do this
      // sequentially-but-bounded (Promise.all over a small array) — the
      // RPC is a simple jsonb intersection on indexed rows, fast enough
      // not to need batching at this scale.
      const enriched = await Promise.all(
        similar.map(async (row: any) => {
          const { data: shared } = await supabase.rpc(
            "shared_notes_between",
            { p_a: params.id, p_b: row.id, p_limit: 3 },
          );
          return { row, shared: shared ?? [] };
        }),
      );

      results = enriched
        .map(({ row, shared }) => {
          const f = row as Fragrance;
          return {
            fragrance: f,
            similarity: row.similarity,
            similarity_pct: Math.round((row.similarity ?? 0) * 100),
            price_delta:
              source.avg_retail_price !== null && f.avg_retail_price !== null
                ? Number(f.avg_retail_price) - Number(source.avg_retail_price)
                : null,
            shared_notes: Array.isArray(shared)
              ? shared.map((s: any) => s.name).filter(Boolean)
              : [],
          };
        })
        .filter((r) => (tier ? r.fragrance.price_tier === tier : true))
        .slice(0, limit);
    }
  }

  return NextResponse.json({
    source,
    results,
    truncated: !isPro,
  });
}

// GET /api/cost-effective/[id]
//
// Cheaper fragrances that smell close to this one, with live retailer
// prices. Replaces the "Known dupes" engine on the detail page (see
// migration 0037 for the ranking and why).
//
// Pro gate, same shape as /api/perfumer/[id]:
//   signed out            -> 401, client shows the upsell
//   signed in, not Pro    -> 200 with a teaser: the count and the best
//                            saving, but no names, so the upsell can say
//                            "3 options, save up to $85" honestly
//   Pro                   -> 200 with the full list
//
// Entitlement comes from users.plan in Supabase, never Clerk metadata, so
// manually comped accounts are recognised.
//
// Why no result when the source has no price: a saving needs something to
// save against. The response says so (`reason`) so the UI can explain
// rather than show an empty list.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };
// Five, not ten: a shortlist to choose from, not a page to sift through.
// The ranking already puts the best saving-for-similarity first, so the
// rows cut are the weakest ones.
const FULL_LIMIT = 5;

/** Trust order for reference prices; mirrors migration 0039. */
const SOURCE_PRIORITY: Record<string, number> = {
  gpt_estimate: 1,
  house_median: 2,
  house_estimate: 3,
  gpt_guess: 4,
};
/** House-level and forced tiers are "rough": shown with a stronger caveat. */
function isRough(source: string): boolean {
  return (SOURCE_PRIORITY[source] ?? 9) >= 2;
}

export interface CostEffectiveOption {
  id: string;
  name: string;
  house: string;
  family: string[] | null;
  year: number | null;
  bottle_image_url: string | null;
  similarity: number;
  /** For 100 ml. */
  price: number;
  currency: string;
  /** Null when the price is an estimate rather than a listing. */
  retailer: string | null;
  product_url: string | null;
  /** True when `price` is a model estimate of list price, not a listing. */
  estimated: boolean;
  /** True for the house-level and forced tiers: estimate with wide error bars. */
  rough: boolean;
  saving: number;
  saving_pct: number;
}

export interface CostEffectiveResponse {
  /** Best price we have for the source fragrance, for 100 ml. */
  sourcePrice: { price: number; currency: string; estimated: boolean; rough: boolean } | null;
  /** Full list for Pro; empty for free users. */
  options: CostEffectiveOption[];
  /** For free users: enough to write an honest upsell line. */
  teaser: { count: number; bestSaving: number; currency: string } | null;
  /** Why the list is empty, when it is. */
  reason: "no_source_price" | "no_matches" | null;
  pro: boolean;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("plan")
    .eq("clerk_user_id", userId)
    .maybeSingle();
  const pro = user?.plan === "pro";

  // Source price: a real offer first, then a reference estimate (0038).
  // It decides whether the feature can run at all, and the UI needs it for
  // the "you'd pay $X" framing either way.
  const [{ data: srcOffer }, { data: srcRef }] = await Promise.all([
    supabase
      .from("fragrance_offers")
      .select("price, currency")
      .eq("fragrance_id", params.id)
      .not("price", "is", null)
      .eq("in_stock", true)
      .order("price", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("fragrance_prices")
      .select("price_per_ml, currency, source")
      .eq("fragrance_id", params.id),
  ]);

  // Most trustworthy reference first (same order as migration 0039), never
  // the cheapest: a rough guess must not override a confident estimate.
  const best = (srcRef ?? [])
    .map((r) => ({ ...r, pri: SOURCE_PRIORITY[r.source] ?? 9 }))
    .sort((a, b) => a.pri - b.pri || Number(a.price_per_ml) - Number(b.price_per_ml))[0];

  const sourcePrice =
    srcOffer?.price != null
      ? { price: Number(srcOffer.price), currency: srcOffer.currency, estimated: false, rough: false }
      : best?.price_per_ml != null
        ? {
            price: Number(best.price_per_ml) * 100,
            currency: best.currency,
            estimated: true,
            rough: isRough(best.source),
          }
        : null;

  if (!sourcePrice) {
    const body: CostEffectiveResponse = {
      sourcePrice: null,
      options: [],
      teaser: null,
      reason: "no_source_price",
      pro,
    };
    return NextResponse.json(body, { headers: NO_STORE });
  }

  const { data, error } = await supabase.rpc("find_cost_effective_options", {
    p_id: params.id,
    p_limit: FULL_LIMIT,
  });
  if (error) {
    console.error("[cost-effective] rpc failed:", error.message);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500, headers: NO_STORE });
  }

  const options: CostEffectiveOption[] = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    house: r.house,
    family: r.family,
    year: r.year,
    bottle_image_url: r.bottle_image_url,
    similarity: Number(r.similarity),
    price: Number(r.price),
    currency: r.currency,
    retailer: r.retailer,
    product_url: r.product_url,
    estimated: r.price_source !== "offer",
    rough: isRough(r.price_source),
    saving: Number(r.saving),
    saving_pct: Number(r.saving_pct),
  }));

  if (options.length === 0) {
    const body: CostEffectiveResponse = {
      sourcePrice,
      options: [],
      teaser: null,
      reason: "no_matches",
      pro,
    };
    return NextResponse.json(body, { headers: NO_STORE });
  }

  if (!pro) {
    // Free users learn that options exist and how much the best one saves,
    // which is a true statement and a reason to upgrade. Names stay behind
    // the gate.
    const body: CostEffectiveResponse = {
      sourcePrice,
      options: [],
      teaser: {
        count: options.length,
        bestSaving: Math.max(...options.map((o) => o.saving)),
        currency: sourcePrice.currency,
      },
      reason: null,
      pro: false,
    };
    return NextResponse.json(body, { headers: NO_STORE });
  }

  const body: CostEffectiveResponse = { sourcePrice, options, teaser: null, reason: null, pro: true };
  return NextResponse.json(body, { headers: NO_STORE });
}

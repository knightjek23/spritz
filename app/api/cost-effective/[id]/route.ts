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
const FULL_LIMIT = 10;

export interface CostEffectiveOption {
  id: string;
  name: string;
  house: string;
  family: string[] | null;
  year: number | null;
  bottle_image_url: string | null;
  similarity: number;
  price: number;
  currency: string;
  retailer: string;
  product_url: string;
  saving: number;
  saving_pct: number;
}

export interface CostEffectiveResponse {
  /** Cheapest in-stock price we have for the source fragrance. */
  sourcePrice: { price: number; currency: string } | null;
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

  // Source price first: it decides whether the feature can run at all and
  // the UI needs it for the "you'd pay $X" framing either way.
  const { data: srcOffer } = await supabase
    .from("fragrance_offers")
    .select("price, currency")
    .eq("fragrance_id", params.id)
    .not("price", "is", null)
    .eq("in_stock", true)
    .order("price", { ascending: true })
    .limit(1)
    .maybeSingle();

  const sourcePrice =
    srcOffer?.price != null
      ? { price: Number(srcOffer.price), currency: srcOffer.currency }
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

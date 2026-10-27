// GET /api/layer/[id]
//
// Bottles on the signed-in user's Owned shelf that layer well with this
// fragrance (lib/layering.ts). Pro only; free users get the gate payload
// with the partner count so the section can say "3 pairings from your
// shelf" without leaking which ones.
//
//   401  signed out
//   404  fragrance not found
//   200  { state: "needs_shelf", owned }        fewer than 2 other owned bottles
//   200  { state: "none" }                       nothing on the shelf pairs well
//   200  { state: "ok", pairs }                  Pro
//   402  { state: "locked", count }              free

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAppUser } from "@/lib/users";
import { bestLayers, LAYER_COLUMNS, type LayerRow } from "@/lib/layering";

export const runtime = "nodejs";
const MIN_OTHERS = 2;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await ensureAppUser(userId);
  if (!user) return NextResponse.json({ error: "user_provision_failed" }, { status: 500 });

  const supabase = createAdminClient();
  const [{ data: target }, { data: items }] = await Promise.all([
    supabase.from("fragrances").select(LAYER_COLUMNS).eq("id", params.id).maybeSingle(),
    supabase.from("collection_items").select("fragrance_id").eq("user_id", user.id).eq("status", "own").limit(200),
  ]);
  if (!target) return NextResponse.json({ error: "fragrance_not_found" }, { status: 404 });

  const otherIds = (items ?? []).map((i) => i.fragrance_id).filter((id) => id !== params.id);
  if (otherIds.length < MIN_OTHERS) {
    return NextResponse.json({ state: "needs_shelf", owned: otherIds.length, min: MIN_OTHERS });
  }

  const { data: shelf } = await supabase.from("fragrances").select(LAYER_COLUMNS).in("id", otherIds);
  const pairs = bestLayers(target as unknown as LayerRow, (shelf ?? []) as unknown as LayerRow[]);
  if (pairs.length === 0) return NextResponse.json({ state: "none" });

  if (user.plan !== "pro") {
    return NextResponse.json({ state: "locked", count: pairs.length }, { status: 402 });
  }
  return NextResponse.json({ state: "ok", pairs });
}

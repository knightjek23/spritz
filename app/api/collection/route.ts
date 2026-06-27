// GET    /api/collection?status=own|tried|wishlist
// POST   /api/collection      body: { fragrance_id, status, note? }
// DELETE /api/collection?id=<collection_item_id>
//
// Auth required. Free tier capped at 25 items total (Q5 — easy to tune).

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAppUser } from "@/lib/users";

export const runtime = "nodejs";

const FREE_COLLECTION_CAP = 25;

const PostBody = z.object({
  fragrance_id: z.string().uuid(),
  status: z.enum(["own", "tried", "wishlist"]),
  note: z.string().max(500).optional(),
});

export async function GET(req: Request) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Read-only lookup. If the users row doesn't exist yet, return an
  // empty collection rather than backfilling — GET shouldn't have side
  // effects, and the first POST will provision the row.
  const supabase0 = createAdminClient();
  const { data: user } = await supabase0
    .from("users")
    .select("id, plan")
    .eq("clerk_user_id", userId)
    .maybeSingle();
  if (!user) return NextResponse.json({ items: [] });

  const url = new URL(req.url);
  const rawStatus = url.searchParams.get("status");
  const status: "own" | "tried" | "wishlist" | null =
    rawStatus === "own" || rawStatus === "tried" || rawStatus === "wishlist"
      ? rawStatus
      : null;

  const supabase = createAdminClient();
  let query = supabase
    .from("collection_items")
    .select("*, fragrance:fragrances(*)")
    .eq("user_id", user.id)
    .order("added_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Bundle in the user's reactions so the shelf can render the
  // like/dislike indicator icons without a second round trip. Pull every
  // reaction this user has (typically a small set) and merge by
  // fragrance_id. If the reactions table doesn't exist yet (migration
  // 0013 not applied), fall through silently — items render without
  // the indicator instead of 500-ing the whole shelf.
  let reactionByFragrance: Record<string, "like" | "dislike"> = {};
  try {
    const { data: reactions } = await supabase
      .from("user_reactions")
      .select("fragrance_id, reaction")
      .eq("user_id", user.id);
    if (reactions) {
      for (const r of reactions) {
        reactionByFragrance[r.fragrance_id] = r.reaction;
      }
    }
  } catch {
    /* silent fallthrough — see comment above */
  }

  const items = (data ?? []).map((it: { fragrance_id: string } & Record<string, unknown>) => ({
    ...it,
    reaction: reactionByFragrance[it.fragrance_id] ?? null,
  }));

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = PostBody.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  // ensureAppUser backfills the users row if the Clerk webhook missed it.
  // Previously this 404'd silently and the SaveButton stuck on "Try again"
  // (Session 01 bug). Now the first save for a freshly-signed-up user
  // creates the row on the spot.
  const user = await ensureAppUser(userId);
  if (!user) return NextResponse.json({ error: "user_provision_failed" }, { status: 500 });

  const supabase = createAdminClient();

  // Free tier cap
  if (user.plan === "free") {
    const { count } = await supabase
      .from("collection_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if ((count ?? 0) >= FREE_COLLECTION_CAP) {
      return NextResponse.json(
        { error: "collection_cap_reached", cap: FREE_COLLECTION_CAP },
        { status: 402 },
      );
    }
  }

  const { data, error } = await supabase
    .from("collection_items")
    .insert({
      user_id: user.id,
      fragrance_id: parsed.data.fragrance_id,
      status: parsed.data.status,
      note: parsed.data.note ?? null,
    })
    .select()
    .single();

  if (error) {
    // unique violation = already in collection at this status
    if (error.code === "23505") {
      return NextResponse.json({ error: "already_saved" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ item: data });
}

export async function DELETE(req: Request) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  // ensureAppUser backfills the users row if the Clerk webhook missed it.
  // Previously this 404'd silently and the SaveButton stuck on "Try again"
  // (Session 01 bug). Now the first save for a freshly-signed-up user
  // creates the row on the spot.
  const user = await ensureAppUser(userId);
  if (!user) return NextResponse.json({ error: "user_provision_failed" }, { status: 500 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("collection_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

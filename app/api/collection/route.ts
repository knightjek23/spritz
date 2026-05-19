// GET    /api/collection?status=own|tried|wishlist
// POST   /api/collection      body: { fragrance_id, status, note? }
// DELETE /api/collection?id=<collection_item_id>
//
// Auth required. Free tier capped at 25 items total (Q5 — easy to tune).

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const FREE_COLLECTION_CAP = 25;

const PostBody = z.object({
  fragrance_id: z.string().uuid(),
  status: z.enum(["own", "tried", "wishlist"]),
  note: z.string().max(500).optional(),
});

async function getAppUser(clerkUserId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("users")
    .select("id, plan")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  return data;
}

export async function GET(req: Request) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await getAppUser(userId);
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
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = PostBody.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const user = await getAppUser(userId);
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

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

  const user = await getAppUser(userId);
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("collection_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// POST   /api/reactions/[fragranceId]    body: { reaction: 'like' | 'dislike' | null }
//
// Toggle semantics, computed on the server from the desired final state:
//   { reaction: 'like' }    → upsert as 'like'  (or remain liked)
//   { reaction: 'dislike' } → upsert as 'dislike' (or swap from like)
//   { reaction: null }      → delete the row    (toggle off)
//
// The client uses this for the "tap the heart again to unlike" behavior:
// when the user taps Like and they already have a 'like' row, the client
// sends `{ reaction: null }` to clear it. Same for dislike.
//
// Returns { reaction: 'like' | 'dislike' | null } reflecting the final
// state, so optimistic UI updates can reconcile.

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAppUser } from "@/lib/users";
import type { Reaction } from "@/lib/types";

export const runtime = "nodejs";

const PostBody = z.object({
  reaction: z.union([z.literal("like"), z.literal("dislike"), z.null()]),
});

export async function POST(
  req: Request,
  { params }: { params: { fragranceId: string } },
) {
  const { userId: clerkUserId } = auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = PostBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const desired = parsed.data.reaction;

  // ensureAppUser backfills the users row if the Clerk webhook missed it
  // (same Session 01 backstop the collection routes use).
  const user = await ensureAppUser(clerkUserId);
  if (!user) {
    return NextResponse.json(
      { error: "user_provision_failed" },
      { status: 500 },
    );
  }

  const supabase = createAdminClient();

  if (desired === null) {
    // Toggle off — delete the row. Safe to call when no row exists.
    const { error } = await supabase
      .from("user_reactions")
      .delete()
      .eq("user_id", user.id)
      .eq("fragrance_id", params.fragranceId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ reaction: null });
  }

  // Upsert — switches between like/dislike or creates a new row. The
  // composite PK (user_id, fragrance_id) handles the conflict naturally.
  const { error } = await supabase.from("user_reactions").upsert(
    {
      user_id: user.id,
      fragrance_id: params.fragranceId,
      reaction: desired as Reaction,
    },
    { onConflict: "user_id,fragrance_id" },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ reaction: desired });
}

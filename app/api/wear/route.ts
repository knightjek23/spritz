// GET    /api/wear?day=YYYY-MM-DD   entries for one local day (default: all, newest first)
// POST   /api/wear      body: { fragrance_id, worn_on }   worn_on = client's local day
// DELETE /api/wear?id=<wear_log id>
//
// Auth required. POST only accepts bottles on the user's Owned shelf; the
// home prompt is built from that shelf, so anything else is a forged body.
// Re-logging the same bottle on the same day is a no-op (unique index),
// returned as 200 with the existing row.
//
// POST also returns the streak ending on worn_on and whether this was the
// first log of that day, so the client can show the streak toast exactly
// once per day without a second request.

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAppUser } from "@/lib/users";
import { isIsoDate, wearDays, wearHistory, wornOn } from "@/lib/wear-log";
import { isFirstLogOfDay, streakEndingOn } from "@/lib/streak";

export const runtime = "nodejs";

const PostBody = z.object({
  fragrance_id: z.string().uuid(),
  worn_on: z.string().refine(isIsoDate, "worn_on must be YYYY-MM-DD"),
});

async function appUserId(clerkUserId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("users")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  return data?.id ?? null;
}

export async function GET(req: Request) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = await appUserId(userId);
  if (!id) return NextResponse.json({ entries: [] });

  const day = new URL(req.url).searchParams.get("day");
  if (day && !isIsoDate(day)) return NextResponse.json({ error: "invalid_day" }, { status: 400 });
  const entries = day ? await wornOn(id, day) : await wearHistory(id);
  return NextResponse.json({ entries });
}

export async function POST(req: Request) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = PostBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const user = await ensureAppUser(userId);
  if (!user) return NextResponse.json({ error: "user_provision_failed" }, { status: 500 });

  const supabase = createAdminClient();
  const { fragrance_id, worn_on } = parsed.data;

  const { count } = await supabase
    .from("collection_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("fragrance_id", fragrance_id)
    .eq("status", "own");
  if (!count) return NextResponse.json({ error: "not_owned" }, { status: 403 });

  // Days before this write decide "first log today" and the streak.
  const daysBefore = await wearDays(user.id);
  const firstToday = isFirstLogOfDay(daysBefore, worn_on);

  const { error } = await supabase
    .from("wear_log")
    .upsert(
      { user_id: user.id, fragrance_id, worn_on },
      { onConflict: "user_id,fragrance_id,worn_on", ignoreDuplicates: true },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return the whole day so the client can swap state in one go.
  const entries = await wornOn(user.id, worn_on);
  const streak = streakEndingOn([...daysBefore, worn_on], worn_on);
  // Day 1 after a broken streak reads "Welcome back"; a brand-new user's
  // first log does not.
  const returning = firstToday && streak === 1 && daysBefore.length > 0;
  return NextResponse.json({ entries, streak, firstToday, returning });
}

export async function DELETE(req: Request) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = await appUserId(userId);
  if (!id) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const entryId = new URL(req.url).searchParams.get("id");
  if (!entryId || !z.string().uuid().safeParse(entryId).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const { error } = await createAdminClient()
    .from("wear_log")
    .delete()
    .eq("id", entryId)
    .eq("user_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

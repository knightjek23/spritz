// POST /api/push/opened { sendId }
//
// The bridge calls this when a notification tap wakes the app. Stamps
// opened_at on the send row, which is the numerator of the one-pager's
// "push -> session" metric. Scoped to the caller's own sends so a guessed
// id cannot mark someone else's notification opened.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAppUser } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { sendId?: unknown } | null;
  const sendId = typeof body?.sendId === "string" ? body.sendId : "";
  if (!UUID.test(sendId)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const appUser = await ensureAppUser(userId);
  if (!appUser) return NextResponse.json({ ok: false });

  const supabase = createAdminClient();
  await supabase
    .from("push_sends")
    .update({ opened_at: new Date().toISOString() })
    .eq("id", sendId)
    .eq("user_id", appUser.id)
    .is("opened_at", null);
  return NextResponse.json({ ok: true });
}

// POST /api/push/register   { token, platform }   -> upsert, enabled
// DELETE /api/push/register { token? }            -> disable (all of the
//                                                   user's tokens if none given)
//
// Called by lib/push.ts from inside the shell after the OS grants
// permission, on every token refresh, and from the Account toggle.
// Clerk-authenticated; the token is stored against the app user row.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAppUser } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// APNs tokens are 64 hex chars; FCM tokens are longer and opaque. Bound
// the length rather than the shape so Android does not need a code change.
const TOKEN_PATTERN = /^[A-Za-z0-9_:\-]{32,512}$/;

export async function POST(req: Request) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { token?: unknown; platform?: unknown }
    | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const platform = body?.platform === "android" ? "android" : body?.platform === "ios" ? "ios" : null;
  if (!TOKEN_PATTERN.test(token) || !platform) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const appUser = await ensureAppUser(userId);
  if (!appUser) return NextResponse.json({ error: "no user" }, { status: 500 });

  const supabase = createAdminClient();
  // A token that moved to a different user (signed out, signed in as
  // someone else on the same phone) follows the new user. `token` is unique.
  const { error } = await supabase.from("push_tokens").upsert(
    {
      user_id: appUser.id,
      token,
      platform,
      enabled: true,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "token" },
  );
  if (error) {
    console.error("[push/register] upsert failed", error.message);
    return NextResponse.json({ error: "store failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : null;

  const appUser = await ensureAppUser(userId);
  if (!appUser) return NextResponse.json({ error: "no user" }, { status: 500 });

  const supabase = createAdminClient();
  let q = supabase.from("push_tokens").update({ enabled: false }).eq("user_id", appUser.id);
  if (token) q = q.eq("token", token);
  const { error } = await q;
  if (error) {
    console.error("[push/register] disable failed", error.message);
    return NextResponse.json({ error: "store failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** GET -> { enabled: boolean } for the Account toggle's initial state. */
export async function GET() {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const appUser = await ensureAppUser(userId);
  if (!appUser) return NextResponse.json({ enabled: false });
  const supabase = createAdminClient();
  const { count } = await supabase
    .from("push_tokens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", appUser.id)
    .eq("enabled", true);
  return NextResponse.json({ enabled: (count ?? 0) > 0 });
}

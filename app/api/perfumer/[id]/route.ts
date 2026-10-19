// GET /api/perfumer/[id] — the perfumer credit for one fragrance, Pro only.
//
// The fragrance page is ISR-cached and identical for every visitor, so the
// credit cannot live in its HTML or RSC payload. The page renders a
// <PerfumerCredit> client component that calls this route; the route
// decides entitlement from Supabase (users.plan) and only then returns the
// name.
//
//   401  signed out
//   402  signed in, not Pro       -> client shows the upsell
//   200  { perfumer, slug } | { perfumer: null } when uncredited

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { perfumerSlug } from "@/lib/perfumers";

export const runtime = "nodejs";

// Per-user answer: never let a CDN cache it.
const NO_STORE = { "Cache-Control": "private, no-store" };

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
  if (user?.plan !== "pro") {
    return NextResponse.json({ error: "pro_required" }, { status: 402, headers: NO_STORE });
  }

  const { data: f } = await supabase
    .from("fragrances")
    .select("perfumer")
    .eq("id", params.id)
    .maybeSingle();

  const name = f?.perfumer?.trim() || null;
  return NextResponse.json(
    { perfumer: name, slug: name ? perfumerSlug(name) : null },
    { headers: NO_STORE },
  );
}

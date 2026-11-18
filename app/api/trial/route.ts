// GET /api/trial → { used, endsAt, daysLeft, pro }
//
// `pro` is the account's real plan (Supabase users.plan via isProUser, the
// source of truth; Clerk metadata is missing on comped accounts), so the
// trial pitch can stand down for members.
//
// Read by the Pro gates (components/trial-cta.tsx) so they offer the free
// week only to people who have not had one. Signed-out callers get
// { used: false }: the offer is real for them and the store enforces
// intro-offer eligibility again at purchase time anyway.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { trialStateForClerkUser } from "@/lib/trial";
import { isProUser } from "@/lib/entitlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ used: false, endsAt: null, daysLeft: null, pro: false });
  const [s, pro] = await Promise.all([trialStateForClerkUser(userId), isProUser()]);
  return NextResponse.json({ used: s.used, endsAt: s.endsAt, daysLeft: s.daysLeft, pro });
}

// GET /api/trial → { used: boolean, endsAt: string | null, daysLeft: number | null }
//
// Read by the Pro gates (components/trial-cta.tsx) so they offer the free
// week only to people who have not had one. Signed-out callers get
// { used: false }: the offer is real for them and the store enforces
// intro-offer eligibility again at purchase time anyway.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { trialStateForClerkUser } from "@/lib/trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ used: false, endsAt: null, daysLeft: null });
  const s = await trialStateForClerkUser(userId);
  return NextResponse.json({ used: s.used, endsAt: s.endsAt, daysLeft: s.daysLeft });
}

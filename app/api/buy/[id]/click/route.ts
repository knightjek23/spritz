// POST /api/buy/[id]/click[?retailer=X]
//
// Logs one real Buy tap to affiliate_clicks. Called by the page
// (lib/buy-tap.ts, via navigator.sendBeacon) at the moment the person taps
// Buy, alongside the redirect to the retailer. Bots that follow the Buy
// link's href never run that code, so they no longer inflate the count.
//
// Same-origin only: a beacon from our own page carries Origin (and, in
// current browsers, Sec-Fetch-Site: same-origin). A request from anywhere
// else is accepted with 204 and not logged, so it learns nothing.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBuyTarget } from "@/lib/buy-target";
import { checkIpThrottle, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const none = () => new NextResponse(null, { status: 204 });

function sameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  // A person taps Buy a handful of times at most; 30/min per IP is generous.
  if (!sameOrigin(req) || !checkIpThrottle(`buy-tap:${clientIp(req)}`, 30)) return none();

  const supabase = createAdminClient();
  const { data: f } = await supabase
    .from("fragrances")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!f) return none();

  const { retailer } = await resolveBuyTarget(
    supabase,
    f,
    new URL(req.url).searchParams.get("retailer"),
  );

  const { userId: clerkUserId } = auth();
  let appUserId: string | null = null;
  if (clerkUserId) {
    const { data: u } = await supabase
      .from("users")
      .select("id")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();
    appUserId = u?.id ?? null;
  }
  const { error } = await supabase
    .from("affiliate_clicks")
    .insert({ user_id: appUserId, fragrance_id: f.id, retailer });
  if (error) console.warn("[buy-tap] click log failed:", error.message);
  return none();
}

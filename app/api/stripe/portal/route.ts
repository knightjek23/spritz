// POST /api/stripe/portal
//
// Creates a Stripe Customer Portal session for the signed-in user and
// returns the redirect URL. The portal is hosted by Stripe; it's where
// users cancel, swap monthly↔annual, update payment method, view next
// bill date, and download invoices. We never reimplement any of that.
//
// Requires:
//   - Authenticated Clerk user
//   - That user already has a Stripe customer record (i.e. they went
//     through /api/stripe/checkout at least once and the webhook stamped
//     stripe_customer_id on their users row). New free users have no
//     customer to manage and get 400 — the UI should hide the manage
//     button for free users so this is unreachable in practice.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST() {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: appUser } = await supabase
    .from("users")
    .select("stripe_customer_id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  const customerId = appUser?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json(
      { error: "no_subscription_to_manage" },
      { status: 400 },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/account`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    // Common cause: portal not configured in Stripe Dashboard. Hint the
    // operator at the fix without leaking the raw Stripe error to the user.
    const message = err instanceof Error ? err.message : "stripe_error";
    console.error("[stripe portal] session create failed:", message);
    return NextResponse.json(
      {
        error: "portal_unavailable",
        hint:
          "Configure the customer portal in Stripe Dashboard → Settings → Billing → Customer portal.",
      },
      { status: 500 },
    );
  }
}

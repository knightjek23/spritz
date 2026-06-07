// POST /api/stripe/checkout
// Body: { plan: "monthly" | "annual" }
// Creates a Stripe Checkout session for Pro and returns the URL.

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, currentUser } from "@clerk/nextjs/server";
import { stripe, STRIPE_PRICES } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAppUser } from "@/lib/users";

export const runtime = "nodejs";
// Force dynamic rendering — this route depends on env vars (Stripe key,
// Clerk session) that aren't available during static analysis. Without
// this, Next 14's build step can pull the module into "Collecting page
// data" and trigger Stripe initialization.
export const dynamic = "force-dynamic";

const Body = z.object({ plan: z.enum(["monthly", "annual"]) });

export async function POST(req: Request) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses[0]?.emailAddress;

  // ensureAppUser backfills the users row if the Clerk webhook missed it.
  // Previously a freshly-signed-up user trying to upgrade would 404 here
  // with no recovery path — Session 01 "can't unlock Pro" symptom.
  const appUser = await ensureAppUser(userId);
  if (!appUser) {
    return NextResponse.json({ error: "user_provision_failed" }, { status: 500 });
  }

  // Look up or create Stripe customer
  const supabase = createAdminClient();
  let customerId = appUser.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: email ?? undefined,
      metadata: { clerk_user_id: userId },
    });
    customerId = customer.id;
    await supabase
      .from("users")
      .update({ stripe_customer_id: customerId })
      .eq("id", appUser.id);
  }

  const priceId =
    parsed.data.plan === "annual" ? STRIPE_PRICES.pro_annual : STRIPE_PRICES.pro_monthly;
  if (!priceId) {
    return NextResponse.json({ error: "stripe_price_not_configured" }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/collection?upgraded=1`,
    cancel_url: `${baseUrl}/pricing`,
    allow_promotion_codes: true,
    subscription_data: { metadata: { clerk_user_id: userId } },
  });

  return NextResponse.json({ url: session.url });
}

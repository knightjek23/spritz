// POST /api/stripe/checkout
// Body: { plan: "monthly" | "annual" }
// Creates a Stripe Checkout session for Pro and returns the URL.

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, currentUser } from "@clerk/nextjs/server";
import type Stripe from "stripe";
import { stripe, STRIPE_PRICES } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAppUser } from "@/lib/users";

export const runtime = "nodejs";
// Force dynamic rendering — this route depends on env vars (Stripe key,
// Clerk session) that aren't available during static analysis. Without
// this, Next 14's build step can pull the module into "Collecting page
// data" and trigger Stripe initialization.
export const dynamic = "force-dynamic";

const Body = z.object({ plan: z.enum(["monthly", "annual", "lifetime"]) });

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

  const plan = parsed.data.plan;
  const priceId =
    plan === "lifetime"
      ? STRIPE_PRICES.pro_lifetime
      : plan === "annual"
        ? STRIPE_PRICES.pro_annual
        : STRIPE_PRICES.pro_monthly;
  if (!priceId) {
    return NextResponse.json({ error: "stripe_price_not_configured" }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const successUrl = `${baseUrl}/collection?upgraded=1`;
  const cancelUrl = `${baseUrl}/pricing`;

  let session: Stripe.Checkout.Session;
  if (plan === "lifetime") {
    // Lifetime is a ONE-TIME payment ($89), not a subscription — so
    // mode: "payment", no trial, no subscription_data. The webhook grants
    // permanent Pro (sets is_lifetime) on checkout.session.completed when
    // mode === "payment". metadata is stamped on both the session and the
    // payment intent so the entitlement is traceable either way.
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      metadata: { clerk_user_id: userId, plan: "lifetime" },
      payment_intent_data: { metadata: { clerk_user_id: userId, plan: "lifetime" } },
    });
  } else {
    // 7-day free trial on the MONTHLY plan only (pricing decision 2026-07-13).
    // A trial on annual would auto-convert to a $29.99 charge (a "surprise
    // bill"); on monthly the worst-case auto-charge is $4.99. Annual bills its
    // known $29.99 upfront. The webhook treats `trialing` as Pro, so
    // entitlement flips on the moment the trial starts.
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { clerk_user_id: userId },
        ...(plan === "monthly" ? { trial_period_days: 7 } : {}),
      },
    });
  }

  return NextResponse.json({ url: session.url });
}

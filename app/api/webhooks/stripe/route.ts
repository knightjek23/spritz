// POST /api/webhooks/stripe
//
// Handles Stripe subscription events. Two side effects per event:
//
//   1. Authoritative: flip users.plan in Supabase. This is what every
//      server-side API (e.g. /api/dupes/ai/[id]) actually reads to gate
//      Pro features. Single source of truth.
//
//   2. Cache for the client: push the same plan value into Clerk's
//      publicMetadata so client components like <KnownDupes /> can render
//      the right UI immediately (no server roundtrip) via
//      user.publicMetadata.plan === "pro". This is OPTIONAL — if Clerk
//      is briefly unreachable we log and continue; the webhook still
//      succeeds because Supabase is the truth.
//
// Sync direction is one-way: Stripe → Supabase + Clerk. Nothing reads
// Clerk's metadata as a source of truth for entitlement.

import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type Stripe from "stripe";

export const runtime = "nodejs";

const ENDPOINT_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

type Plan = "free" | "pro";

/**
 * Single setter: updates Supabase first (source of truth), then mirrors
 * to Clerk publicMetadata. A Clerk failure does NOT fail the webhook —
 * Supabase already has the right value and Clerk will reconcile on the
 * next event or the next sign-in.
 */
async function setPlanByCustomer(customerId: string, plan: Plan) {
  const supabase = createAdminClient();

  // 1. Update Supabase and pull back the clerk_user_id so we can fan out.
  const { data: row, error } = await supabase
    .from("users")
    .update({ plan })
    .eq("stripe_customer_id", customerId)
    .select("clerk_user_id")
    .maybeSingle();

  if (error) {
    console.error(
      "[stripe webhook] Supabase users update failed:",
      error.message,
    );
    return;
  }

  if (!row?.clerk_user_id) {
    // Common during first-time checkout: the users row may not yet exist
    // with this stripe_customer_id (the checkout-completed event arrives
    // before our /api/checkout success path has stamped it). The next
    // subscription.updated event will reconcile.
    console.warn(
      "[stripe webhook] no users row matches stripe_customer_id",
      customerId,
      "— skipping Clerk sync",
    );
    return;
  }

  // 2. Mirror to Clerk publicMetadata.
  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(row.clerk_user_id, {
      publicMetadata: { plan },
    });
  } catch (err) {
    console.error(
      "[stripe webhook] Clerk publicMetadata sync failed:",
      err instanceof Error ? err.message : String(err),
      "— Supabase is correct, client UI may lag until next sign-in",
    );
  }
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, ENDPOINT_SECRET);
  } catch (err) {
    console.error("Stripe webhook signature failed", err);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = (event.data.object as any).subscription
        ? await stripe.subscriptions.retrieve(
            (event.data.object as Stripe.Checkout.Session).subscription as string,
          )
        : (event.data.object as Stripe.Subscription);
      const customerId = sub.customer as string;
      const isActive = sub.status === "active" || sub.status === "trialing";
      await setPlanByCustomer(customerId, isActive ? "pro" : "free");
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await setPlanByCustomer(sub.customer as string, "free");
      break;
    }
    default:
      // ignore other events
      break;
  }

  return NextResponse.json({ received: true });
}

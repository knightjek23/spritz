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
// Force dynamic — webhook handler must never be statically analyzed.
export const dynamic = "force-dynamic";

const ENDPOINT_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

type Plan = "free" | "pro";

/**
 * Mirror the entitlement to Clerk publicMetadata. A Clerk failure does NOT
 * fail the webhook — Supabase is the source of truth and Clerk reconciles on
 * the next event or the next sign-in.
 */
async function mirrorPlanToClerk(clerkUserId: string, plan: Plan) {
  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(clerkUserId, {
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

/**
 * Single setter: updates Supabase first (source of truth), then mirrors
 * to Clerk publicMetadata.
 *
 * Lifetime protection: when downgrading to "free" we scope the update with
 * `is_lifetime = false`, so a one-time lifetime buyer can NEVER be reverted
 * by a subscription lifecycle event (e.g. a later, unrelated subscription
 * they cancel). Granting "pro" is unconditional.
 */
async function setPlanByCustomer(customerId: string, plan: Plan) {
  const supabase = createAdminClient();

  let update = supabase
    .from("users")
    .update({ plan })
    .eq("stripe_customer_id", customerId);
  if (plan === "free") {
    update = update.eq("is_lifetime", false);
  }

  const { data: row, error } = await update
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
    // Either no users row is linked to this customer yet (checkout-completed
    // can arrive before the row is stamped — the next subscription.updated
    // reconciles), OR this is a lifetime buyer intentionally shielded from a
    // downgrade. Both are safe to skip.
    console.warn(
      "[stripe webhook] no users row updated for stripe_customer_id",
      customerId,
      "— skipping Clerk sync (unlinked row, or lifetime buyer protected from downgrade)",
    );
    return;
  }

  await mirrorPlanToClerk(row.clerk_user_id, plan);
}

/**
 * One-time lifetime purchase: set plan = pro AND is_lifetime = true so the
 * entitlement is permanent and immune to subscription events.
 */
async function grantLifetimeByCustomer(customerId: string) {
  const supabase = createAdminClient();

  const { data: row, error } = await supabase
    .from("users")
    .update({ plan: "pro", is_lifetime: true })
    .eq("stripe_customer_id", customerId)
    .select("clerk_user_id")
    .maybeSingle();

  if (error) {
    console.error("[stripe webhook] lifetime grant failed:", error.message);
    return;
  }

  if (!row?.clerk_user_id) {
    console.warn(
      "[stripe webhook] lifetime purchase but no users row matches stripe_customer_id",
      customerId,
    );
    return;
  }

  await mirrorPlanToClerk(row.clerk_user_id, "pro");
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
    // Explicit per-type handling — the old combined branch duck-typed on
    // `.subscription` with `as any`, and a checkout session without a
    // subscription (async payment, one-time) would fall through and be
    // read AS a subscription, mislabeling entitlement.
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      // One-time lifetime purchase: mode "payment", no subscription. Grant
      // permanent Pro once the payment has actually settled.
      if (session.mode === "payment") {
        if (session.payment_status === "paid") {
          await grantLifetimeByCustomer(session.customer as string);
        }
        break;
      }

      if (typeof session.subscription !== "string") {
        // No subscription attached (yet) — the subsequent
        // customer.subscription.created event carries the entitlement.
        break;
      }
      const sub = await stripe.subscriptions.retrieve(session.subscription);
      const isActive = sub.status === "active" || sub.status === "trialing";
      await setPlanByCustomer(sub.customer as string, isActive ? "pro" : "free");
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const isActive = sub.status === "active" || sub.status === "trialing";
      await setPlanByCustomer(sub.customer as string, isActive ? "pro" : "free");
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

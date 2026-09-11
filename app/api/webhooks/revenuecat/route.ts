// POST /api/webhooks/revenuecat
//
// Mobile entitlement sync — the App Store / Play Store counterpart to
// /api/webhooks/stripe. RevenueCat sits in front of StoreKit (iOS) and
// Play Billing (Android); when a purchase, renewal, or expiration happens,
// RevenueCat POSTs an event here and we flip the SAME entitlement the web
// flow uses: users.plan ('pro' | 'free') + users.is_lifetime.
//
// Mapping: the native app configures the RevenueCat SDK with
// `appUserID = <Clerk user id>` (see APP_STORE_LAUNCH.md, Phase 4). So the
// event's `app_user_id` IS the Clerk user id, and we look the user up by
// clerk_user_id — no Stripe customer indirection needed.
//
// Auth: RevenueCat sends a fixed value in the `Authorization` header that
// you configure in its dashboard. We compare it to REVENUECAT_WEBHOOK_AUTH.
//
// One-way sync: RevenueCat → Supabase (source of truth) → Clerk publicMetadata.
// The write itself lives in lib/billing/entitlement.ts, shared with Stripe.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { grantPro, revokePro, storeToSource } from "@/lib/billing/entitlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_AUTH = process.env.REVENUECAT_WEBHOOK_AUTH ?? "";

function authorized(header: string | null): boolean {
  if (!WEBHOOK_AUTH || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(WEBHOOK_AUTH);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface RevenueCatEvent {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  product_id?: string;
  store?: string;
  period_type?: string;
  /** TRANSFER only: the app_user_ids that gained / lost the purchases. */
  transferred_to?: string[];
  transferred_from?: string[];
}

const LIFETIME_PRODUCT = "spritz_pro_lifetime";

export async function POST(req: Request) {
  // 1. Verify the shared secret RevenueCat sends in the Authorization header.
  if (!authorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { event?: RevenueCatEvent }
    | null;
  const event = body?.event;
  if (!event?.type) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const source = storeToSource(event.store);

  // TRANSFER carries no app_user_id of its own: purchases moved between
  // app user ids (same Apple ID, different Spritz accounts). Grant the
  // receivers, revoke the senders.
  if (event.type === "TRANSFER") {
    for (const id of event.transferred_to ?? []) {
      if (!id.startsWith("$RCAnonymousID")) await grantPro(id, source);
    }
    for (const id of event.transferred_from ?? []) {
      if (!id.startsWith("$RCAnonymousID")) await revokePro(id, source);
    }
    return NextResponse.json({ received: true });
  }

  const clerkUserId = event.app_user_id;
  if (!clerkUserId) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Anonymous RevenueCat ids ($RCAnonymousID:...) mean the SDK was not
  // configured with the Clerk id yet, so there is nothing to map to.
  if (clerkUserId.startsWith("$RCAnonymousID")) {
    return NextResponse.json({ received: true, ignored: "anonymous_id" });
  }

  const lifetime = event.product_id === LIFETIME_PRODUCT;

  switch (event.type) {
    // Active subscription states → grant Pro.
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
      await grantPro(clerkUserId, source, { lifetime });
      break;

    // One-time purchase → the Lifetime tier.
    case "NON_RENEWING_PURCHASE":
      await grantPro(clerkUserId, source, { lifetime: true });
      break;

    // Subscription lapsed for real → drop to Free. Lifetime buyers and
    // users whose Pro came from another billing system are left alone.
    case "EXPIRATION":
      await revokePro(clerkUserId, source);
      break;

    // CANCELLATION = auto-renew turned off but access continues until the
    // period ends; RevenueCat sends EXPIRATION when it actually lapses.
    // BILLING_ISSUE (grace period) likewise keeps Pro until EXPIRATION.
    // SUBSCRIPTION_PAUSED (Play only) ends with an EXPIRATION too. TEST is
    // the dashboard's "send test event".
    case "CANCELLATION":
    case "BILLING_ISSUE":
    case "SUBSCRIPTION_PAUSED":
    case "TEST":
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

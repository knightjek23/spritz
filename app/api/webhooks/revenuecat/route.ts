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

import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_AUTH = process.env.REVENUECAT_WEBHOOK_AUTH ?? "";

type Plan = "free" | "pro";

/** Mirror entitlement to Clerk publicMetadata. Best-effort; Supabase is truth. */
async function mirrorPlanToClerk(clerkUserId: string, plan: Plan) {
  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(clerkUserId, {
      publicMetadata: { plan },
    });
  } catch (err) {
    console.error(
      "[revenuecat webhook] Clerk sync failed:",
      err instanceof Error ? err.message : String(err),
      "— Supabase is correct, client UI may lag until next sign-in",
    );
  }
}

/**
 * Set the entitlement by Clerk user id. Mirrors the Stripe webhook's logic:
 * granting "pro" is unconditional; downgrading to "free" is scoped with
 * `is_lifetime = false` so a lifetime buyer is never revoked by an
 * unrelated subscription expiration (including a Stripe-side one).
 */
async function setPlanByClerkUser(
  clerkUserId: string,
  plan: Plan,
  opts: { lifetime?: boolean } = {},
) {
  const supabase = createAdminClient();

  const patch: { plan: Plan; is_lifetime?: boolean } = { plan };
  if (opts.lifetime) patch.is_lifetime = true;

  let update = supabase
    .from("users")
    .update(patch)
    .eq("clerk_user_id", clerkUserId);
  if (plan === "free") {
    update = update.eq("is_lifetime", false);
  }

  const { data: row, error } = await update
    .select("clerk_user_id")
    .maybeSingle();

  if (error) {
    console.error("[revenuecat webhook] Supabase update failed:", error.message);
    return;
  }
  if (!row?.clerk_user_id) {
    // No matching user (unknown app_user_id), or a lifetime buyer shielded
    // from downgrade. Both are safe to skip.
    console.warn(
      "[revenuecat webhook] no users row updated for clerk_user_id",
      clerkUserId,
      "— skipping (unknown user, or lifetime buyer protected from downgrade)",
    );
    return;
  }

  await mirrorPlanToClerk(clerkUserId, plan);
}

interface RevenueCatEvent {
  type?: string;
  app_user_id?: string;
  product_id?: string;
  store?: string;
  period_type?: string;
}

export async function POST(req: Request) {
  // 1. Verify the shared secret RevenueCat sends in the Authorization header.
  if (!WEBHOOK_AUTH || req.headers.get("authorization") !== WEBHOOK_AUTH) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { event?: RevenueCatEvent }
    | null;
  const event = body?.event;
  if (!event?.type || !event.app_user_id) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const clerkUserId = event.app_user_id;

  // Guard against anonymous RevenueCat ids ($RCAnonymousID:...) — these mean
  // the SDK wasn't configured with the Clerk id yet, so we can't map them.
  if (clerkUserId.startsWith("$RCAnonymousID")) {
    return NextResponse.json({ received: true, ignored: "anonymous_id" });
  }

  switch (event.type) {
    // Active subscription states → grant Pro.
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
      await setPlanByClerkUser(clerkUserId, "pro");
      break;

    // One-time / non-renewing purchase → the $89 Lifetime tier.
    case "NON_RENEWING_PURCHASE":
      await setPlanByClerkUser(clerkUserId, "pro", { lifetime: true });
      break;

    // Subscription lapsed for real → drop to Free (lifetime buyers protected).
    case "EXPIRATION":
      await setPlanByClerkUser(clerkUserId, "free");
      break;

    // CANCELLATION = auto-renew turned off but access continues until the
    // period ends; RevenueCat sends EXPIRATION when it actually lapses. So we
    // intentionally do nothing here. BILLING_ISSUE (grace period) is likewise
    // a no-op — keep Pro until an EXPIRATION arrives.
    case "CANCELLATION":
    case "BILLING_ISSUE":
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

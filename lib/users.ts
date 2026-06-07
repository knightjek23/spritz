// Server-side helper: ensure the public.users row exists for a Clerk user.
//
// Normally the row is created by app/api/webhooks/clerk on user.created.
// But in two real-world cases the webhook can fail to fire:
//   1. Webhook secret misconfigured or webhook endpoint not registered in
//      Clerk's dashboard (Session 01 first-time setup territory).
//   2. Brief race between sign-up completing and the webhook reaching us
//      (subseconds, but enough to break the very first action a new user
//      takes).
//
// ensureAppUser is a defense-in-depth backfill: if the row is missing
// when we need it server-side, we create it on the spot from Clerk's
// canonical user data. Idempotent — calling repeatedly is safe.
//
// Surface: every authenticated POST that touches per-user state (saving
// to collection, starting a Stripe checkout, etc.) should call this
// instead of a raw users-table lookup.

import { currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Plan } from "@/lib/types";

export interface AppUser {
  id: string;
  plan: Plan;
  stripe_customer_id: string | null;
}

/**
 * Look up the public.users row for a Clerk user, creating it if missing.
 * Returns null only on hard DB errors (caller decides how to surface).
 */
export async function ensureAppUser(clerkUserId: string): Promise<AppUser | null> {
  const supabase = createAdminClient();

  // 1. Fast path: row already exists.
  const { data: existing } = await supabase
    .from("users")
    .select("id, plan, stripe_customer_id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (existing) {
    return {
      id: existing.id,
      plan: existing.plan as Plan,
      stripe_customer_id: existing.stripe_customer_id,
    };
  }

  // 2. Backfill: webhook missed it (or hasn't arrived yet). Pull Clerk's
  //    canonical email so the row reflects the user's actual identity,
  //    not a placeholder.
  const clerkUser = await currentUser().catch(() => null);
  const email =
    clerkUser?.emailAddresses?.find(
      (e) => e.id === clerkUser?.primaryEmailAddressId,
    )?.emailAddress ??
    clerkUser?.emailAddresses?.[0]?.emailAddress ??
    null;

  const newId = crypto.randomUUID();
  const { data: inserted, error } = await supabase
    .from("users")
    .insert({
      id: newId,
      clerk_user_id: clerkUserId,
      email,
      plan: "free",
    })
    .select("id, plan, stripe_customer_id")
    .single();

  if (error) {
    // 23505 = unique violation. Another concurrent request beat us to
    // creating the row — re-read and return what's there.
    if (error.code === "23505") {
      const { data: now } = await supabase
        .from("users")
        .select("id, plan, stripe_customer_id")
        .eq("clerk_user_id", clerkUserId)
        .maybeSingle();
      if (now) {
        return {
          id: now.id,
          plan: now.plan as Plan,
          stripe_customer_id: now.stripe_customer_id,
        };
      }
    }
    console.error("[users] ensureAppUser failed to insert:", error.message);
    return null;
  }

  return {
    id: inserted.id,
    plan: inserted.plan as Plan,
    stripe_customer_id: inserted.stripe_customer_id,
  };
}

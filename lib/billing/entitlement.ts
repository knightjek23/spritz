// One place that writes the Pro entitlement, shared by the Stripe webhook,
// the RevenueCat webhook and the post-purchase sync route.
//
// Rules (D31–D33, slice 7):
//   - Granting Pro is unconditional and records where it came from.
//   - Downgrading is scoped: never a lifetime buyer, and never a user whose
//     Pro came from a different billing system than the one reporting the
//     lapse (a Stripe subscriber's App Store trial expiring must not touch
//     them). Legacy rows with pro_source NULL downgrade only when the
//     reporting system is the one that plausibly granted them (Stripe when
//     they have a Stripe customer, a store when they do not).
//   - Clerk publicMetadata.plan is mirrored best-effort for optimistic UI;
//     Supabase stays the truth.

import { clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type Plan = "free" | "pro";
export type ProSource = "stripe" | "apple" | "play";

export async function mirrorPlanToClerk(clerkUserId: string, plan: Plan): Promise<void> {
  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(clerkUserId, { publicMetadata: { plan } });
  } catch (err) {
    console.error(
      "[entitlement] Clerk sync failed:",
      err instanceof Error ? err.message : String(err),
      "— Supabase is correct, client UI may lag until next sign-in",
    );
  }
}

export async function grantPro(
  clerkUserId: string,
  source: ProSource,
  opts: { lifetime?: boolean } = {},
): Promise<boolean> {
  const supabase = createAdminClient();
  const patch: { plan: Plan; pro_source: ProSource; is_lifetime?: boolean } = {
    plan: "pro",
    pro_source: source,
  };
  if (opts.lifetime) patch.is_lifetime = true;
  const { data: row, error } = await supabase
    .from("users")
    .update(patch)
    .eq("clerk_user_id", clerkUserId)
    .select("clerk_user_id")
    .maybeSingle();
  if (error) {
    console.error("[entitlement] grant failed:", error.message);
    return false;
  }
  if (!row) return false;
  await mirrorPlanToClerk(clerkUserId, "pro");
  return true;
}

export async function revokePro(clerkUserId: string, source: ProSource): Promise<boolean> {
  const supabase = createAdminClient();
  const legacyMatch =
    source === "stripe" ? "stripe_customer_id.not.is.null" : "stripe_customer_id.is.null";
  const { data: row, error } = await supabase
    .from("users")
    .update({ plan: "free" })
    .eq("clerk_user_id", clerkUserId)
    .eq("is_lifetime", false)
    .or(`pro_source.eq.${source},and(pro_source.is.null,${legacyMatch})`)
    .select("clerk_user_id")
    .maybeSingle();
  if (error) {
    console.error("[entitlement] revoke failed:", error.message);
    return false;
  }
  if (!row) return false; // lifetime, other source, or unknown user: all safe to skip
  await mirrorPlanToClerk(clerkUserId, "free");
  return true;
}

/** RevenueCat's store name → pro_source. */
export function storeToSource(store: string | undefined): ProSource {
  return store === "PLAY_STORE" ? "play" : "apple";
}

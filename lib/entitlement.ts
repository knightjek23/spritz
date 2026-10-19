import "server-only";

// Server-side Pro checks, and the fields that only Pro users may receive.
//
// SOURCE OF TRUTH: users.plan in Supabase, never Clerk publicMetadata.
// Clerk metadata is a best-effort mirror written by the Stripe/RevenueCat
// webhooks, so manually comped users (set via SQL) have plan='pro' in
// Supabase and NOTHING in Clerk. A gate that read Clerk would lock exactly
// those users out.
//
// WHY STRIPPING MATTERS: hiding a field in JSX is not a paywall. Anything
// passed as a prop to a client component is serialized into the page's RSC
// payload and readable in DevTools, and the fragrance page is ISR-cached and
// identical for every visitor. Pro-only fields must be removed from rows
// BEFORE they reach a client component or a JSON response, and fetched
// separately through an authenticated route (see /api/perfumer/[id]).

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** True when the signed-in user has an active Pro entitlement. */
export async function isProUser(): Promise<boolean> {
  const { userId } = auth();
  if (!userId) return false;
  const { data } = await createAdminClient()
    .from("users")
    .select("plan")
    .eq("clerk_user_id", userId)
    .maybeSingle();
  return data?.plan === "pro";
}

/**
 * Return a copy of a fragrance row with Pro-only fields blanked.
 * Keeps the field present (as null) so the row still satisfies the
 * Fragrance type and existing `f.perfumer &&` checks simply render nothing.
 */
export function stripProFields<T extends { perfumer?: string | null }>(row: T): T {
  return { ...row, perfumer: null };
}

/**
 * Deep variant for API responses. Walks plain objects and arrays and nulls
 * every `perfumer` key at any depth. Use at the JSON boundary of routes that
 * return fragrance rows nested inside other structures (scan results, dupe
 * lists), so a row added by future code can't slip a credit out.
 */
export function stripProFieldsDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripProFieldsDeep) as unknown as T;
  if (value && typeof value === "object" && value.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = k === "perfumer" ? null : stripProFieldsDeep(v);
    }
    return out as T;
  }
  return value;
}

// POST /api/account/delete
//
// The in-app account deletion required by App Store Guideline 5.1.1(v):
// "If your app supports account creation, you must also offer account
// deletion within the app." A link to a web page does not satisfy it, and
// deactivation does not satisfy it either. This actually deletes.
//
// Google Play requires the same capability plus a public web URL, which is
// /support/delete-account. Both routes end up here or in the Clerk webhook.
//
// Order of operations, and why:
//   1. Cancel the Stripe subscription. Done FIRST because it is the only
//      step whose failure should stop the whole thing. Deleting the account
//      while a live subscription keeps billing is the one outcome nobody
//      can undo from the user's side.
//   2. Purge Supabase (lib/account-deletion.ts). Synchronous, so the API
//      only reports success once the data is actually gone. Relying on the
//      Clerk webhook alone would mean a misconfigured endpoint leaves data
//      orphaned forever with no way for the user to retry.
//   3. Delete the Clerk user. Last, because it destroys the identity the
//      earlier steps look records up by. This also fires the user.deleted
//      webhook, which runs the same purge again; that is idempotent and
//      acts as a backstop.
//
// Store subscriptions (Apple / Google) cannot be cancelled server-side by
// anyone but the store. The client blocks on an explicit acknowledgement
// before calling this; see components/account-actions.tsx.

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { purgeAppUserData } from "@/lib/account-deletion";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Typed-confirmation phrase. Must match the client exactly. */
const CONFIRM_PHRASE = "DELETE";

export async function POST(req: Request) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  if (body?.confirm !== CONFIRM_PHRASE) {
    return NextResponse.json(
      { error: `Type ${CONFIRM_PHRASE} to confirm.` },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // ---- 1. Stripe. Cancel immediately rather than at period end: the account
  // is going away now, so leaving paid access running on a deleted account
  // would be billing for something that no longer exists.
  const { data: appUser } = await supabase
    .from("users")
    .select("id, stripe_customer_id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  const customerId = appUser?.stripe_customer_id ?? null;
  let subscriptionsCancelled = 0;

  if (customerId) {
    try {
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 100,
      });
      for (const sub of subs.data) {
        await stripe.subscriptions.cancel(sub.id);
        subscriptionsCancelled++;
      }
      // Trialing subscriptions are billed later but are still live.
      const trialing = await stripe.subscriptions.list({
        customer: customerId,
        status: "trialing",
        limit: 100,
      });
      for (const sub of trialing.data) {
        await stripe.subscriptions.cancel(sub.id);
        subscriptionsCancelled++;
      }
    } catch (err) {
      // Hard stop. Better a failed deletion the user can retry than a deleted
      // account that keeps charging a card.
      console.error("[account/delete] stripe cancel failed", err);
      return NextResponse.json(
        {
          error:
            "We couldn't cancel your subscription, so we stopped before deleting anything. Nothing has changed. Please try again, or email support and we'll do it manually.",
        },
        { status: 502 },
      );
    }
  }

  // ---- 2. Supabase purge.
  try {
    const result = await purgeAppUserData(supabase, userId);
    for (const w of result.warnings) {
      console.error("[account/delete] purge warning:", w);
    }
  } catch (err) {
    console.error("[account/delete] purge failed", err);
    return NextResponse.json(
      {
        error:
          "Something went wrong deleting your data, so we stopped before removing your login. Your account is still here. Please try again, or email support.",
      },
      { status: 500 },
    );
  }

  // ---- 3. Clerk identity. Last: everything above looks up by this id.
  try {
    const client =
      typeof clerkClient === "function" ? clerkClient() : clerkClient;
    await client.users.deleteUser(userId);
  } catch (err) {
    console.error("[account/delete] clerk delete failed", err);
    return NextResponse.json(
      {
        error:
          "Your Spritz data was deleted, but we couldn't remove your login. Email support and we'll finish it off.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, subscriptionsCancelled });
}

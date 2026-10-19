// POST /api/purchases/sync
//
// Called by the native app right after a store purchase or a restore
// (lib/native/purchases.ts). Reads the signed-in user's subscriber record
// from RevenueCat's REST API and writes users.plan / is_lifetime /
// pro_source now, instead of waiting for the webhook. The webhook still
// runs and stays authoritative over time; this just removes the "I paid
// and nothing happened" seconds. Idempotent: it sets state, never toggles.
//
// Auth: the Clerk session. RevenueCat: REVENUECAT_SECRET_API_KEY (v1 secret
// key, server-only; never the public SDK keys).

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { grantPro, revokePro, type ProSource } from "@/lib/billing/entitlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRO_ENTITLEMENT = "pro";
const LIFETIME_PRODUCT = "spritz_pro_lifetime";

interface RcEntitlement {
  expires_date: string | null;
  product_identifier: string;
}
interface RcSubscriber {
  entitlements?: Record<string, RcEntitlement>;
  subscriptions?: Record<string, { store?: string; expires_date?: string | null }>;
  non_subscriptions?: Record<string, Array<{ store?: string }>>;
}

export async function POST() {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const key = process.env.REVENUECAT_SECRET_API_KEY;
  if (!key) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" },
  );
  if (!res.ok) {
    return NextResponse.json({ error: "revenuecat_unavailable" }, { status: 502 });
  }
  const data = (await res.json()) as { subscriber?: RcSubscriber };
  const sub = data.subscriber ?? {};
  const ent = sub.entitlements?.[PRO_ENTITLEMENT];
  const active = Boolean(ent && (ent.expires_date === null || new Date(ent.expires_date) > new Date()));

  // Which store granted it: look the product up in subscriptions, then in
  // non-subscriptions (lifetime lives there).
  const product = ent?.product_identifier ?? "";
  const store =
    sub.subscriptions?.[product]?.store ??
    sub.non_subscriptions?.[product]?.[0]?.store ??
    "APP_STORE";
  const source: ProSource = store === "PLAY_STORE" ? "play" : "apple";

  if (active) {
    await grantPro(userId, source, { lifetime: product === LIFETIME_PRODUCT });
    return NextResponse.json({ plan: "pro", source, lifetime: product === LIFETIME_PRODUCT });
  }
  // Not active in RevenueCat: only revoke a store-sourced Pro (a Stripe
  // subscriber restoring on a fresh phone must stay Pro).
  await revokePro(userId, source);
  return NextResponse.json({ plan: "free" });
}

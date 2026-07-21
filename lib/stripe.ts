// Stripe SDK init — lazy.
//
// History: this file used to construct the Stripe client at module load
// (`export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "")`).
// That broke Vercel builds whenever STRIPE_SECRET_KEY wasn't set in the
// build environment — Next's "Collecting page data" step imports every
// API route module, evaluates top-level code, and the Stripe constructor
// throws on an empty key.
//
// Fix: construct on first property access via Proxy. The build step now
// imports the module without ever touching Stripe; only an actual API
// request triggers init, and any missing-env failure surfaces as a
// runtime 500 (handled by the route's catch) rather than a build error.
//
// Call sites are unchanged — they still use
// `stripe.checkout.sessions.create(...)`, `stripe.webhooks.constructEvent(...)`,
// `stripe.billingPortal.sessions.create(...)`, etc.
//
// API version is pinned to whatever the installed SDK declares it
// supports. Bumping `stripe` in package.json may require updating
// the string below.

import Stripe from "stripe";

let _client: Stripe | null = null;

function getClient(): Stripe {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to your Vercel project's " +
        "environment variables (Settings → Environment Variables) and redeploy.",
    );
  }
  _client = new Stripe(key, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });
  return _client;
}

// Proxy: existing callers do `stripe.checkout.sessions.create(...)` etc.
// We keep that surface; the real client is constructed only when a
// property is actually accessed.
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return Reflect.get(getClient() as unknown as object, prop);
  },
});

export const STRIPE_PRICES = {
  pro_monthly: process.env.STRIPE_PRICE_ID_PRO_MONTHLY ?? "",
  pro_annual: process.env.STRIPE_PRICE_ID_PRO_ANNUAL ?? "",
  // One-time (non-recurring) price for the $89 lifetime tier.
  pro_lifetime: process.env.STRIPE_PRICE_ID_PRO_LIFETIME ?? "",
};

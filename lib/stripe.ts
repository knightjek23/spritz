// Stripe SDK init. Server-only.
// API version is pinned to whatever the installed Stripe SDK declares it supports.
// Bumping the SDK in package.json may require updating this string.
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2025-02-24.acacia",
  typescript: true,
});

export const STRIPE_PRICES = {
  pro_monthly: process.env.STRIPE_PRICE_ID_PRO_MONTHLY ?? "",
  pro_annual: process.env.STRIPE_PRICE_ID_PRO_ANNUAL ?? "",
};

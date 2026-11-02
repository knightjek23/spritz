"use client";

// Store prices for every price shown inside the native apps.
//
// Google rejected Android 1.0.3 (Nov 2, 2026, Subscriptions policy) because
// the paywall showed hardcoded US-dollar prices while the Play purchase
// sheet billed in the reviewer's local currency. Rule since then: inside
// the iOS and Android shells, a price is only ever the store's own
// localized string (RevenueCat offerings). While it loads we show no
// amount; if it can't load, purchase buttons are disabled with a message,
// never left tappable and broken (the Broken Functionality rejection the
// same day). The website keeps its USD Stripe prices.
//
// One fetch per page load, shared by every caller (pricing page, Pro gates,
// intro sheet).

import { useEffect, useState } from "react";
import { isNativeApp, nativePlatform } from "@/lib/native";
import { getNativePlans, type NativePlanInfo, type PurchasePlan } from "@/lib/native/purchases";

export type StorePlans = Record<PurchasePlan, NativePlanInfo>;

export type StorePrices =
  /** Website: use the USD prices. */
  | { status: "web" }
  /** Native, offerings still loading: show no amount. */
  | { status: "loading"; platform: "ios" | "android" }
  /** Native, the store answered with no products: purchases unavailable. */
  | { status: "unavailable"; platform: "ios" | "android" }
  | { status: "ready"; platform: "ios" | "android"; plans: StorePlans };

let cached: Promise<StorePlans | null> | null = null;

function load(): Promise<StorePlans | null> {
  if (!cached) {
    cached = getNativePlans()
      .catch(() => null)
      .then((plans) => {
        // Don't pin a failure: the next page that asks tries again.
        if (!plans) cached = null;
        return plans;
      });
  }
  return cached;
}

/** Drop the cache, e.g. after sign-in changes the RevenueCat user. */
export function resetStorePrices() {
  cached = null;
}

export function useStorePrices(): StorePrices {
  const [state, setState] = useState<StorePrices>({ status: "web" });
  useEffect(() => {
    if (!isNativeApp()) return;
    const platform = nativePlatform() === "android" ? "android" : "ios";
    setState({ status: "loading", platform });
    let live = true;
    load().then((plans) => {
      if (!live) return;
      setState(plans ? { status: "ready", platform, plans } : { status: "unavailable", platform });
    });
    return () => {
      live = false;
    };
  }, []);
  return state;
}

/**
 * The monthly price to quote next to a trial offer: the store's string on
 * native (null until known), the USD constant on the web.
 */
export function monthlyPriceFor(prices: StorePrices, webPrice: string): string | null {
  if (prices.status === "web") return webPrice;
  if (prices.status === "ready") return prices.plans.monthly.priceString;
  return null;
}

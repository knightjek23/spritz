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
import { loadNativePlans, type NativePlanInfo, type PurchasePlan } from "@/lib/native/purchases";
import { trackDiagnostic } from "@/lib/analytics";

export type StorePlans = Record<PurchasePlan, NativePlanInfo>;

export type StorePrices =
  /** Website: use the USD prices. */
  | { status: "web" }
  /** Native, offerings still loading: show no amount. */
  | { status: "loading"; platform: "ios" | "android" }
  /** Native, the store answered with no products: purchases unavailable.
   *  reason "outdated": this installed shell predates the purchase plugin
   *  (Android 1.0), so the fix is an app update, not a retry. */
  | { status: "unavailable"; platform: "ios" | "android"; reason?: "outdated" }
  | { status: "ready"; platform: "ios" | "android"; plans: StorePlans };

type Loaded = { plans: StorePlans | null; outdated: boolean };

let cached: Promise<Loaded> | null = null;

// Capacitor's own wording when the installed shell has no native side for a
// plugin. Decided from a real failure, never a pre-check, so a working build
// can't be misread as outdated.
const PLUGIN_MISSING = /not implemented on (android|ios)/i;

function load(): Promise<Loaded> {
  if (!cached) {
    cached = loadNativePlans()
      .then(({ plans, diag }): Loaded => {
        // Every failure reports its stage and the store's own error, so a
        // "Purchases aren't available" on a device is diagnosable in PostHog.
        if (!plans) trackDiagnostic("store_prices_unavailable", { ...diag });
        // The success side of the same check, so health is visible per app
        // version ("1.0.6: 40 loads, 0 failures"), not only the failures.
        else
          trackDiagnostic("store_prices_loaded", {
            platform: diag.platform,
            app_version: diag.app_version,
            app_build: diag.app_build,
            current_offering: diag.current_offering,
            // Whether the store offered this store account the free trial.
            // Null means no offer: the intro sheet and trial CTAs stay hidden.
            monthly_trial: plans.monthly?.trial ?? null,
          });
        const outdated = diag.stage === "configure_failed" && PLUGIN_MISSING.test(diag.error_message ?? "");
        return { plans, outdated };
      })
      .catch((err: unknown): Loaded => {
        const message = String((err as { message?: unknown })?.message ?? err).slice(0, 500);
        trackDiagnostic("store_prices_unavailable", { stage: "unexpected", error_message: message });
        return { plans: null, outdated: PLUGIN_MISSING.test(message) };
      })
      .then((loaded) => {
        // Don't pin a failure: the next page that asks tries again.
        if (!loaded.plans) cached = null;
        return loaded;
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
    load().then(({ plans, outdated }) => {
      if (!live) return;
      setState(
        plans
          ? { status: "ready", platform, plans }
          : { status: "unavailable", platform, ...(outdated ? { reason: "outdated" as const } : {}) },
      );
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

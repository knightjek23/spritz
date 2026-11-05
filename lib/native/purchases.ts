// Native in-app purchases (slice 7). RevenueCat in front of StoreKit and
// Play Billing; the entitlement lands in Supabase the same way Stripe's
// does (users.plan / users.is_lifetime), so nothing downstream cares which
// store a Pro user came from.
//
// Two paths write the entitlement after a purchase:
//   1. The RevenueCat webhook (app/api/webhooks/revenuecat) — authoritative
//      over time (renewals, expirations, refunds).
//   2. POST /api/purchases/sync — called by this module right after a
//      purchase or restore, so the UI does not wait on webhook latency.
//      It reads the subscriber from RevenueCat's REST API server-side.
//
// The SDK is loaded with a dynamic import, the same way the other Capacitor
// plugins are: it becomes a lazy chunk that only the shell ever fetches.
// (Not webpackIgnore: the site is remote-loaded, so the plugin's JS has to
// come from the site's own bundle.) Every export is a no-op on the web.
//
// Identity: the SDK is configured with appUserID = Clerk user id, which is
// what the webhook keys on. Configure runs from <NativeAuthBridge> once
// Clerk knows who the user is; sign-out calls logOut so the next user does
// not inherit the previous one's purchases in the SDK cache.

import { isNativeApp, nativePlatform } from "@/lib/native";
import type {
  PurchasesOfferings,
  PurchasesPackage,
  CustomerInfo,
} from "@revenuecat/purchases-capacitor";

export type PurchasePlan = "monthly" | "annual" | "lifetime";

/** Entitlement identifier configured in RevenueCat. */
export const PRO_ENTITLEMENT = "pro";

/** Package identifiers in the default offering (APP_STORE_LAUNCH.md phase 2). */
const PACKAGE_IDS: Record<PurchasePlan, string[]> = {
  monthly: ["$rc_monthly"],
  annual: ["$rc_annual"],
  lifetime: ["lifetime", "$rc_lifetime"],
};

export interface NativePlanInfo {
  plan: PurchasePlan;
  /** Localized, from the store: "$4.99", "€4,99". */
  priceString: string;
  /** Localized intro-offer price when the store has one ("$0.00" for a free trial). */
  introPriceString: string | null;
  /** Human trial length when the intro offer is free: "7 days". */
  trial: string | null;
}

let sdkPromise: Promise<typeof import("@revenuecat/purchases-capacitor")> | null = null;
/** Purchases.configure has run (anonymously or for a user). It may only run once. */
let sdkConfigured = false;
/** In-flight anonymous configure, so a sign-in racing it never configures twice. */
let anonConfigure: Promise<boolean> | null = null;
/** The Clerk user the SDK is logged in as; null while anonymous. */
let configuredFor: string | null = null;

/** The store's own name, for copy: "the App Store" or "Google Play". */
export function storeName(): string {
  return nativePlatform() === "android" ? "Google Play" : "the App Store";
}

function sdk() {
  if (!sdkPromise) {
    sdkPromise = import("@revenuecat/purchases-capacitor");
  }
  return sdkPromise;
}

function apiKey(): string | null {
  const platform = nativePlatform();
  if (platform === "ios") return process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY ?? null;
  if (platform === "android") return process.env.NEXT_PUBLIC_REVENUECAT_ANDROID_KEY ?? null;
  return null;
}

/**
 * Configure the SDK for a signed-in user. Safe to call repeatedly; it
 * reconfigures only when the user changes. Returns false on the web or
 * when the platform key is missing (then purchases are simply unavailable).
 */
export async function configurePurchases(clerkUserId: string): Promise<boolean> {
  if (!isNativeApp()) return false;
  const key = apiKey();
  if (!key) {
    console.warn("[purchases] no RevenueCat key for", nativePlatform());
    return false;
  }
  if (configuredFor === clerkUserId) return true;
  if (anonConfigure) await anonConfigure;
  const { Purchases } = await sdk();
  if (!sdkConfigured) {
    await Purchases.configure({ apiKey: key, appUserID: clerkUserId });
    sdkConfigured = true;
  } else {
    await Purchases.logIn({ appUserID: clerkUserId });
  }
  configuredFor = clerkUserId;
  return true;
}

/**
 * Configure anonymously so a signed-out visitor still sees the store's own
 * localized prices (Play's Subscriptions policy: the price shown must match
 * the purchase sheet, currency included). Sign-in later logs the SDK in.
 */
async function ensureConfigured(): Promise<boolean> {
  if (sdkConfigured) return true;
  if (!anonConfigure) {
    anonConfigure = (async () => {
      const key = apiKey();
      if (!key) {
        console.warn("[purchases] no RevenueCat key for", nativePlatform());
        return false;
      }
      const { Purchases } = await sdk();
      if (!sdkConfigured) {
        await Purchases.configure({ apiKey: key });
        sdkConfigured = true;
      }
      return true;
    })().finally(() => {
      anonConfigure = null;
    });
  }
  return anonConfigure;
}

/** Forget the user in the SDK cache on sign-out. */
export async function logOutPurchases(): Promise<void> {
  if (!isNativeApp() || !sdkConfigured || configuredFor === null) return;
  try {
    const { Purchases } = await sdk();
    await Purchases.logOut();
  } catch {
    /* already anonymous */
  }
  configuredFor = null;
}

function findPackage(offerings: PurchasesOfferings, plan: PurchasePlan): PurchasesPackage | null {
  const current = offerings.current;
  if (!current) return null;
  const ids = PACKAGE_IDS[plan];
  return current.availablePackages.find((p) => ids.includes(p.identifier)) ?? null;
}

function describeTrial(pkg: PurchasesPackage): string | null {
  const intro = pkg.product.introPrice;
  if (!intro || intro.price !== 0) return null;
  const n = intro.periodNumberOfUnits;
  const unit = intro.periodUnit.toLowerCase();
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * Store-localized prices for the pricing page. Returns null when
 * offerings are empty, which on iOS almost always means App Store Connect
 * agreements or banking are not "Clear" yet, or the products are not yet
 * approved: it looks exactly like a code bug and is not one.
 */
export async function getNativePlans(): Promise<Record<PurchasePlan, NativePlanInfo> | null> {
  return (await loadNativePlans()).plans;
}

/**
 * Why the store gave us no prices, for the `store_prices_unavailable`
 * event (lib/native/store-prices.ts). Added Nov 2, 2026 when Android 1.0.3
 * showed "Purchases aren't available" with no way to see the cause from
 * the webview: every stage reports itself instead of collapsing to null.
 */
export interface StoreDiagnostics {
  stage:
    | "ok"
    | "not_native"
    | "no_key"
    | "configure_failed"
    | "offerings_failed"
    | "no_current_offering"
    | "missing_packages";
  platform: string;
  app_version?: string;
  app_build?: string;
  error_code?: string;
  error_message?: string;
  offering_ids?: string[];
  current_offering?: string | null;
  packages?: string[];
  missing_plans?: string[];
}

async function appInfo(): Promise<{ app_version?: string; app_build?: string }> {
  try {
    const { App } = await import("@capacitor/app");
    const { version, build } = await App.getInfo();
    return { app_version: version, app_build: build };
  } catch {
    return {};
  }
}

function errorParts(err: unknown): { error_code?: string; error_message?: string } {
  const e = err as { code?: unknown; message?: unknown; underlyingErrorMessage?: unknown };
  return {
    error_code: e?.code != null ? String(e.code) : undefined,
    error_message: [e?.message, e?.underlyingErrorMessage]
      .filter((x) => typeof x === "string" && x)
      .join(" | ")
      .slice(0, 500) || String(err).slice(0, 500),
  };
}

export async function loadNativePlans(): Promise<{
  plans: Record<PurchasePlan, NativePlanInfo> | null;
  diag: StoreDiagnostics;
}> {
  const platform = nativePlatform();
  if (!isNativeApp()) return { plans: null, diag: { stage: "not_native", platform } };
  const info = await appInfo();
  const base = { platform, ...info };
  if (!apiKey()) return { plans: null, diag: { stage: "no_key", ...base } };
  try {
    if (!(await ensureConfigured())) return { plans: null, diag: { stage: "no_key", ...base } };
  } catch (err) {
    return { plans: null, diag: { stage: "configure_failed", ...base, ...errorParts(err) } };
  }
  let offerings: PurchasesOfferings;
  try {
    const { Purchases } = await sdk();
    const { current, all } = await Purchases.getOfferings();
    offerings = { current, all } as PurchasesOfferings;
  } catch (err) {
    return { plans: null, diag: { stage: "offerings_failed", ...base, ...errorParts(err) } };
  }
  const offeringIds = Object.keys(offerings.all ?? {});
  if (!offerings.current) {
    return { plans: null, diag: { stage: "no_current_offering", ...base, offering_ids: offeringIds } };
  }
  const packages = offerings.current.availablePackages.map(
    (p) => `${p.identifier}=${p.product.identifier}`,
  );
  const plans = {} as Record<PurchasePlan, NativePlanInfo>;
  const missing: string[] = [];
  for (const plan of ["monthly", "annual", "lifetime"] as PurchasePlan[]) {
    const pkg = findPackage(offerings, plan);
    if (!pkg) {
      missing.push(plan);
      continue;
    }
    plans[plan] = {
      plan,
      priceString: pkg.product.priceString,
      introPriceString: pkg.product.introPrice?.priceString ?? null,
      trial: describeTrial(pkg),
    };
  }
  const diag: StoreDiagnostics = {
    stage: missing.length ? "missing_packages" : "ok",
    ...base,
    offering_ids: offeringIds,
    current_offering: offerings.current.identifier,
    packages,
    missing_plans: missing,
  };
  return { plans: missing.length ? null : plans, diag };
}

export type PurchaseOutcome =
  | { status: "purchased"; lifetime: boolean }
  | { status: "cancelled" }
  | { status: "unavailable" }
  | { status: "error"; message: string };

function hasPro(info: CustomerInfo): boolean {
  return Boolean(info.entitlements.active[PRO_ENTITLEMENT]?.isActive);
}

/**
 * Run the store purchase sheet for a plan, then sync the entitlement to
 * Supabase so the page can refresh immediately.
 */
export async function purchasePro(plan: PurchasePlan): Promise<PurchaseOutcome> {
  if (!isNativeApp() || configuredFor === null) return { status: "unavailable" };
  const { Purchases, PURCHASES_ERROR_CODE } = await sdk();
  // Inside the try: on a shell without the plugin, or with store billing
  // off, this throws. Uncaught, the button silently reset and one Android
  // user tapped it 331 times on Nov 1, 2026.
  let pkg: ReturnType<typeof findPackage>;
  try {
    const { current, all } = await Purchases.getOfferings();
    pkg = findPackage({ current, all } as PurchasesOfferings, plan);
  } catch (err: unknown) {
    const message = (err as { message?: string })?.message ?? "";
    return {
      status: "error",
      message: /not implemented/i.test(message)
        ? `This version of Spritz can't take payments. Update it from ${storeName()} to subscribe.`
        : `Couldn't reach ${storeName()}. Check you're signed in to it, then try again.`,
    };
  }
  if (!pkg) return { status: "unavailable" };
  try {
    const result = await Purchases.purchasePackage({ aPackage: pkg });
    if (!hasPro(result.customerInfo)) {
      // Purchase went through but the entitlement is not attached: a
      // RevenueCat product→entitlement mapping problem, not the user's.
      return { status: "error", message: "Purchase completed but Pro didn't unlock. Contact support." };
    }
    await syncEntitlement();
    return { status: "purchased", lifetime: plan === "lifetime" };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return { status: "cancelled" };
    const message = (err as { message?: string })?.message ?? "Purchase failed.";
    return { status: "error", message };
  }
}

/** Restore purchases (required by Apple for the non-consumable lifetime tier). */
export async function restorePro(): Promise<{ restored: boolean }> {
  if (!isNativeApp() || configuredFor === null) return { restored: false };
  const { Purchases } = await sdk();
  const { customerInfo } = await Purchases.restorePurchases();
  const restored = hasPro(customerInfo);
  if (restored) await syncEntitlement();
  return { restored };
}

/** Ask the server to read RevenueCat and write users.plan now. */
export async function syncEntitlement(): Promise<{ plan: "free" | "pro" } | null> {
  try {
    const res = await fetch("/api/purchases/sync", { method: "POST" });
    if (!res.ok) return null;
    return (await res.json()) as { plan: "free" | "pro" };
  } catch {
    return null;
  }
}

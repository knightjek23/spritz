"use client";

// Client analytics helper: one place every product event goes through.
// No-op when PostHog isn't loaded (no key set, or blocked), so callers never
// need to guard. Event names follow object_verb in the past tense; see the
// event spec approved 2026-10-30 (docs: claude/spritz-analytics-plan.md).

type PostHogLike = {
  capture: (event: string, props?: Record<string, unknown>) => void;
};

function ph(): PostHogLike | null {
  if (typeof window === "undefined") return null;
  const p = (window as unknown as { posthog?: PostHogLike }).posthog;
  return p && typeof p.capture === "function" ? p : null;
}

export type AnalyticsEvent =
  | "scan_started"
  | "scan_completed"
  | "fragrance_viewed"
  | "shelf_item_added"
  | "paywall_viewed"
  | "purchase_started";

export function track(event: AnalyticsEvent, props: Record<string, unknown> = {}) {
  ph()?.capture(event, props);
}

// ---------- Paywall trigger ----------
// A Pro-gate CTA remembers which feature it was for; /pricing reads it once
// so `paywall_viewed.trigger` says what sent the person there.

const TRIGGER_KEY = "spritz_paywall_trigger";

export function rememberPaywallTrigger(feature: string) {
  try {
    sessionStorage.setItem(TRIGGER_KEY, feature);
  } catch {
    /* storage blocked: trigger falls back to "direct" */
  }
}

export function consumePaywallTrigger(): string | null {
  try {
    const v = sessionStorage.getItem(TRIGGER_KEY);
    sessionStorage.removeItem(TRIGGER_KEY);
    return v;
  } catch {
    return null;
  }
}

// ---------- Route memory ----------
// <PostHogIdentify> records every pathname change here, so a page can ask
// where the person came from (App Router has no reliable referrer).

let currentPath: string | null = null;
let previousPath: string | null = null;

export function notePath(pathname: string) {
  if (pathname === currentPath) return;
  previousPath = currentPath;
  currentPath = pathname;
}

/** The page before `here`, or null when `here` was the landing page. */
export function pathBefore(here: string): string | null {
  // Effects can run before or after the route memory updates, so handle both.
  return currentPath === here ? previousPath : currentPath;
}

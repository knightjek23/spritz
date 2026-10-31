"use client";

import { rememberPaywallTrigger } from "@/lib/analytics";

// Analytics for Pro gates. Every gate fires `pro_gate_shown` once when it
// renders and `pro_gate_cta_tapped` when its CTA is tapped, both with the
// feature name. Grouping conversions by `feature` in PostHog answers
// "which feature actually sells Pro". No-op when PostHog isn't loaded.

export type ProFeature = "match" | "compare" | "layering" | "wear_insights" | "consensus" | "dupes" | "perfumer";

type PostHogLike = { capture: (event: string, props?: Record<string, unknown>) => void };

function ph(): PostHogLike | null {
  if (typeof window === "undefined") return null;
  const p = (window as unknown as { posthog?: PostHogLike }).posthog;
  return p && typeof p.capture === "function" ? p : null;
}

export function trackProGateShown(feature: ProFeature, props: Record<string, unknown> = {}) {
  ph()?.capture("pro_gate_shown", { feature, ...props });
}

export function trackProGateCta(feature: ProFeature, props: Record<string, unknown> = {}) {
  ph()?.capture("pro_gate_cta_tapped", { feature, ...props });
  rememberPaywallTrigger(feature);
}

export function trackFeatureUsed(feature: ProFeature, props: Record<string, unknown> = {}) {
  ph()?.capture("feature_used", { feature, ...props });
}

/** The client's local calendar day, YYYY-MM-DD. Same rule as the wear log. */
export function localDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

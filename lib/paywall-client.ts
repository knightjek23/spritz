"use client";

// Browser side of the paywall rules: per-device storage, the A/B switch and
// the PostHog tag. The rules themselves are in lib/paywall-triggers.ts.
//
// The A/B arm is drawn here and kept in localStorage, not read from a
// PostHog feature flag: the app uses person_profiles 'identified_only', so
// a flag could put someone in the other arm the moment they sign in.

import {
  drawVariant,
  effectiveVariant,
  newState,
  type LegacyIntroState,
  type PaywallState,
  type PaywallVariant,
} from "@/lib/paywall-triggers";

const KEY = "spritz:paywall:v1";
/** The intro sheet's old record; read once to migrate, never written. */
const LEGACY_KEY = "spritz:pro-intro:v1";

/**
 * NEXT_PUBLIC_PAYWALL_TEST: "on" runs the 50/50 test; "intro_sheet" or
 * "one_screen" sends everyone to that arm; unset means the intro sheet.
 */
const TEST_MODE = process.env.NEXT_PUBLIC_PAYWALL_TEST;

// Private mode / blocked storage: keep the state for this page load at least.
let memory: PaywallState | null = null;

export function loadPaywallState(now = Date.now()): PaywallState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PaywallState;
      if (parsed && parsed.v === 1) return parsed;
    }
  } catch {
    /* storage blocked: fall through to the in-memory copy */
  }
  if (memory) return memory;
  let legacy: LegacyIntroState | null = null;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) legacy = JSON.parse(raw) as LegacyIntroState;
  } catch {
    /* no legacy record */
  }
  const fresh = newState(now, drawVariant(Math.random()), legacy);
  savePaywallState(fresh);
  return fresh;
}

export function savePaywallState(state: PaywallState): void {
  memory = state;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* kept in memory for this page load */
  }
}

/** The arm this device is in right now. */
export function paywallVariant(): PaywallVariant {
  return effectiveVariant(loadPaywallState(), TEST_MODE);
}

type PostHogLike = { register: (props: Record<string, unknown>) => void };

/**
 * Put `paywall_variant` on every PostHog event from this device. PostHog's
 * snippet loads after hydration, so this retries briefly until it exists.
 */
export function registerPaywallVariant(attempt = 0): void {
  if (typeof window === "undefined") return;
  const p = (window as unknown as { posthog?: PostHogLike }).posthog;
  if (p && typeof p.register === "function") {
    p.register({ paywall_variant: paywallVariant() });
  } else if (attempt < 10) {
    window.setTimeout(() => registerPaywallVariant(attempt + 1), 500);
  }
}

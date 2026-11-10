// When a paywall shows to a free user (spec: claude/spritz-paywall-build-spec.md,
// approved 2026-11-09; decision D39).
//
// Three triggers:
//   first_fragrance  once per device, on the next navigation after the first
//                    /fragrance/[id] view (PostHog, Oct 31 to Nov 9: 57% of
//                    new users open a fragrance page in their first 30
//                    minutes; 9% start a scan)
//   shelf_library    once per device, on the first visit to /collection or
//                    /library (the original intro-sheet rule, kept)
//   weekly_open      on app open when 7+ days have passed since any paywall
//                    was shown. Native apps only, never in the first session.
//                    Replaces the old "two shows ever" rule.
//
// Shared rule: one paywall per session. A session starts on first load and
// again after SESSION_GAP_MS without activity.
//
// This file is pure (no window, no React) so `npm run test:paywall` can run
// it. Storage, PostHog and the env switch live in lib/paywall-client.ts.

export type PaywallVariant = "intro_sheet" | "one_screen";
export type PaywallTrigger = "first_fragrance" | "shelf_library" | "weekly_open";

export const SESSION_GAP_MS = 30 * 60 * 1000;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface PaywallState {
  v: 1;
  /** A/B arm, drawn once per device. Only used while the test is on. */
  variant: PaywallVariant;
  firstSeenAt: number;
  /** Sessions started on this device, this one included. */
  sessions: number;
  lastActiveAt: number;
  /** Pathname of the first fragrance page viewed, e.g. "/fragrance/123". */
  firstFragrancePath: string | null;
  firstFragranceDone: boolean;
  shelfLibraryDone: boolean;
  /** When any trigger last showed a paywall. */
  lastShownAt: number | null;
  /** `sessions` value at that show: the one-per-session guard. */
  lastShownSession: number | null;
  /** `sessions` value of the session the weekly paywall is due in, if any. */
  weeklyDueSession: number | null;
}

/** The pre-D39 intro-sheet record (localStorage `spritz:pro-intro:v1`). */
export interface LegacyIntroState {
  shows?: number;
  dismissedAt?: number | null;
}

export function newState(
  now: number,
  variant: PaywallVariant,
  legacy?: LegacyIntroState | null,
): PaywallState {
  const shown = (legacy?.shows ?? 0) >= 1;
  return {
    v: 1,
    variant,
    firstSeenAt: now,
    sessions: 0,
    lastActiveAt: 0,
    firstFragrancePath: null,
    firstFragranceDone: false,
    // Someone who already saw the old sheet has had their Shelf/Library show.
    shelfLibraryDone: shown,
    lastShownAt: shown ? (legacy?.dismissedAt ?? now) : null,
    lastShownSession: null,
    weeklyDueSession: null,
  };
}

/** 50/50 draw. `rand` is Math.random() in the app, fixed in tests. */
export function drawVariant(rand: number): PaywallVariant {
  return rand < 0.5 ? "intro_sheet" : "one_screen";
}

/**
 * Which arm a device is in right now. `mode` is NEXT_PUBLIC_PAYWALL_TEST:
 * "on" runs the test; "intro_sheet" or "one_screen" sends everyone to that
 * arm (how the test ends); anything else means the intro sheet.
 */
export function effectiveVariant(state: PaywallState, mode: string | undefined): PaywallVariant {
  if (mode === "on") return state.variant;
  if (mode === "one_screen") return "one_screen";
  return "intro_sheet";
}

export function isFragrancePath(pathname: string): boolean {
  return /^\/fragrance\/[^/]+\/?$/.test(pathname);
}

// A paywall never opens over these: the purchase page itself, auth, the
// camera, onboarding, and the pages App Review reads.
const BLOCKED_PREFIXES = ["/pricing", "/sign-in", "/sign-up", "/scan", "/welcome", "/native-auth", "/legal", "/support"];

export function isBlockedPath(pathname: string): boolean {
  return BLOCKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Record activity on `pathname`. Starts a new session after SESSION_GAP_MS
 * idle, decides at that moment whether the weekly paywall is due, and
 * remembers the first fragrance page. Call on every route change.
 */
export function observe(
  state: PaywallState,
  ctx: { pathname: string; now: number; native: boolean },
): PaywallState {
  const next = { ...state };
  if (next.sessions === 0 || ctx.now - next.lastActiveAt >= SESSION_GAP_MS) {
    next.sessions += 1;
    const since = ctx.now - (next.lastShownAt ?? next.firstSeenAt);
    next.weeklyDueSession = ctx.native && next.sessions > 1 && since >= WEEK_MS ? next.sessions : null;
  }
  next.lastActiveAt = ctx.now;
  if (next.firstFragrancePath === null && isFragrancePath(ctx.pathname)) {
    next.firstFragrancePath = ctx.pathname;
  }
  return next;
}

/** The trigger that should open a paywall on `pathname` now, or null. */
export function decide(state: PaywallState, pathname: string): PaywallTrigger | null {
  if (isBlockedPath(pathname)) return null;
  if (state.lastShownSession === state.sessions) return null;
  if (state.weeklyDueSession === state.sessions) return "weekly_open";
  if (!state.firstFragranceDone && state.firstFragrancePath !== null && pathname !== state.firstFragrancePath) {
    return "first_fragrance";
  }
  if (!state.shelfLibraryDone && (pathname === "/library" || pathname === "/collection")) {
    return "shelf_library";
  }
  return null;
}

/**
 * Record a paywall that no trigger opened (the one-screen paywall coming
 * back after sign-up): it takes this session's slot and restarts the weekly
 * clock, but uses no trigger up.
 */
export function markSessionShown(state: PaywallState, now: number): PaywallState {
  return { ...state, lastShownAt: now, lastShownSession: state.sessions, weeklyDueSession: null };
}

/** Record that `trigger` opened a paywall. */
export function markShown(state: PaywallState, trigger: PaywallTrigger, now: number): PaywallState {
  return {
    ...state,
    lastShownAt: now,
    lastShownSession: state.sessions,
    weeklyDueSession: null,
    firstFragranceDone: state.firstFragranceDone || trigger === "first_fragrance",
    shelfLibraryDone: state.shelfLibraryDone || trigger === "shelf_library",
  };
}

/**
 * Tester override, so either arm can be checked on a real device without
 * exposing anyone else: sign up with an address whose name part ends in
 * "+paywalla" (intro sheet) or "+paywallb" (one-screen paywall), optionally
 * followed by digits, e.g. josh+paywallb2@example.com. Testers also get a
 * fresh set of triggers on every app launch (see ProIntroSheet).
 */
export function testerArm(email: string | null | undefined): PaywallVariant | null {
  const local = (email ?? "").split("@")[0].toLowerCase();
  const m = /\+paywall([ab])\d*$/.exec(local);
  if (!m) return null;
  return m[1] === "b" ? "one_screen" : "intro_sheet";
}

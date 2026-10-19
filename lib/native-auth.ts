// OAuth for the native shell. Client-only.
//
// The problem: Google refuses to run OAuth inside an embedded webview
// (`disallowed_useragent`), and cookies do not cross between the system
// browser and WKWebView, so signing in "in Safari" leaves the session in
// Safari. The session has to be handed back explicitly. Clerk's mechanism
// for that is a sign-in token, exchanged in the webview with the `ticket`
// strategy. Full design: docs/superpowers/specs/2026-09-03-slice-2.2-*.md
//
// The round trip:
//   1. beginNativeOAuth()      webview   mints a nonce, opens the system
//                                        browser at /native-auth/start
//   2. /native-auth/start      server    stores the nonce in a cookie,
//                                        sends the browser into Clerk's
//                                        OAuth redirect
//   3. /sign-in/sso-callback   browser   Clerk finishes the OAuth leg (the
//                                        same callback the website uses);
//                                        NativeReturnGuard catches any
//                                        other landing page
//   4. /native-auth/complete   server    signed-in now; mints a 60-second
//                                        sign-in token, redirects to
//                                        app.spritzofficial://sso-callback
//   5. handleNativeAuthUrl()   webview   checks the nonce, exchanges the
//                                        ticket, activates the session
//
// Why the nonce: the ticket arrives through the OS URL router, which any
// process on the device can invoke. Without a nonce, a crafted deep link
// could sign this app into an attacker's account (login CSRF). The webview
// only accepts a callback carrying the nonce it issued for the flow it
// started. The 60-second single-use token limits the other direction.

import { NATIVE_URL_SCHEME, isNativeApp } from "./native";

export type NativeOAuthStrategy = "oauth_google" | "oauth_apple";

/** Host segment of the callback URL: app.spritzofficial://sso-callback */
export const NATIVE_AUTH_CALLBACK_HOST = "sso-callback";

const PENDING_KEY = "spritz:native-auth:nonce";

/**
 * Events the bridge dispatches on `window` so the sign-in UI can react
 * without being coupled to the bridge component.
 */
export const NATIVE_AUTH_EVENT = "spritz:native-auth";
export type NativeAuthEventDetail =
  | { phase: "started" }
  | { phase: "exchanging" }
  | { phase: "complete" }
  | { phase: "error"; message: string };

function emit(detail: NativeAuthEventDetail) {
  window.dispatchEvent(new CustomEvent(NATIVE_AUTH_EVENT, { detail }));
}

function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// sessionStorage backs the in-memory copy in case iOS reclaims the
// webview while the browser sheet is up. Rare, but recovery is free.
let pendingNonce: string | null = null;
function setPending(nonce: string | null) {
  pendingNonce = nonce;
  try {
    if (nonce) sessionStorage.setItem(PENDING_KEY, nonce);
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage unavailable; memory copy still works */
  }
}
function getPending(): string | null {
  if (pendingNonce) return pendingNonce;
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

/** Kick off the browser leg. No-op outside the shell. */
export async function beginNativeOAuth(strategy: NativeOAuthStrategy): Promise<void> {
  if (!isNativeApp()) return;
  const nonce = makeNonce();
  setPending(nonce);
  emit({ phase: "started" });

  const url = new URL("/native-auth/start", window.location.origin);
  url.searchParams.set("strategy", strategy);
  url.searchParams.set("nonce", nonce);

  // Dynamic import keeps the plugin out of the web bundle's critical
  // path; it is only ever executed inside the shell.
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: url.toString(), presentationStyle: "fullscreen" });
}

/**
 * Parse a deep link and, if it is our callback, return its parts.
 * Returns null for any URL that is not ours so the caller can ignore it.
 */
export function parseNativeAuthUrl(raw: string): { ticket: string; nonce: string } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // `app.spritzofficial://sso-callback?...` parses with protocol
  // "app.spritzofficial:" and host "sso-callback".
  if (url.protocol !== `${NATIVE_URL_SCHEME}:`) return null;
  if (url.host !== NATIVE_AUTH_CALLBACK_HOST) return null;
  const ticket = url.searchParams.get("ticket");
  const nonce = url.searchParams.get("nonce");
  if (!ticket || !nonce) return null;
  return { ticket, nonce };
}

/**
 * Minimal shape of Clerk's client-side SignIn resource that the exchange
 * needs. Kept structural so this module has no Clerk import and can be
 * unit-tested without it.
 */
export interface TicketSignIn {
  create(params: { strategy: "ticket"; ticket: string }): Promise<{
    status: string | null;
    createdSessionId: string | null;
  }>;
}

export type SetActiveFn = (params: { session: string }) => Promise<unknown>;

/**
 * Complete the flow inside the webview. Called by the bridge with every
 * `appUrlOpen` URL; ignores anything that is not our callback.
 *
 * Returns true when a session was activated.
 */
export async function handleNativeAuthUrl(
  raw: string,
  signIn: TicketSignIn,
  setActive: SetActiveFn,
): Promise<boolean> {
  const parsed = parseNativeAuthUrl(raw);
  if (!parsed) return false;

  const expected = getPending();
  if (!expected || parsed.nonce !== expected) {
    // Not a flow this webview started. Drop it silently: surfacing an
    // error here would let an attacker put text on the user's screen.
    return false;
  }
  setPending(null);
  emit({ phase: "exchanging" });

  try {
    const result = await signIn.create({ strategy: "ticket", ticket: parsed.ticket });
    if (result.status !== "complete" || !result.createdSessionId) {
      emit({
        phase: "error",
        message: "Sign-in didn't finish. Try again.",
      });
      return false;
    }
    await setActive({ session: result.createdSessionId });
    emit({ phase: "complete" });
    return true;
  } catch {
    // Expired or already-used ticket lands here. Recoverable: the user
    // taps the button again and gets a fresh one.
    emit({
      phase: "error",
      message: "That sign-in link expired. Try again.",
    });
    return false;
  } finally {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.close();
    } catch {
      /* browser already dismissed */
    }
  }
}

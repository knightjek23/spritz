// Shared between the server halves of the native OAuth round trip
// (app/native-auth/start and app/native-auth/complete) and the client-side
// return guard. Route files may only export route handlers, so the
// constants live here.

/** httpOnly. Carries the nonce the webview issued. Scoped to /native-auth. */
export const NONCE_COOKIE = "spritz_native_nonce";
export const NONCE_PATTERN = /^[0-9a-f]{32}$/;
export const NONCE_COOKIE_PATH = "/native-auth";

/**
 * NOT httpOnly, no secret in it, site-wide. A marker that says "a native
 * sign-in is in progress in this browser." components/native-return-guard.tsx
 * reads it so that wherever Clerk lands the browser after sign-in, the page
 * bounces to /native-auth/complete. Both cookies share one lifetime.
 */
export const PENDING_COOKIE = "spritz_native_pending";
export const COOKIE_MAX_AGE_SECONDS = 5 * 60;

// Shared between the two server halves of the native OAuth round trip
// (app/native-auth/start and app/native-auth/complete). Route files may
// only export route handlers, so the constants live here.

export const NONCE_COOKIE = "spritz_native_nonce";
export const NONCE_PATTERN = /^[0-9a-f]{32}$/;
export const NONCE_COOKIE_PATH = "/native-auth";

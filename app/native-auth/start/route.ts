// GET /native-auth/start?strategy=oauth_google&nonce=<hex>
//
// Step 2 of the native OAuth round trip (lib/native-auth.ts has the map).
// Runs in the SYSTEM BROWSER, opened by the shell. Its only jobs are to
// pin the nonce to this browser session in an httpOnly cookie and to hand
// off to the client page that starts Clerk's redirect flow.
//
// The nonce goes in a cookie rather than riding the OAuth round trip in a
// query string because Clerk's callback rewrites the URL on the way back
// and a query param would not survive a sign-in-to-sign-up transfer.

import { NextResponse, type NextRequest } from "next/server";
import { NONCE_COOKIE, NONCE_COOKIE_PATH, NONCE_PATTERN } from "@/lib/native-auth-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STRATEGIES = new Set(["oauth_google", "oauth_apple"]);

// Five minutes is generous for a Google account chooser and tight enough
// that a stale cookie cannot be picked up by a later, unrelated flow.
const COOKIE_MAX_AGE_SECONDS = 5 * 60;

export function GET(req: NextRequest) {
  const strategy = req.nextUrl.searchParams.get("strategy") ?? "";
  const nonce = req.nextUrl.searchParams.get("nonce") ?? "";

  if (!ALLOWED_STRATEGIES.has(strategy) || !NONCE_PATTERN.test(nonce)) {
    return new NextResponse("Bad native auth request.", { status: 400 });
  }

  const next = new URL("/native-auth/go", req.nextUrl.origin);
  next.searchParams.set("strategy", strategy);

  const res = NextResponse.redirect(next, 302);
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: NONCE_COOKIE_PATH,
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return res;
}

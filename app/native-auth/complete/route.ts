// GET /native-auth/complete
//
// Step 4 of the native OAuth round trip (lib/native-auth.ts has the map).
// Runs in the SYSTEM BROWSER, which by now holds a Clerk session. This
// route turns that session into something the shell's webview can use:
// a single-use sign-in token, handed over on the app's custom URL scheme.
//
// The token is deliberately short-lived. It travels through the OS URL
// router, and on iOS any installed app can claim a custom scheme, so the
// window in which a stolen token is worth anything is kept to a minute.
// The nonce cookie set by /native-auth/start is echoed back so the webview
// can confirm this callback belongs to the flow it started.
//
// Not protected by middleware on purpose: a Clerk redirect-to-sign-in here
// would loop. A missing session gets a plain page instead.

import { NextResponse, type NextRequest } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NONCE_COOKIE, NONCE_COOKIE_PATH, NONCE_PATTERN } from "@/lib/native-auth-cookie";
import { NATIVE_URL_SCHEME } from "@/lib/native";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_TTL_SECONDS = 60;
const CALLBACK_HOST = "sso-callback";

function plain(status: number, body: string) {
  return new NextResponse(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return plain(401, "Sign-in didn't complete. Go back to the Spritz app and try again.");
  }

  const nonce = req.cookies.get(NONCE_COOKIE)?.value ?? "";
  if (!NONCE_PATTERN.test(nonce)) {
    return plain(400, "This sign-in link has expired. Go back to the Spritz app and try again.");
  }

  const client = typeof clerkClient === "function" ? clerkClient() : clerkClient;
  const signInToken = await client.signInTokens.createSignInToken({
    userId,
    expiresInSeconds: TOKEN_TTL_SECONDS,
  });

  const target = new URL(`${NATIVE_URL_SCHEME}://${CALLBACK_HOST}`);
  target.searchParams.set("ticket", signInToken.token);
  target.searchParams.set("nonce", nonce);

  const res = NextResponse.redirect(target, 302);
  // One flow, one nonce. Clearing it means a replayed /complete request
  // in the same browser cannot mint a second token for the same nonce.
  res.cookies.set(NONCE_COOKIE, "", { path: NONCE_COOKIE_PATH, maxAge: 0 });
  return res;
}

"use client";

// Step 2b of the native OAuth round trip. Runs in the SYSTEM BROWSER.
//
// A client page because Clerk's OAuth redirect has to be started from
// clerk-js. On mount it sends the browser into the provider's flow, which
// ends at /native-auth/complete.
//
// The browser here is an SFSafariViewController, which since iOS 11 keeps
// its own cookie store: it never sees the Safari app's session, and the
// only session it can hold is one this app created on an earlier sign-in.
// So a session found here is always stale (the user signed out of the
// app and is signing in again, possibly as someone else) and is cleared
// before the tapped provider runs. An earlier version short-circuited on
// that session instead, which made switching accounts impossible (D30).
//
// The strategy comes back as a search param from the server route rather
// than being read from the cookie here, because the cookie is httpOnly on
// purpose and this page has no reason to know the nonce at all.

import { useEffect, useRef, useState } from "react";
import { useAuth, useClerk, useSignIn } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { SpritzLoader } from "@/components/spritz-loader";

const COMPLETE_PATH = "/native-auth/complete";
// Clerk's <SignIn /> serves this under the /sign-in/[[...sign-in]] catch-all
// and finishes OAuth there, including the transfer to sign-up for a
// first-time Google account. It is the same callback the website's own
// Google button uses, so it is known to work in this browser. A separate
// /native-auth/callback page with <AuthenticateWithRedirectCallback /> was
// tried first and came back from Google unable to find the sign-in, which
// bounced the browser to Clerk's hosted Account Portal.
const CALLBACK_PATH = "/sign-in/sso-callback";

export function NativeAuthGo() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { isLoaded: signInLoaded, signIn } = useSignIn();
  const clerk = useClerk();
  const params = useSearchParams();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoaded || !signInLoaded || started.current) return;
    started.current = true;

    const strategy = params.get("strategy");
    if (strategy !== "oauth_google" && strategy !== "oauth_apple") {
      setError("This sign-in link is missing its provider.");
      return;
    }

    // clerk.client.signIn rather than the hook's copy, so a sign-out a
    // moment ago cannot leave us holding a stale resource.
    const start = () =>
      (clerk.client?.signIn ?? signIn)?.authenticateWithRedirect({
        strategy,
        redirectUrl: CALLBACK_PATH,
        redirectUrlComplete: COMPLETE_PATH,
      });

    (async () => {
      if (isSignedIn) {
        // Stale session from a previous native sign-in; see header. The
        // callback form of signOut runs `start` after the session is gone
        // and, unlike the options form, does not navigate to
        // afterSignOutUrl first (which sent the sheet to the landing page).
        await clerk.signOut(async () => {
          await start();
        });
        return;
      }
      await start();
    })().catch(() => setError("Couldn't start sign-in. Go back to the app and try again."));
  }, [authLoaded, signInLoaded, isSignedIn, signIn, clerk, params]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6">
      {error ? (
        <p className="text-sm text-burgundy text-center max-w-xs">{error}</p>
      ) : (
        <SpritzLoader size={72} label="Opening sign-in" showLabel />
      )}
    </div>
  );
}

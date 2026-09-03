"use client";

// Step 2b of the native OAuth round trip. Runs in the SYSTEM BROWSER.
//
// A client page because Clerk's OAuth redirect has to be started from
// clerk-js. On mount it either short-circuits (the browser already has a
// Spritz session, so there is nothing to authenticate) or sends the
// browser into the provider's flow. Both paths end at /native-auth/complete.
//
// The strategy comes back as a search param from the server route rather
// than being read from the cookie here, because the cookie is httpOnly on
// purpose and this page has no reason to know the nonce at all.

import { useEffect, useRef, useState } from "react";
import { useAuth, useSignIn } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { SpritzLoader } from "@/components/spritz-loader";

const COMPLETE_PATH = "/native-auth/complete";
const CALLBACK_PATH = "/native-auth/callback";

export function NativeAuthGo() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { isLoaded: signInLoaded, signIn } = useSignIn();
  const params = useSearchParams();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoaded || !signInLoaded || started.current) return;
    started.current = true;

    if (isSignedIn) {
      window.location.replace(COMPLETE_PATH);
      return;
    }

    const strategy = params.get("strategy");
    if (strategy !== "oauth_google" && strategy !== "oauth_apple") {
      setError("This sign-in link is missing its provider.");
      return;
    }

    signIn
      ?.authenticateWithRedirect({
        strategy,
        redirectUrl: CALLBACK_PATH,
        redirectUrlComplete: COMPLETE_PATH,
      })
      .catch(() => setError("Couldn't start sign-in. Go back to the app and try again."));
  }, [authLoaded, signInLoaded, isSignedIn, signIn, params]);

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

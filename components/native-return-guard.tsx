"use client";

// Safety net for the browser leg of native sign-in. Runs in the SYSTEM
// BROWSER only; a no-op inside the shell and on any ordinary web visit.
//
// /native-auth/go asks Clerk to land on /native-auth/complete when sign-in
// finishes, and for a returning user it does. For a first-time Google
// account Clerk transfers the attempt to sign-up and may honor the sign-up
// page's own redirect (/welcome) instead. Either way the browser now holds
// a session and a `spritz_native_pending` cookie, which is all that is
// needed to finish: bounce to /native-auth/complete, which mints the ticket
// and hands the session back to the app.
//
// The cookie carries no secret and expires in five minutes, so the worst
// a stale one can do is send a signed-in browser to /native-auth/complete
// once, where it is cleared.

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { isNativeApp } from "@/lib/native";
import { PENDING_COOKIE } from "@/lib/native-auth-cookie";

const COMPLETE_PATH = "/native-auth/complete";

function hasPendingCookie(): boolean {
  return document.cookie.split(";").some((c) => c.trim().startsWith(`${PENDING_COOKIE}=`));
}

export function NativeReturnGuard() {
  const { isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (isNativeApp()) return;
    if (pathname?.startsWith("/native-auth/")) return;
    if (!hasPendingCookie()) return;
    window.location.replace(COMPLETE_PATH);
  }, [isLoaded, isSignedIn, pathname]);

  return null;
}

"use client";

// Native-shell bridge. Mounted once in the root layout, renders nothing.
//
// Three jobs, all no-ops on the web:
//   1. Mirror isNativeApp() onto <html class="native-app"> so CSS and
//      server-rendered markup can branch on it after hydration. This is
//      how the sign-in pages hide Clerk's own social buttons on native
//      (globals.css) without touching the web version of the page.
//   2. Listen for the app being opened by URL and finish the native OAuth
//      round trip (lib/native-auth.ts) when the URL is our callback.
//   3. Own the push-notification listeners: store the APNs token whenever
//      iOS issues or rotates one, and on a notification tap navigate to the
//      path in the payload and record the open (slice 5).
//
// The exchange needs clerk-js's signIn resource and setActive, which only
// exist inside Clerk's React context. That is why this lives in a
// component rather than in lib/native-auth.ts itself.

import { useEffect, useRef } from "react";
import { useClerk, useSignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { NATIVE_HTML_CLASS, isNativeApp } from "@/lib/native";
import { handleNativeAuthUrl } from "@/lib/native-auth";
import { reportPushOpened, saveTokenToServer } from "@/lib/push";

// A user whose account is younger than this when they land is treated as
// brand new and sent to first-run onboarding, matching what the web
// sign-up page does with forceRedirectUrl="/welcome".
const NEW_ACCOUNT_WINDOW_MS = 5 * 60 * 1000;

export function NativeAuthBridge() {
  const clerk = useClerk();
  const { signIn, setActive } = useSignIn();
  const router = useRouter();

  // The listener is registered once but must always see the latest
  // Clerk objects, which arrive after load. Refs avoid re-registering.
  const signInRef = useRef(signIn);
  const setActiveRef = useRef(setActive);
  signInRef.current = signIn;
  setActiveRef.current = setActive;

  useEffect(() => {
    if (!isNativeApp()) return;
    document.documentElement.classList.add(NATIVE_HTML_CLASS);

    let remove: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("appUrlOpen", async ({ url }) => {
        const signInNow = signInRef.current;
        const setActiveNow = setActiveRef.current;
        if (!signInNow || !setActiveNow) return;

        const ok = await handleNativeAuthUrl(url, signInNow, setActiveNow);
        if (!ok) return;

        const createdAt = clerk.user?.createdAt?.getTime() ?? 0;
        const isNew = Date.now() - createdAt < NEW_ACCOUNT_WINDOW_MS;
        router.replace(isNew ? "/welcome" : "/");
        router.refresh();
      });
      if (cancelled) handle.remove();
      else remove = () => handle.remove();
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [clerk, router]);

  // Push listeners. Registered once for the app's lifetime. `registration`
  // fires after PushNotifications.register() (from the primer) and again
  // whenever iOS rotates the token, so the server copy stays current.
  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];

    (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");

      handles.push(
        await PushNotifications.addListener("registration", ({ value }) => {
          saveTokenToServer(value).catch(() => {});
        }),
      );
      handles.push(
        await PushNotifications.addListener("registrationError", (e) => {
          console.warn("[push] registration error", e);
        }),
      );
      handles.push(
        await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          const data = (action.notification.data ?? {}) as { path?: unknown; sendId?: unknown };
          if (typeof data.sendId === "string") reportPushOpened(data.sendId);
          if (typeof data.path === "string" && data.path.startsWith("/")) {
            router.push(data.path);
          }
        }),
      );

      if (cancelled) handles.forEach((h) => h.remove());
    })();

    return () => {
      cancelled = true;
      handles.forEach((h) => h.remove());
    };
  }, [router]);

  return null;
}

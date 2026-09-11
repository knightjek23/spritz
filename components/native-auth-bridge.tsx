"use client";

// Native-shell bridge. Mounted once in the root layout, renders nothing.
//
// Five jobs, all no-ops on the web:
//   1. Mirror isNativeApp() onto <html class="native-app"> so CSS and
//      server-rendered markup can branch on it after hydration. This is
//      how the sign-in pages hide Clerk's own social buttons on native
//      (globals.css) without touching the web version of the page.
//   2. Listen for the app being opened by URL and finish the native OAuth
//      round trip (lib/native-auth.ts) when the URL is our callback.
//   3. Own the push-notification listeners: store the APNs token whenever
//      iOS issues or rotates one, and on a notification tap navigate to the
//      path in the payload and record the open (slice 5).
//   4. Style the status bar for the cream canvas (slice 8).
//   5. Open external links in the in-app browser sheet instead of kicking
//      the person out to Safari (slice 8, D27).
//
// The exchange needs clerk-js's signIn resource and setActive, which only
// exist inside Clerk's React context. That is why this lives in a
// component rather than in lib/native-auth.ts itself.

import { useEffect, useRef } from "react";
import { useAuth, useClerk, useSignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { NATIVE_HTML_CLASS, isNativeApp } from "@/lib/native";
import { handleNativeAuthUrl } from "@/lib/native-auth";
import { reportPushOpened, saveTokenToServer } from "@/lib/push";
import { configurePurchases, logOutPurchases } from "@/lib/native/purchases";

// A user whose account is younger than this when they land is treated as
// brand new and sent to first-run onboarding, matching what the web
// sign-up page does with forceRedirectUrl="/welcome".
const NEW_ACCOUNT_WINDOW_MS = 5 * 60 * 1000;

export function NativeAuthBridge() {
  const clerk = useClerk();
  const { signIn, setActive } = useSignIn();
  const { isLoaded: authLoaded, userId } = useAuth();
  const router = useRouter();

  // RevenueCat identity follows the Clerk session (slice 7): configure the
  // SDK with the Clerk user id so store events map to users.clerk_user_id,
  // and forget it on sign-out so the next account starts clean.
  useEffect(() => {
    if (!isNativeApp() || !authLoaded) return;
    if (userId) {
      configurePurchases(userId).catch((e) => console.warn("[purchases] configure failed", e));
    } else {
      logOutPurchases().catch(() => {});
    }
  }, [authLoaded, userId]);

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
          saveTokenToServer(value)
            .then((ok) => console.log(`[push] token ${ok ? "saved" : "NOT saved (signed out?)"}`))
            .catch((e) => console.warn("[push] token save failed", e));
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

      if (cancelled) {
        handles.forEach((h) => h.remove());
        return;
      }

      // Permission already granted (an earlier Yes, or iOS carrying the
      // grant across a reinstall of the same bundle ID): register now so the
      // token reaches the server, and re-register on every launch after,
      // since APNs rotates tokens. register() never shows a prompt; only
      // requestPermissions() does, and that stays with the primer.
      const { receive } = await PushNotifications.checkPermissions();
      if (receive === "granted") {
        console.log("[push] permission granted, registering for a token");
        await PushNotifications.register();
      }
    })();

    return () => {
      cancelled = true;
      handles.forEach((h) => h.remove());
    };
  }, [router]);

  // Status bar: dark glyphs on the cream canvas. Style.Light means "light
  // background", i.e. dark text. Set once per launch; the shell never shows
  // a dark screen the bar would need to invert for.
  useEffect(() => {
    if (!isNativeApp()) return;
    (async () => {
      const { StatusBar, Style } = await import("@capacitor/status-bar");
      await StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    })();
  }, []);

  // External links (Buy, house websites, Apple/Google subscription pages)
  // open in the Browser plugin's Safari sheet with a Done button, so the
  // person lands back exactly where they were. Capacitor's default is to
  // hand them to the Safari app, which is a full context switch. One
  // capturing listener covers every <a target="_blank"> and every
  // off-origin http(s) link without touching the components.
  useEffect(() => {
    if (!isNativeApp()) return;
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      const external = url.origin !== window.location.origin;
      if (!external && a.target !== "_blank") return;
      e.preventDefault();
      import("@capacitor/browser")
        .then(({ Browser }) => Browser.open({ url: url.toString(), presentationStyle: "popover" }))
        .catch(() => {
          window.location.href = url.toString();
        });
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}

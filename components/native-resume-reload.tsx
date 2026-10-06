"use client";

// Recovers the shell after a long background.
//
// iOS suspends the web view when the app leaves the foreground and drops
// its sockets. A request in flight at that moment (Clerk's session
// refresh, a prefetch, the trends poll) never settles once the app comes
// back; Next's router queue stalls behind it and every later tap looks
// dead while scrolling still works. The Clerk session cookie has usually
// expired by then too.
//
// Fix: when the page becomes visible again after more than RELOAD_AFTER_MS
// hidden, reload the current URL. Fresh router, fresh session, fresh
// sockets, same page. Short app switches stay instant. Native shell only;
// a browser tab never resumes into this state.

import { useEffect } from "react";
import { isNativeApp } from "@/lib/native";

const RELOAD_AFTER_MS = 45_000;

export function NativeResumeReload() {
  useEffect(() => {
    if (!isNativeApp()) return;
    let hiddenAt: number | null = null;
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt === null) return;
      const away = Date.now() - hiddenAt;
      hiddenAt = null;
      if (away >= RELOAD_AFTER_MS) {
        console.log(`[resume] away ${Math.round(away / 1000)}s, reloading`);
        window.location.reload();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  return null;
}

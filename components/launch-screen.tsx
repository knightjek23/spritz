"use client";

// Launch screen — the first thing on screen when the app is opened cold.
//
// The iOS storyboard and capacitor.config.ts backgroundColor paint plain
// cream while WKWebView boots; this layer takes over the moment our HTML
// paints, so launch reads as one continuous cream surface: cream splash,
// then the bottle appears in the middle of it and pumps, then the layer
// fades and the app is underneath. Modeled on Instagram's launch (icon
// zoom from the OS, a held glyph on a solid field, a soft fade into
// content that is already rendered), not a progress bar.
//
// How it stays flicker-free:
//   - The overlay is server-rendered but hidden by default. An inline
//     script in the root layout (LAUNCH_SCREEN_BOOT, below) runs before
//     the body paints and adds `launching` to <html> only when this is a
//     cold launch of the native shell (or an installed PWA) and the screen
//     has not shown this session. No React, so no hydration flash either
//     way. On the plain web it never shows: a visitor landing from Google
//     should see the page, not a splash.
//   - The bottle pumps on the loader's CSS cycle (spritz-loader-*), which
//     starts on first paint and keeps going until the page is ready. The
//     hold is at least MIN_HOLD_MS from navigation start so one full pump
//     always completes, and at least until hydration so the app is live
//     when it is revealed.
//   - The leave is a CSS class; React only removes the node afterwards.
//
// sessionStorage, not localStorage: a cold start is a new WKWebView
// process, so it shows once per launch and never on the reloads
// NativeResumeReload does after a long background.

import { useEffect, useState } from "react";

const SESSION_KEY = "spritz.launched";
/** Minimum time on screen from navigation start: one full pump (1.35s)
 *  plus a beat of stillness before the fade starts. */
const MIN_HOLD_MS = 1500;
/** Matches .launch-screen--leave in globals.css. */
const LEAVE_MS = 600;
const REDUCED_HOLD_MS = 400;
const REDUCED_LEAVE_MS = 220;

/**
 * Inline, pre-paint. Decides whether this page load gets the launch
 * screen. Kept as a string so it can be dropped into the layout with
 * dangerouslySetInnerHTML and run before any stylesheet-dependent paint.
 * window.Capacitor is injected by the shell before our scripts run.
 */
export const LAUNCH_SCREEN_BOOT = `(function(){try{
var c=window.Capacitor,native=!!(c&&c.isNativePlatform&&c.isNativePlatform());
var pwa=window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches;
if(!(native||pwa))return;
if(window.sessionStorage.getItem('${SESSION_KEY}'))return;
document.documentElement.classList.add('launching');
}catch(e){}})();`;

export function LaunchScreen() {
  const [phase, setPhase] = useState<"hold" | "leave" | "gone">("hold");

  useEffect(() => {
    // The boot script decided. If it did not add the class, this load gets
    // no launch screen and the node can go immediately.
    if (!document.documentElement.classList.contains("launching")) {
      setPhase("gone");
      return;
    }
    try {
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Private mode: the screen will show on every load, which is fine.
    }

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = reduce ? REDUCED_HOLD_MS : MIN_HOLD_MS;
    const leave = reduce ? REDUCED_LEAVE_MS : LEAVE_MS;
    // performance.now() counts from navigation start, which is when the
    // first paint (and the CSS pump) began, give or take a frame. So the
    // wait is "whatever is left of the hold", or nothing if hydration
    // itself took longer than the hold.
    const remaining = Math.max(0, hold - performance.now());

    const t1 = window.setTimeout(() => setPhase("leave"), remaining);
    const t2 = window.setTimeout(() => {
      setPhase("gone");
      document.documentElement.classList.remove("launching");
    }, remaining + leave);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      className={`launch-screen${phase === "leave" ? " launch-screen--leave" : ""}`}
      aria-hidden="true"
    >
      {/* Same drawn bottle as SpritzLoader (and the placeholder bottle), on
          the loader's pump cycle. Inlined rather than <SpritzLoader /> so
          this file has no client dependencies beyond React and the cap
          fill is pinned to the launch field's own cream. */}
      <svg
        className="launch-screen__bottle"
        viewBox="48 -3 148 214"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        focusable="false"
      >
        <path
          d="M57 148 H162 V198 A4 4 0 0 1 158 202 H61 A4 4 0 0 1 57 198 Z"
          fill="currentColor"
          fillOpacity="0.2"
          className="spritz-loader-liquid"
        />
        <rect x="56" y="60" width="107" height="143" rx="7.5" stroke="currentColor" strokeWidth="5" />
        <rect x="98" y="44" width="23" height="15" stroke="currentColor" strokeWidth="5" />
        <g className="spritz-loader-cap">
          <rect x="88" y="16" width="43" height="27" rx="1.5" fill="#F4EFE6" stroke="currentColor" strokeWidth="5" />
          <rect x="131" y="24" width="12" height="9" rx="1.5" fill="#F4EFE6" stroke="currentColor" strokeWidth="5" />
        </g>
        <g className="spritz-loader-spray" stroke="currentColor" strokeWidth="5" strokeLinecap="round">
          <path d="M150.5 20 L169.3 13.2" />
          <path d="M152 28.5 L172 28.5" />
          <path d="M150.5 37 L169.3 43.8" />
        </g>
        <g className="spritz-loader-mist" fill="currentColor">
          <circle cx="177.8" cy="10.1" r="2.8" />
          <circle cx="180" cy="28.5" r="2.8" />
          <circle cx="177.8" cy="46.9" r="2.8" />
        </g>
      </svg>
    </div>
  );
}

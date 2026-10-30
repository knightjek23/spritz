"use client";

// Launch screen — the first thing on screen when the app is opened cold.
//
// The iOS storyboard and capacitor.config.ts backgroundColor paint plain
// cream while WKWebView boots; this layer takes over the moment our HTML
// paints, so launch reads as one continuous cream surface: cream splash,
// then the "spritz" wordmark in the middle of it, then the wordmark IS the
// atomizer: it presses down like a pump head and a cone of mist leaves
// from the right of the z, the word springs back, the layer fades and the
// app is underneath. Modeled on Instagram's launch (icon zoom from the OS,
// a held glyph on a solid field, a soft fade into content that is already
// rendered), not a progress bar.
//
// How it stays flicker-free:
//   - The overlay is server-rendered but hidden by default. An inline
//     script in the root layout (LAUNCH_SCREEN_BOOT, below) runs before
//     the body paints and adds `launching` to <html> only when this is a
//     cold launch of the native shell (or an installed PWA) and the screen
//     has not shown this session. No React, so no hydration flash either
//     way. On the plain web it never shows: a visitor landing from Google
//     should see the page, not a splash.
//   - Every motion is CSS scheduled from first paint (globals.css,
//     launch-*), so it runs whether or not React has hydrated yet. The
//     hold is at least MIN_HOLD_MS from navigation start so the pump
//     always completes, and at least until hydration so the app is live
//     when it is revealed.
//   - The leave is a CSS class; React only removes the node afterwards.
//
// sessionStorage, not localStorage: a cold start is a new WKWebView
// process, so it shows once per launch and never on the reloads
// NativeResumeReload does after a long background.

import { useEffect, useState } from "react";

const SESSION_KEY = "spritz.launched";
/** Minimum time on screen from navigation start. Schedule (globals.css):
 *  wordmark settles 0-480ms, press at 800ms (down by 950ms), mist streams
 *  950-1950ms while the word is held, word back up by 1700ms, then a
 *  beat of stillness before the fade. */
const MIN_HOLD_MS = 2250;
/** Matches .launch-screen--leave in globals.css. */
const LEAVE_MS = 600;
const REDUCED_HOLD_MS = 700;
const REDUCED_LEAVE_MS = 220;

/**
 * The mist: 220 fine droplets, 110 mirrored pairs, thrown from the nozzle
 * (the right edge of the z, on the x-height line) in a horizontal cone.
 * Each is [dx, dy, r, lag, opacity, sy] in SVG units of the 120-box: sy
 * is where on the nozzle slit it starts (±0.5-7 off the line, so the
 * spray is already wide at the z), dx its throw distance, dy where it
 * lands (the slit offset plus up to ±45% of dx, weighted toward the
 * axis so the cone is dense in the middle and feathers at the edges,
 * not a hollow V), r the radius (0.3-1.3, finer the further it travels), lag ms
 * after the press bottoms out before it leaves, opacity its peak. Every
 * droplet has a twin at -dy/-sy, so the cone is exactly symmetric about
 * the nozzle line and reads as straight. Lags are spaced evenly over the
 * whole 420ms the word is held down, so the z is emitting for as long as
 * the pump is pressed: one thick continuous spray, not a cloud that
 * detaches. Generated once with a seeded PRNG and frozen here so every
 * launch is the same spray.
 */
const MIST: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [41, -11.9, 0.56, 113, 0.6, -1.2],
  [74, 20.5, 0.72, 72, 0.73, 2.0],
  [47, -1.9, 1.09, 153, 0.68, -1.4],
  [31, 4.6, 0.96, 400, 0.85, 2.8],
  [74, -13.6, 0.99, 152, 0.65, -0.9],
  [58, -25.0, 0.68, 398, 0.84, -1.1],
  [58, 12.1, 1.12, 121, 0.57, 0.2],
  [56, -3.8, 0.98, 233, 0.62, -3.7],
  [104, 44.1, 0.42, 298, 0.86, 0.6],
  [48, 8.9, 0.51, 241, 0.89, 0.3],
  [104, 38.8, 0.42, 273, 0.47, 0.7],
  [66, 20.3, 0.48, 222, 0.57, 0.9],
  [64, 7.2, 0.92, 120, 0.65, 2.7],
  [107, 15.1, 0.37, 328, 0.48, 1.9],
  [93, -1.8, 0.71, 198, 0.57, -1.7],
  [47, -15.3, 0.86, 303, 0.82, -6.0],
  [113, 27.2, 0.51, 282, 0.55, 1.6],
  [85, -25.8, 1.07, 27, 0.78, -3.6],
  [89, 5.5, 0.86, 387, 0.62, 0.7],
  [72, 26.2, 0.75, 362, 0.7, 0.2],
  [31, 4.4, 0.49, 52, 0.71, 2.0],
  [88, 23.6, 0.45, 92, 0.86, 5.0],
  [44, 17.8, 0.92, 48, 0.56, 2.6],
  [87, 3.5, 1.01, 379, 0.45, 2.5],
  [33, 10.1, 1.07, 52, 0.89, 0.3],
  [104, -2.7, 0.88, 371, 0.76, -1.0],
  [106, -10.2, 0.46, 319, 0.7, -0.1],
  [71, -11.3, 0.98, 6, 0.75, -0.5],
  [67, 14.5, 0.98, 150, 0.76, 0.4],
  [40, -17.6, 0.8, 182, 0.52, -2.0],
  [91, 4.2, 0.73, 371, 0.7, 3.4],
  [81, -32.2, 0.59, 71, 0.53, -3.0],
  [109, -15.2, 0.32, 15, 0.48, -6.3],
  [97, 33.1, 0.72, 401, 0.52, 4.9],
  [108, 39.5, 0.61, 276, 0.68, 0.4],
  [92, -29.2, 0.95, 410, 0.55, -0.8],
  [80, 11.6, 0.98, 303, 0.78, 5.6],
  [93, 12.7, 1.0, 185, 0.57, 4.7],
  [37, -8.9, 1.07, 383, 0.61, -1.7],
  [112, 8.5, 0.35, 292, 0.47, 6.3],
  [74, 8.3, 1.06, 338, 0.54, 3.4],
  [38, 4.6, 0.57, 108, 0.71, 1.1],
  [85, 25.8, 1.0, 0, 0.78, 3.6],
  [73, -3.8, 0.84, 209, 0.7, -0.4],
  [32, -12.1, 1.27, 271, 0.67, -2.6],
  [74, 9.5, 0.38, 71, 0.78, 1.6],
  [34, 17.0, 0.5, 165, 0.89, 3.5],
  [46, 19.0, 0.46, 76, 0.81, 0.4],
  [78, 9.6, 1.0, 176, 0.47, 2.1],
  [51, -16.0, 0.54, 268, 0.61, -0.1],
  [74, -8.3, 0.94, 340, 0.54, -3.4],
  [113, -29.4, 0.26, 238, 0.49, -2.9],
  [36, 20.0, 0.73, 209, 0.7, 6.5],
  [96, 0.3, 0.45, 258, 0.51, 0.2],
  [46, 15.1, 0.61, 165, 0.54, 1.5],
  [44, 10.0, 1.09, 261, 0.59, 6.4],
  [74, 26.0, 0.86, 358, 0.58, 1.5],
  [104, -44.1, 0.4, 311, 0.86, -0.6],
  [92, 29.2, 0.88, 407, 0.55, 0.8],
  [36, -1.1, 0.99, 255, 0.64, -0.8],
  [41, 8.8, 0.98, 250, 0.83, 2.5],
  [81, 32.2, 0.58, 48, 0.53, 3.0],
  [68, 18.0, 0.55, 78, 0.51, 1.1],
  [44, -17.8, 0.9, 72, 0.56, -2.6],
  [52, -22.9, 1.11, 186, 0.67, -2.2],
  [96, -0.3, 0.4, 268, 0.51, -0.2],
  [79, 0.6, 0.42, 194, 0.6, 0.5],
  [74, -9.5, 0.36, 77, 0.78, -1.6],
  [47, 1.9, 0.97, 132, 0.68, 1.4],
  [71, 11.3, 0.86, 5, 0.75, 0.5],
  [103, 33.0, 0.4, 282, 0.69, 0.9],
  [102, 18.1, 0.37, 150, 0.53, 1.4],
  [64, -15.8, 0.36, 93, 0.89, -0.8],
  [79, -0.6, 0.46, 209, 0.6, -0.5],
  [73, 2.0, 0.39, 410, 0.76, 1.9],
  [33, -10.1, 1.15, 56, 0.89, -0.3],
  [75, -8.7, 0.69, 108, 0.61, -0.7],
  [109, 15.2, 0.37, 8, 0.48, 6.3],
  [32, -9.7, 0.46, 420, 0.5, -4.3],
  [72, -4.3, 1.06, 232, 0.78, -1.6],
  [89, -5.5, 0.93, 412, 0.62, -0.7],
  [102, -7.6, 0.48, 176, 0.87, -6.1],
  [39, 9.5, 0.97, 319, 0.49, 1.3],
  [107, -15.1, 0.33, 356, 0.48, -1.9],
  [80, -30.5, 0.88, 341, 0.46, -4.2],
  [111, -4.8, 0.32, 397, 0.72, -1.7],
  [36, -5.1, 0.72, 87, 0.79, -1.9],
  [59, -23.0, 0.8, 340, 0.77, -1.4],
  [105, -29.4, 0.68, 45, 0.57, -1.3],
  [80, 30.5, 0.97, 327, 0.46, 4.2],
  [108, 3.8, 0.52, 94, 0.68, 2.2],
  [74, 13.6, 0.98, 133, 0.65, 0.9],
  [38, -4.6, 0.62, 118, 0.71, -1.1],
  [64, 15.8, 0.37, 64, 0.89, 0.8],
  [41, -8.8, 0.88, 258, 0.83, -2.5],
  [30, -1.1, 0.78, 90, 0.82, -0.9],
  [51, 16.0, 0.48, 253, 0.61, 0.1],
  [87, -3.5, 1.13, 392, 0.45, -2.5],
  [36, 5.1, 0.69, 85, 0.79, 1.9],
  [91, -4.2, 0.82, 382, 0.7, -3.4],
  [75, 8.7, 0.62, 107, 0.61, 0.7],
  [58, 25.0, 0.68, 383, 0.84, 1.1],
  [98, 8.5, 0.72, 265, 0.49, 0.7],
  [61, -11.7, 0.61, 18, 0.75, -1.1],
  [61, 11.7, 0.68, 17, 0.75, 1.1],
  [88, -23.6, 0.49, 121, 0.86, -5.0],
  [105, -5.1, 0.64, 388, 0.73, -0.6],
  [93, -12.7, 1.08, 200, 0.57, -4.7],
  [112, -48.9, 0.42, 106, 0.77, -4.2],
  [32, 8.9, 0.9, 189, 0.87, 0.6],
  [72, 19.5, 0.95, 346, 0.49, 2.7],
  [113, 29.4, 0.29, 220, 0.49, 2.9],
  [72, -26.2, 0.75, 363, 0.7, -0.2],
  [31, -4.6, 0.91, 122, 0.73, -1.4],
  [74, -26.0, 0.89, 387, 0.58, -1.5],
  [32, -8.9, 0.85, 209, 0.87, -0.6],
  [111, 13.4, 0.51, 144, 0.71, 2.5],
  [52, 4.8, 0.55, 35, 0.73, 1.2],
  [105, 3.6, 0.54, 349, 0.53, 0.9],
  [73, 3.8, 0.89, 183, 0.7, 0.4],
  [31, 4.6, 0.81, 101, 0.73, 1.4],
  [73, -2.0, 0.39, 420, 0.76, -1.9],
  [30, 1.1, 0.71, 89, 0.82, 0.9],
  [71, 7.9, 1.09, 12, 0.51, 2.1],
  [112, 48.9, 0.38, 102, 0.77, 4.2],
  [104, -38.8, 0.43, 303, 0.47, -0.7],
  [63, -7.9, 1.06, 64, 0.64, -0.5],
  [64, -7.2, 1.0, 137, 0.65, -2.7],
  [96, -7.3, 0.81, 223, 0.71, -1.4],
  [89, 35.0, 0.93, 323, 0.73, 0.6],
  [74, 19.8, 0.52, 312, 0.52, 1.9],
  [44, -10.0, 0.97, 287, 0.59, -6.4],
  [72, 4.3, 0.97, 204, 0.78, 1.6],
  [67, 20.5, 0.6, 317, 0.63, 1.8],
  [40, 17.6, 0.84, 172, 0.52, 2.0],
  [68, 2.7, 0.56, 61, 0.79, 2.4],
  [87, 9.1, 0.64, 407, 0.67, 4.1],
  [48, 14.7, 0.63, 33, 0.79, 0.8],
  [99, -9.5, 0.9, 321, 0.68, -0.8],
  [104, 2.7, 0.89, 351, 0.76, 1.0],
  [80, -11.6, 0.9, 305, 0.78, -5.6],
  [28, -0.8, 0.41, 404, 0.8, -0.5],
  [52, -4.8, 0.55, 42, 0.73, -1.2],
  [108, -3.8, 0.54, 100, 0.68, -2.2],
  [28, 0.8, 0.43, 389, 0.8, 0.5],
  [39, 3.7, 1.19, 344, 0.77, 2.9],
  [112, -4.3, 0.57, 249, 0.68, -0.5],
  [39, -9.5, 0.83, 346, 0.49, -1.3],
  [32, 9.7, 0.5, 416, 0.5, 4.3],
  [72, -19.5, 0.89, 374, 0.49, -2.7],
  [111, -13.4, 0.58, 170, 0.71, -2.5],
  [74, 17.6, 0.4, 25, 0.58, 0.8],
  [105, 29.4, 0.64, 37, 0.57, 1.3],
  [68, -2.7, 0.54, 67, 0.79, -2.4],
  [67, -14.5, 0.84, 176, 0.76, -0.4],
  [59, 23.0, 0.77, 338, 0.77, 1.4],
  [45, -5.5, 1.04, 420, 0.76, -2.9],
  [71, -7.9, 0.94, 33, 0.51, -2.1],
  [97, -33.1, 0.63, 409, 0.52, -4.9],
  [89, -35.0, 0.83, 347, 0.73, -0.6],
  [34, -17.0, 0.55, 168, 0.89, -3.5],
  [39, -3.7, 1.28, 373, 0.77, -2.9],
  [111, 4.8, 0.35, 388, 0.72, 1.7],
  [52, 22.9, 1.03, 161, 0.67, 2.2],
  [46, -19.0, 0.5, 99, 0.81, -0.4],
  [98, -18.1, 0.58, 242, 0.79, -4.4],
  [98, -8.5, 0.82, 291, 0.49, -0.7],
  [66, -4.9, 1.1, 156, 0.67, -0.5],
  [108, -39.5, 0.66, 303, 0.68, -0.4],
  [112, -8.5, 0.34, 301, 0.47, -6.3],
  [108, -24.9, 0.79, 27, 0.69, -1.1],
  [74, -20.5, 0.68, 82, 0.73, -2.0],
  [113, -27.2, 0.56, 290, 0.55, -1.6],
  [67, -20.5, 0.54, 333, 0.63, -1.8],
  [99, 9.5, 0.91, 303, 0.68, 0.8],
  [65, -3.6, 0.95, 243, 0.69, -1.3],
  [74, -17.6, 0.45, 37, 0.58, -0.8],
  [48, -14.7, 0.7, 63, 0.79, -0.8],
  [102, 7.6, 0.47, 157, 0.87, 6.1],
  [46, -15.1, 0.56, 166, 0.54, -1.5],
  [68, -18.0, 0.51, 98, 0.51, -1.1],
  [36, -20.0, 0.79, 209, 0.7, -6.5],
  [106, 10.2, 0.51, 296, 0.7, 0.1],
  [29, -7.5, 0.68, 197, 0.77, -3.3],
  [105, -3.6, 0.51, 356, 0.53, -0.9],
  [41, 11.9, 0.51, 113, 0.6, 1.2],
  [74, -19.8, 0.47, 341, 0.52, -1.9],
  [31, -4.6, 1.01, 402, 0.85, -2.8],
  [96, 7.3, 0.95, 202, 0.71, 1.4],
  [63, 7.9, 1.05, 49, 0.64, 0.5],
  [82, -36.6, 0.77, 307, 0.75, -2.9],
  [47, -0.8, 1.38, 139, 0.83, -0.6],
  [87, -9.1, 0.66, 420, 0.67, -4.1],
  [66, 4.9, 1.11, 146, 0.67, 0.5],
  [45, 5.5, 1.21, 415, 0.76, 2.9],
  [29, 7.5, 0.66, 195, 0.77, 3.3],
  [93, 1.8, 0.78, 196, 0.57, 1.7],
  [98, 18.1, 0.57, 217, 0.79, 4.4],
  [32, 12.1, 1.12, 247, 0.67, 2.6],
  [46, -21.9, 0.7, 152, 0.63, -3.4],
  [103, -33.0, 0.39, 297, 0.69, -0.9],
  [47, 0.8, 1.24, 132, 0.83, 0.6],
  [65, 3.6, 0.94, 226, 0.69, 1.3],
  [108, 24.9, 0.7, 22, 0.69, 1.1],
  [102, -18.1, 0.39, 179, 0.53, -1.4],
  [105, 5.1, 0.6, 368, 0.73, 0.6],
  [112, 4.3, 0.55, 246, 0.68, 0.5],
  [48, -8.9, 0.44, 252, 0.89, -0.3],
  [78, -9.6, 0.87, 206, 0.47, -2.1],
  [39, 20.7, 0.88, 16, 0.48, 5.4],
  [46, 21.9, 0.66, 142, 0.63, 3.4],
  [47, 15.3, 0.79, 273, 0.82, 6.0],
  [36, 1.1, 0.89, 237, 0.64, 0.8],
  [56, 3.8, 0.97, 225, 0.62, 3.7],
  [58, -12.1, 1.01, 147, 0.57, -0.2],
  [37, 8.9, 0.99, 366, 0.61, 1.7],
  [82, 36.6, 0.77, 293, 0.75, 2.9],
  [31, -4.4, 0.42, 78, 0.71, -2.0],
  [66, -20.3, 0.45, 250, 0.57, -0.9],
  [39, -20.7, 0.86, 42, 0.48, -5.4],
];

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
    // first paint (and the CSS schedule) began, give or take a frame. So
    // the wait is "whatever is left of the hold", or nothing if hydration
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
      {/* The lockup is the pump head: word and nozzle press down together
          at 800ms and spring back. The mist SVG hangs off the right edge
          of the word, its nozzle (cx 2, cy 60 ± the slit offset) sitting
          on the x-height line, so the cone is centered on the letters,
          not the em box. */}
      <div className="launch-screen__lockup">
        {/* Playfair wordmark, lowercase, as in the nav brand and the Figma
            launch frame (node 339-12380). */}
        <span className="launch-screen__word font-display">spritz</span>
        <svg
          className="launch-screen__mist"
          viewBox="0 0 120 120"
          xmlns="http://www.w3.org/2000/svg"
          focusable="false"
        >
          {MIST.map(([dx, dy, r, lag, op, sy], i) => (
            <circle
              key={i}
              className="launch-screen__drop"
              cx="2"
              cy={60 + sy}
              r={r}
              style={
                {
                  "--dx": `${dx}px`,
                  "--dy": `${dy}px`,
                  "--lag": `${lag}ms`,
                  "--op": op,
                } as React.CSSProperties
              }
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

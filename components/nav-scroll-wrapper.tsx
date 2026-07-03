"use client";

// NavScrollWrapper — classic mobile hide-on-scroll behavior for the
// top nav. Scroll down: nav slides up out of sight. Scroll up: nav
// slides back down immediately.
//
// Mechanics: sticky at top:0 (owns the sticky position so the LiquidGlass
// nav + NavSearch don't need their own). Tracks scroll direction on the
// window; toggles a translateY(-100%) transform when scrolling down and
// releases it when scrolling up. Transform-only animation runs on the
// GPU compositor — no layout thrash, no jitter.
//
// Direction detection is thresholded so tiny wiggles (thumb tremors,
// bounce at the top of iOS Safari's rubber band) don't retrigger the
// hide/show. HIDE_THRESHOLD keeps the nav pinned when the user's near
// the top of the page — nothing to hide from.

import { useEffect, useRef, useState, type ReactNode } from "react";

// Minimum scroll position (in px) before hiding kicks in at all. Below
// this, the nav is always visible — feels natural because there's
// nothing above the nav to scroll TO yet.
const HIDE_THRESHOLD_PX = 100;

// Minimum scroll delta (in px) between scroll events to consider it a
// direction change. Filters out tremor and iOS rubber-band bounce.
const DIRECTION_DELTA_PX = 5;

export function NavScrollWrapper({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    lastScrollY.current = window.scrollY;

    function onScroll() {
      // rAF throttle — one state update per frame max, no matter how
      // fast the browser dispatches scroll events.
      if (ticking.current) return;
      ticking.current = true;

      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastScrollY.current;

        if (y < HIDE_THRESHOLD_PX) {
          // Near the top — always show, regardless of direction.
          setHidden(false);
        } else if (delta > DIRECTION_DELTA_PX) {
          // Scrolling down past the threshold — hide.
          setHidden(true);
        } else if (delta < -DIRECTION_DELTA_PX) {
          // Scrolling up — show immediately.
          setHidden(false);
        }
        // Otherwise (tiny delta) — hold the current state so tremor
        // doesn't flicker.

        lastScrollY.current = y;
        ticking.current = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        transform: hidden ? "translateY(-100%)" : "translateY(0)",
        // ease-out-quart — quick start, hard decel into place. Same curve
        // used by the page-transition animation for consistent motion feel
        // across the app.
        transition: "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
        // Promote to its own compositor layer so the transform doesn't
        // repaint the LiquidGlass filters underneath every frame.
        willChange: "transform",
      }}
    >
      {children}
    </div>
  );
}

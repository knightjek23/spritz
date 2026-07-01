"use client";

// PageTransition — wraps <main> children so non-tab route changes fade
// + slide in from the right, iOS-app style. Tab-root ↔ tab-root
// switches stay instant (no re-triggering the animation every time
// the user taps between Home / Shelf / Encyclopedia / Profile).
//
// Mechanism: key={pathname} on non-tab routes forces React to unmount
// the previous subtree and mount a fresh one, which re-runs the CSS
// animation defined on the child div. Tab routes share a stable key
// ("tab") so React doesn't remount when switching between them.
//
// Simpler than AnimatePresence / Framer Motion (zero dependencies)
// but only animates the incoming page — the outgoing one just
// disappears. For most mobile flows this reads as smooth because the
// nav pill stays static and only the content area animates. If we
// later want true iOS-style bidirectional slides (outgoing page also
// animates), the fix is either View Transitions API (Chromium + Safari
// 18+) or Framer Motion's AnimatePresence + custom direction detection.
//
// Reduced-motion users skip the animation entirely (globals.css
// @media rule).

import { usePathname } from "next/navigation";

const TAB_ROOTS = new Set(["/", "/collection", "/scan", "/encyclopedia", "/account"]);

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const isTabRoot = TAB_ROOTS.has(pathname);

  // Tab routes share a single key ("tab") so switching between them
  // doesn't remount the subtree (preserves state, no reflow). Non-tab
  // routes get keyed by pathname so each unique sub-route gets a
  // fresh mount + animation.
  const key = isTabRoot ? "tab" : pathname;

  return (
    <div key={key} className={isTabRoot ? undefined : "animate-page-slide-in"}>
      {children}
    </div>
  );
}

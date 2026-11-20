"use client";

// Records where you are in each tab and puts you back there after a tab
// switch. Mounted once in the root layout; renders nothing. The bottom
// nav decides where a tap goes (lib/tab-memory.ts); this component
// remembers URLs and scroll positions as you browse and restores the
// scroll when a tab-switch navigation lands.
//
// Restoring is retried for a moment: a page can still be growing when it
// arrives (the For You feed, the Shelf grid and "See more" rows fill in
// on the client), so jumping straight to y = 2400 on a page that is only
// 1200 tall would stop short. It keeps nudging until the page is tall
// enough or 2.5 s pass, and gives up the moment you touch or scroll, so
// it never fights you.

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  currentUrl,
  rememberScroll,
  rememberUrl,
  savedScroll,
  takeTabNavigation,
} from "@/lib/tab-memory";

const RESTORE_WINDOW_MS = 2500;
const RETRY_MS = 60;
/** Page height must hold still this long before the restore lets go. */
const SETTLE_MS = 350;

export function TabMemory() {
  const pathname = usePathname();
  // While a restore is running, scroll events are ours, not the
  // person's, and must not overwrite the position being restored.
  const restoring = useRef(false);

  // Remember scroll (and the URL, which also catches ?query changes that
  // do not change the pathname) as the person scrolls. One write per
  // frame at most.
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (restoring.current) return;
        const url = currentUrl();
        rememberScroll(url, window.scrollY);
        rememberUrl(url);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // On every arrival: remember the URL for its tab, and if a bottom-nav
  // tap sent us here, restore its scroll (or start at the top).
  useEffect(() => {
    const url = currentUrl();
    rememberUrl(url);
    const pending = takeTabNavigation();
    if (!pending || pending.target !== url) return;

    const target = pending.mode === "restore" ? savedScroll(url) ?? 0 : 0;
    if (target <= 0) {
      window.scrollTo(0, 0);
      return;
    }

    // Restore and hold. The target position is re-applied every frame-ish
    // while the page is still settling: pages like a fragrance detail
    // fill in several sections after they appear (community take, layer
    // it, cost-effective, perfumer), and each one moves everything below
    // it. Stopping the moment the page was merely tall enough (the old
    // behaviour) left you mid-page on half-loaded content that then
    // jumped. Now it holds the position until the page height has been
    // steady for SETTLE_MS, gives up after RESTORE_WINDOW_MS, and stops
    // the instant you touch or scroll so it never fights you.
    restoring.current = true;
    const html = document.documentElement;
    html.dataset.tabRestore = "1";
    let cancelled = false;
    let timer = 0;
    let lastHeight = -1;
    let steadySince = performance.now();
    const stop = () => {
      cancelled = true;
    };
    window.addEventListener("touchstart", stop, { once: true, passive: true });
    window.addEventListener("wheel", stop, { once: true, passive: true });
    const started = performance.now();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      restoring.current = false;
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("wheel", stop);
      // Let the last programmatic scroll event pass before the nav goes
      // back to reacting to scrolls.
      window.setTimeout(() => {
        delete html.dataset.tabRestore;
      }, 120);
    };
    const tick = () => {
      if (cancelled) return finish();
      const now = performance.now();
      const height = document.documentElement.scrollHeight;
      if (height !== lastHeight) {
        lastHeight = height;
        steadySince = now;
      }
      const max = height - window.innerHeight;
      window.scrollTo(0, Math.min(target, Math.max(0, max)));
      const reached = max >= target - 1;
      const steady = now - steadySince >= SETTLE_MS;
      if ((reached && steady) || now - started > RESTORE_WINDOW_MS) return finish();
      timer = window.setTimeout(tick, RETRY_MS);
    };
    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      finish();
    };
  }, [pathname]);

  return null;
}

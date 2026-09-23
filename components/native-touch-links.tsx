"use client";

// Long-press handling for links inside the native shell.
//
// Problem: WKWebView shows a link preview (title + domain bubble, then
// Open Link / Copy Link / Share) when a finger rests on any <a href>. The
// CSS -webkit-touch-callout rule does not stop it; it is the web view's
// own allowsLinkPreview behaviour (capacitor.config.ts turns that off
// for build 4 and later). This component makes every installed build
// behave the same way, web-side:
//
//   1. On touchstart inside a link, stash the href and remove the
//      attribute. WKWebView only previews elements that carry an href,
//      so the bubble cannot appear while the finger is down. Next's
//      <Link> navigates from its props, not the attribute, so a normal
//      tap still goes through the normal click.
//   2. On touchend / touchcancel, put the href back.
//   3. If the finger stays down LONG_PRESS_MS without moving more than
//      MOVE_TOLERANCE px, treat the hold as a tap: navigate to the href
//      and swallow the click that follows. Holding a card by accident
//      lands on the card's page instead of doing nothing.
//
// Document-level, so every card in the app is covered (shelf, library,
// search, house, trending) without touching each component. Skipped for
// anything inside a button (the kebab menus), form controls, and any
// element with data-no-longpress. Renders nothing; no-op on the web.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isNativeApp } from "@/lib/native";

const LONG_PRESS_MS = 400;
const MOVE_TOLERANCE = 10;

export function NativeTouchLinks() {
  const router = useRouter();

  useEffect(() => {
    if (!isNativeApp()) return;

    let link: HTMLAnchorElement | null = null;
    let href: string | null = null;
    let startX = 0;
    let startY = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let fired = false;

    function restore() {
      if (link && href !== null && !link.hasAttribute("href")) {
        link.setAttribute("href", href);
      }
    }

    function reset() {
      if (timer) clearTimeout(timer);
      timer = null;
      restore();
      link = null;
      href = null;
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const target = e.target as Element | null;
      if (!target) return;
      // Controls inside a card (kebab menu, buttons) keep their own
      // behaviour; so does anything opted out explicitly.
      if (target.closest("button, input, textarea, select, [data-no-longpress]")) return;
      const a = target.closest("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const raw = a.getAttribute("href");
      if (!raw || raw.startsWith("#")) return;

      fired = false;
      link = a;
      href = raw;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      // No href while the finger is down: nothing for WKWebView to preview.
      a.removeAttribute("href");

      timer = setTimeout(() => {
        timer = null;
        if (!link || href === null) return;
        fired = true;
        const dest = href;
        const external = /^[a-z]+:/i.test(dest) && !dest.startsWith(location.origin);
        const newTab = link.getAttribute("target") === "_blank";
        restore();
        if (external || newTab) {
          window.open(dest, newTab ? "_blank" : "_self");
        } else {
          router.push(dest);
        }
      }, LONG_PRESS_MS);
    }

    function onTouchMove(e: TouchEvent) {
      if (!link || !timer) return;
      const t = e.touches[0];
      if (
        Math.abs(t.clientX - startX) > MOVE_TOLERANCE ||
        Math.abs(t.clientY - startY) > MOVE_TOLERANCE
      ) {
        // A scroll, not a hold. Put the href back so the click (if any)
        // behaves normally, and stop the long-press timer.
        reset();
      }
    }

    function onTouchEnd() {
      // Short tap: href is restored before the click event fires, so
      // Next's <Link> handles it as usual. After a fired long press,
      // onClick below swallows the synthetic click.
      reset();
    }

    function onClick(e: MouseEvent) {
      if (fired) {
        fired = false;
        e.preventDefault();
        e.stopPropagation();
      }
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });
    document.addEventListener("click", onClick, true);
    return () => {
      reset();
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
      document.removeEventListener("click", onClick, true);
    };
  }, [router]);

  return null;
}

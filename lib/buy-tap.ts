"use client";

// Record a real Buy tap. Every Buy link in the app points at
// /api/buy/<id>[?retailer=X]; call this from that link's onClick (or just
// before navigating to it) and it:
//   - logs the tap to affiliate_clicks via POST /api/buy/<id>/click, sent
//     with navigator.sendBeacon so it survives the page navigating away;
//   - sends `buy_clicked` to PostHog, so buy taps can finally be compared
//     with what the affiliate networks report.
// The redirect itself no longer logs anything (see app/api/buy/[id]).
// Never throws: logging must not get in the way of the purchase.

import { track } from "@/lib/analytics";

export function logBuyTap(href: string, source: string) {
  try {
    const u = new URL(href, window.location.origin);
    const m = u.pathname.match(/^\/api\/buy\/([^/]+)\/?$/);
    if (!m) return;
    const id = m[1];
    const retailer = u.searchParams.get("retailer");
    const endpoint =
      `/api/buy/${id}/click` + (retailer ? `?retailer=${encodeURIComponent(retailer)}` : "");
    const sent =
      typeof navigator.sendBeacon === "function" && navigator.sendBeacon(endpoint);
    if (!sent) {
      void fetch(endpoint, { method: "POST", keepalive: true }).catch(() => {});
    }
    track("buy_clicked", { fragrance_id: id, retailer: retailer ?? "default", source });
  } catch {
    // ignore
  }
}

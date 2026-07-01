"use client";

// NavBrand — the left slot of the top nav. On tab-root routes (Home,
// Shelf, Scan, Encyclopedia, Profile) shows the "spritz" wordmark.
// On any other route, shows a back button that goes to the previous
// screen via browser history, or falls back to a per-route parent.
//
// Client component so it can read the pathname; wraps the decision
// so the parent Nav.tsx stays a Server Component (Clerk's SignedIn/
// SignedOut/UserButton work best rendered server-side).
//
// Fallback map: when a user direct-links into a sub-route (share URL,
// refresh, external nav), window.history has no prior entry and
// router.back() would no-op. The fallback routes them to the most
// natural parent so back is never a dead click.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BackButton } from "./back-button";

// Tab-root routes — the five destinations the bottom nav switches
// between. On these, back is meaningless; show the wordmark instead.
const TAB_ROOTS = new Set(["/", "/collection", "/scan", "/encyclopedia", "/account"]);

/**
 * Per-route back fallback. When a user direct-links into a page and
 * taps back, we can't send them "back" (no history), so we send them
 * to the most logical parent. Ordered by longest-prefix wins — see
 * fallbackFor() below.
 */
const FALLBACK_MAP: Array<[prefix: string, href: string]> = [
  ["/fragrance/", "/encyclopedia"],
  ["/family/", "/families"],
  ["/families", "/encyclopedia"],
  ["/house/", "/houses"],
  ["/houses", "/encyclopedia"],
  ["/note/", "/notes"],
  ["/notes", "/encyclopedia"],
  ["/search", "/encyclopedia"],
  ["/pricing", "/account"],
  ["/welcome", "/"],
  ["/sign-in", "/"],
  ["/sign-up", "/"],
];

function fallbackFor(pathname: string): string {
  // Longest-prefix match — matters when routes share a prefix (e.g.
  // /note/ and /notes should map differently).
  const match = FALLBACK_MAP.filter(([prefix]) => pathname.startsWith(prefix)).sort(
    (a, b) => b[0].length - a[0].length,
  )[0];
  return match?.[1] ?? "/";
}

export function NavBrand() {
  const pathname = usePathname() ?? "/";

  if (TAB_ROOTS.has(pathname)) {
    return (
      <Link href="/" className="font-display text-2xl tracking-tight text-ink">
        spritz
      </Link>
    );
  }

  return <BackButton fallbackHref={fallbackFor(pathname)} />;
}

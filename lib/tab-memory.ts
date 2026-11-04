// Tab memory — each bottom-nav tab keeps its place, iOS style.
//
// Browse the Library down to Creed → Aventus, scroll halfway, tap Home,
// tap Library again: you land back on Aventus at the same scroll, not on
// the Library hub at the top. Tapping the tab you are already in pops it
// back to its root (and scrolls to the top if you are already there),
// which is the iOS tab-bar convention for "take me home in this tab".
//
// What is remembered, per browser tab session (sessionStorage, so a cold
// launch starts fresh and nothing outlives the app process):
//   - the last URL visited inside each tab (path + query, so a Library
//     search or a Shelf sub-tab comes back too)
//   - the scroll position of every URL, so the restored page lands where
//     you left it
// BrowseList keeps its own "See more" rows next to these (see
// components/browse-list.tsx) so a restored note page is long enough to
// scroll back to row 180.
//
// Client-only. Every function no-ops on the server and swallows storage
// errors (private mode, quota): memory is a convenience, never state.

/** Tab root → the routes that live under it. Single source of truth:
 *  components/bottom-nav.tsx reads this for its active state too. "/" is
 *  special and only matches itself, or every page would be Home. */
export const TAB_PREFIXES: Record<string, string[]> = {
  "/": ["/"],
  "/collection": ["/collection"],
  "/scan": ["/scan"],
  "/library": [
    "/library",
    "/families",
    "/family",
    "/houses",
    "/house",
    "/notes",
    "/note",
    "/perfumers",
    "/perfumer",
    "/fragrance",
    "/search",
  ],
  "/account": ["/account", "/welcome", "/pricing"],
};

/** Which tab a pathname belongs to, or null (sign-in, legal, …). */
export function tabForPath(pathname: string): string | null {
  if (pathname === "/") return "/";
  for (const [root, prefixes] of Object.entries(TAB_PREFIXES)) {
    if (root === "/") continue;
    if (
      prefixes.some(
        (p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"),
      )
    ) {
      return root;
    }
  }
  return null;
}

const LAST_KEY = "spritz.tabs.last";
const SCROLL_KEY = "spritz.tabs.scroll";
const PENDING_KEY = "spritz.tabs.restore";
/** Cap on remembered scroll positions; oldest go first. */
const MAX_SCROLLS = 60;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / quota. Tabs just start fresh.
  }
}

export function currentUrl(): string {
  return window.location.pathname + window.location.search;
}

/** Last URL visited inside a tab, or the tab root. */
export function lastUrlForTab(root: string): string {
  const last = read<Record<string, string>>(LAST_KEY, {});
  const url = last[root];
  // Only trust a remembered URL that still belongs to this tab.
  return url && tabForPath(url.split("?")[0]) === root ? url : root;
}

export function rememberUrl(url: string) {
  const root = tabForPath(url.split("?")[0]);
  if (!root) return;
  const last = read<Record<string, string>>(LAST_KEY, {});
  if (last[root] === url) return;
  last[root] = url;
  write(LAST_KEY, last);
}

/** Pop a tab back to its root: forget where it was. */
export function forgetTab(root: string) {
  const last = read<Record<string, string>>(LAST_KEY, {});
  delete last[root];
  write(LAST_KEY, last);
}

export function rememberScroll(url: string, y: number) {
  const scrolls = read<Array<[string, number]>>(SCROLL_KEY, []).filter(([u]) => u !== url);
  scrolls.push([url, Math.max(0, Math.round(y))]);
  write(SCROLL_KEY, scrolls.slice(-MAX_SCROLLS));
}

export function savedScroll(url: string): number | null {
  const hit = read<Array<[string, number]>>(SCROLL_KEY, []).find(([u]) => u === url);
  return hit ? hit[1] : null;
}

/** Set by a bottom-nav tap: the next page to arrive should restore its
 *  scroll ("restore") or start at the top ("top"). Anything else (a link
 *  inside a page, back/forward) is left to the router as before. */
export function markTabNavigation(target: string, mode: "restore" | "top") {
  write(PENDING_KEY, { target, mode });
}

export function takeTabNavigation(): { target: string; mode: "restore" | "top" } | null {
  const pending = read<{ target: string; mode: "restore" | "top" } | null>(PENDING_KEY, null);
  if (pending) {
    try {
      window.sessionStorage.removeItem(PENDING_KEY);
    } catch {
      // ignore
    }
  }
  return pending;
}

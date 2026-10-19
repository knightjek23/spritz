// Recent searches — a short, per-device list of what the user typed into
// search, shown under the nav field when it is focused and empty
// (the Gmail pattern). Stored in localStorage: no account required, no
// server round trip, nothing new for the privacy declarations. Cleared
// with the site data; never synced between devices.

const KEY = "spritz.recentSearches";
export const MAX_RECENT_SEARCHES = 8;

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function write(list: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Private mode / quota — recents are a convenience, not state we rely on.
  }
}

export function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  return read();
}

/** Most recent first; case-insensitive de-dupe so "Dior" and "dior" are one entry. */
export function addRecentSearch(query: string): string[] {
  const q = query.trim();
  if (!q) return getRecentSearches();
  const next = [q, ...read().filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(
    0,
    MAX_RECENT_SEARCHES,
  );
  write(next);
  return next;
}

export function removeRecentSearch(query: string): string[] {
  const next = read().filter((s) => s !== query);
  write(next);
  return next;
}

export function clearRecentSearches(): string[] {
  write([]);
  return [];
}

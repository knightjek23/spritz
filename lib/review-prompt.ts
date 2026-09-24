// In-app review prompt (App Store / Play rating sheet).
//
// The system sheet is requested through @capacitor-community/in-app-review
// after a user has just had a win: their 3rd successful scan, their 2nd
// shelf save, or their 5th fragrance page. Whichever milestone lands first
// asks; the round then resets so the next ask needs a fresh milestone.
//
// Guards, from Apple's guidance and common practice (docs/build/build-log
// 2026-09-24): native shell on a build that ships the plugin; installed at
// least MIN_INSTALL_DAYS ago; used on at least MIN_DISTINCT_DAYS separate
// days; not right after a scan miss; no ask in the last COOLDOWN_DAYS; at
// most MAX_PER_YEAR asks in 365 days (Apple shows the sheet at most 3 times
// a year regardless, and gives no callback, so the local count is the only
// way not to spend those blindly). The ask itself is deferred a beat after
// the fragrance page settles so it never interrupts a flow.
//
// State is per device in localStorage (the shell's web view keeps it across
// app updates; a reinstall starts over). Everything is a no-op on the web.

import { isNativeApp, nativePlatform } from "@/lib/native";

const KEY = "spritz.review.v1";

/** First shell build that includes the in-app-review plugin. */
const MIN_BUILD: Record<"ios" | "android", number> = { ios: 4, android: 3 };

export const MILESTONES = { scans: 3, shelfAdds: 2, lookups: 5 } as const;
const MIN_INSTALL_DAYS = 3;
const MIN_DISTINCT_DAYS = 2;
const COOLDOWN_DAYS = 60;
const MAX_PER_YEAR = 3;
const SETTLE_MS = 1500;

const DAY = 24 * 60 * 60 * 1000;

interface ReviewState {
  firstSeen: number;
  /** YYYY-MM-DD strings, capped at MIN_DISTINCT_DAYS entries (only the count matters). */
  days: string[];
  scans: number;
  shelfAdds: number;
  lookups: number;
  lastScanMissed: boolean;
  /** Timestamps of asks, newest last, trimmed to the last 365 days. */
  asks: number[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function read(): ReviewState {
  const fresh: ReviewState = {
    firstSeen: Date.now(),
    days: [],
    scans: 0,
    shelfAdds: 0,
    lookups: 0,
    lastScanMissed: false,
    asks: [],
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh;
    const parsed = JSON.parse(raw) as Partial<ReviewState>;
    return { ...fresh, ...parsed };
  } catch {
    return fresh;
  }
}

function write(s: ReviewState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode or full: the prompt just never fires */
  }
}

/** Called once per page load from the bridge; records install date and active days. */
export function touchReviewSession(): void {
  if (!isNativeApp()) return;
  const s = read();
  const d = today();
  if (!s.days.includes(d)) {
    s.days = [...s.days, d].slice(-MIN_DISTINCT_DAYS);
  }
  write(s);
}

export function recordScan(matched: boolean): void {
  if (!isNativeApp()) return;
  const s = read();
  s.lastScanMissed = !matched;
  if (matched) s.scans += 1;
  write(s);
}

export function recordShelfAdd(): void {
  if (!isNativeApp()) return;
  const s = read();
  s.shelfAdds += 1;
  write(s);
}

export function recordLookup(): void {
  if (!isNativeApp()) return;
  const s = read();
  s.lookups += 1;
  write(s);
}

let buildOk: boolean | null = null;

async function pluginAvailable(): Promise<boolean> {
  if (!isNativeApp()) return false;
  if (buildOk !== null) return buildOk;
  const platform = nativePlatform();
  if (platform === "web") return (buildOk = false);
  try {
    const { App } = await import("@capacitor/app");
    const { build } = await App.getInfo();
    buildOk = Number.parseInt(build, 10) >= MIN_BUILD[platform];
  } catch {
    buildOk = false;
  }
  return buildOk;
}

function milestoneHit(s: ReviewState): boolean {
  return (
    s.scans >= MILESTONES.scans ||
    s.shelfAdds >= MILESTONES.shelfAdds ||
    s.lookups >= MILESTONES.lookups
  );
}

function guardsPass(s: ReviewState, now: number): boolean {
  if (now - s.firstSeen < MIN_INSTALL_DAYS * DAY) return false;
  if (s.days.length < MIN_DISTINCT_DAYS) return false;
  if (s.lastScanMissed) return false;
  const recent = s.asks.filter((t) => now - t < 365 * DAY);
  if (recent.length >= MAX_PER_YEAR) return false;
  const last = recent[recent.length - 1];
  if (last !== undefined && now - last < COOLDOWN_DAYS * DAY) return false;
  return true;
}

/**
 * Ask for a review if a milestone has been reached and every guard passes.
 * Call from a settled screen (the fragrance page), never mid-flow. Returns
 * true when the system sheet was requested (iOS may still decide not to
 * show it; there is no way to know).
 */
export async function maybeRequestReview(): Promise<boolean> {
  if (!isNativeApp()) return false;
  const s = read();
  const now = Date.now();
  if (!milestoneHit(s) || !guardsPass(s, now)) return false;
  if (!(await pluginAvailable())) return false;

  await new Promise((r) => setTimeout(r, SETTLE_MS));
  // Re-read: another tab or a fast second navigation may have asked already.
  const latest = read();
  if (!guardsPass(latest, Date.now())) return false;

  try {
    const { InAppReview } = await import("@capacitor-community/in-app-review");
    await InAppReview.requestReview();
  } catch (e) {
    console.warn("[review] requestReview failed", e);
    return false;
  }
  latest.asks = [...latest.asks.filter((t) => Date.now() - t < 365 * DAY), Date.now()];
  latest.scans = 0;
  latest.shelfAdds = 0;
  latest.lookups = 0;
  write(latest);
  return true;
}

/** Store page deep link that opens straight on the review form. */
export function writeReviewUrl(): string {
  return nativePlatform() === "android"
    ? "https://play.google.com/store/apps/details?id=app.spritzofficial&showAllReviews=true"
    : "https://apps.apple.com/app/id6807149616?action=write-review";
}

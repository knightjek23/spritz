// Unit tests for the paywall trigger rules: `npm run test:paywall`.
// Pure functions only. Spec: claude/spritz-paywall-build-spec.md (D39).

import assert from "node:assert/strict";
import {
  SESSION_GAP_MS,
  WEEK_MS,
  decide,
  drawVariant,
  effectiveVariant,
  isBlockedPath,
  isFragrancePath,
  markShown,
  newState,
  observe,
  type PaywallState,
} from "../lib/paywall-triggers";

let pass = 0;
function ok(name: string) {
  pass++;
  console.log(`  ok  ${name}`);
}

const T0 = Date.UTC(2026, 10, 10, 18, 0, 0);
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

/** Walk a state through one route change. */
function go(s: PaywallState, pathname: string, now: number, native = true): PaywallState {
  return observe(s, { pathname, now, native });
}

// ---- Paths ----
{
  assert.equal(isFragrancePath("/fragrance/123"), true);
  assert.equal(isFragrancePath("/fragrance/123/"), true);
  assert.equal(isFragrancePath("/fragrance"), false);
  assert.equal(isFragrancePath("/fragrance/123/reviews"), false);
  assert.equal(isBlockedPath("/pricing"), true);
  assert.equal(isBlockedPath("/sign-in/factor-one"), true);
  assert.equal(isBlockedPath("/scan"), true);
  assert.equal(isBlockedPath("/scanner"), false);
  assert.equal(isBlockedPath("/library"), false);
  ok("path helpers");
}

// ---- Variant ----
{
  assert.equal(drawVariant(0), "intro_sheet");
  assert.equal(drawVariant(0.49), "intro_sheet");
  assert.equal(drawVariant(0.5), "one_screen");
  const s = newState(T0, "one_screen");
  assert.equal(effectiveVariant(s, undefined), "intro_sheet");
  assert.equal(effectiveVariant(s, "on"), "one_screen");
  assert.equal(effectiveVariant(s, "intro_sheet"), "intro_sheet");
  assert.equal(effectiveVariant(newState(T0, "intro_sheet"), "one_screen"), "one_screen");
  ok("variant draw and env switch");
}

// ---- First fragrance: fires on the navigation after the first fragrance page ----
{
  let s = newState(T0, "intro_sheet");
  s = go(s, "/", T0);
  assert.equal(decide(s, "/"), null);
  s = go(s, "/fragrance/42", T0 + MIN);
  assert.equal(decide(s, "/fragrance/42"), null, "not while still on that page");
  s = go(s, "/fragrance/43", T0 + 2 * MIN);
  assert.equal(decide(s, "/fragrance/43"), "first_fragrance", "another fragrance page counts as leaving");
  s = markShown(s, "first_fragrance", T0 + 2 * MIN);
  s = go(s, "/search", T0 + 3 * MIN);
  assert.equal(decide(s, "/search"), null, "once per device");
  ok("first fragrance fires once, on leaving");
}

// ---- First fragrance waits out blocked pages without being used up ----
{
  let s = newState(T0, "intro_sheet");
  s = go(s, "/fragrance/42", T0);
  s = go(s, "/sign-in", T0 + MIN);
  assert.equal(decide(s, "/sign-in"), null);
  s = go(s, "/pricing", T0 + 2 * MIN);
  assert.equal(decide(s, "/pricing"), null);
  s = go(s, "/", T0 + 3 * MIN);
  assert.equal(decide(s, "/"), "first_fragrance");
  ok("blocked pages defer the trigger");
}

// ---- Shelf / Library: first visit, and one paywall per session ----
{
  let s = newState(T0, "intro_sheet");
  s = go(s, "/library", T0);
  assert.equal(decide(s, "/library"), "shelf_library");
  s = markShown(s, "shelf_library", T0);
  s = go(s, "/collection", T0 + MIN);
  assert.equal(decide(s, "/collection"), null, "the other tab never shows it again");
  ok("shelf or library fires once");

  let t = newState(T0, "intro_sheet");
  t = go(t, "/fragrance/42", T0);
  t = go(t, "/library", T0 + MIN);
  assert.equal(decide(t, "/library"), "first_fragrance", "first fragrance wins the tie");
  t = markShown(t, "first_fragrance", T0 + MIN);
  t = go(t, "/collection", T0 + 2 * MIN);
  assert.equal(decide(t, "/collection"), null, "one paywall per session");
  t = go(t, "/collection", T0 + 2 * MIN + SESSION_GAP_MS);
  assert.equal(decide(t, "/collection"), "shelf_library", "shelf show waits for the next session");
  ok("one paywall per session");
}

// ---- Weekly: native only, never first session, 7 days since the last show ----
{
  let s = newState(T0, "intro_sheet");
  s = go(s, "/library", T0);
  s = markShown(s, "shelf_library", T0);
  s = go(s, "/", T0 + 6 * DAY);
  assert.equal(s.sessions, 2);
  assert.equal(decide(s, "/"), null, "6 days is too soon");
}
{
  let s = newState(T0, "intro_sheet");
  s = go(s, "/library", T0);
  s = markShown(s, "shelf_library", T0);
  s = go(s, "/scan", T0 + WEEK_MS);
  assert.equal(decide(s, "/scan"), null, "never over the camera");
  s = go(s, "/", T0 + WEEK_MS + MIN);
  assert.equal(decide(s, "/"), "weekly_open", "shows on the next allowed page of that session");
  s = markShown(s, "weekly_open", T0 + WEEK_MS + MIN);
  s = go(s, "/search", T0 + WEEK_MS + 2 * MIN);
  assert.equal(decide(s, "/search"), null);
  s = go(s, "/", T0 + WEEK_MS + 3 * DAY);
  assert.equal(decide(s, "/"), null, "3 days after a weekly show");
  s = go(s, "/", T0 + 2 * WEEK_MS + 2 * MIN);
  assert.equal(decide(s, "/"), "weekly_open", "and again a week later");
  ok("weekly paywall on app open");

  let web = newState(T0, "intro_sheet");
  web = go(web, "/", T0, false);
  web = go(web, "/", T0 + 8 * DAY, false);
  assert.equal(decide(web, "/"), null);
  ok("weekly is native only");

  let first = newState(T0, "intro_sheet");
  first = go(first, "/", T0 + 8 * DAY);
  assert.equal(first.sessions, 1);
  assert.equal(decide(first, "/"), null);
  ok("weekly never fires in the first session");

  // No paywall ever shown: measured from first seen.
  let quiet = newState(T0, "intro_sheet");
  quiet = go(quiet, "/", T0);
  quiet = go(quiet, "/", T0 + 8 * DAY);
  assert.equal(decide(quiet, "/"), "weekly_open");
  ok("weekly counts from first seen when nothing has shown");

  // Becoming due mid-session doesn't interrupt: only a session start arms it.
  let mid = newState(T0, "intro_sheet");
  mid = go(mid, "/", T0);
  mid = go(mid, "/", T0 + WEEK_MS - MIN);
  assert.equal(mid.sessions, 2);
  mid = go(mid, "/search", T0 + WEEK_MS + MIN);
  assert.equal(mid.sessions, 2);
  assert.equal(decide(mid, "/search"), null);
  ok("weekly is decided at session start");
}

// ---- Migration from the old intro-sheet record ----
{
  const seen = newState(T0, "intro_sheet", { shows: 1, dismissedAt: T0 - 3 * DAY });
  assert.equal(seen.shelfLibraryDone, true);
  assert.equal(seen.lastShownAt, T0 - 3 * DAY);
  let s = go(seen, "/library", T0);
  assert.equal(decide(s, "/library"), null, "already saw the sheet on Shelf/Library");
  s = go(s, "/", T0 + 5 * DAY);
  assert.equal(decide(s, "/"), "weekly_open", "8 days after the old dismissal");

  const fresh = newState(T0, "intro_sheet", { shows: 0, dismissedAt: null });
  assert.equal(fresh.shelfLibraryDone, false);
  assert.equal(fresh.lastShownAt, null);
  ok("old intro-sheet state migrates");
}

console.log(`\n${pass} passed`);

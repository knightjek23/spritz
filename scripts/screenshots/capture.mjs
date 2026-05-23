// Screenshot capture script.
//
// Walks every route in routes.mjs at two viewports (mobile + desktop),
// in both signed-out and signed-in contexts where applicable, and
// writes full-page PNGs into screenshots/.
//
// Conventions:
//   - Mobile viewport is iPhone 14 Pro (390x844). Spritz is a mobile-first
//     PWA, so this is the primary surface.
//   - Desktop viewport is 1280x900. Most pages have max-w-md anyway, so
//     they appear centered with whitespace; this is the honest preview.
//   - Auth state is read from .auth/state.json (run auth.mjs first).
//     If missing, signed-in routes are skipped with a warning.
//   - All animations are disabled and fonts are forced to load before
//     snapping, so captures are deterministic across runs.
//
// Usage:
//   pnpm dev                                  # in another terminal
//   node scripts/screenshots/auth.mjs         # one-time, signs in
//   node scripts/screenshots/capture.mjs      # snaps everything

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { resolveDynamicRoutes, buildRouteList } from "./routes.mjs";

const BASE_URL = process.env.SCREENSHOT_BASE_URL || "http://localhost:3000";
const OUT_DIR = "screenshots";
const STATE_PATH = ".auth/state.json";

const VIEWPORTS = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { width: 1280, height: 900, deviceScaleFactor: 1 },
};

const haveAuth = existsSync(STATE_PATH);
if (!haveAuth) {
  console.warn(
    `[capture] no ${STATE_PATH} — signed-in routes will be skipped. ` +
      `Run: node scripts/screenshots/auth.mjs`,
  );
}

// Resolve dynamic [id] / [slug] routes against the live DB so we capture
// real records instead of fake placeholders.
console.log("[capture] resolving dynamic routes against Supabase...");
const dyn = await resolveDynamicRoutes();
console.log("[capture] dynamic targets:", dyn);

const routes = buildRouteList(dyn);

const browser = await chromium.launch({
  headless: true,
  // Permit fake camera so /scan can show the live viewport without a
  // permission prompt. The fake stream is a green test card, but the
  // brackets + chrome around it render normally.
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});

let snapped = 0;
let skipped = 0;
let failed = 0;

for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
  for (const authMode of ["out", "in"]) {
    // Skip irrelevant combinations
    if (authMode === "in" && !haveAuth) continue;

    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: viewport.deviceScaleFactor,
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
      storageState: authMode === "in" ? STATE_PATH : undefined,
      // Force reduced motion so transitions don't add jitter to shots.
      reducedMotion: "reduce",
      // Pretend we're a real browser, not a headless one (some pages
      // gate behavior on this).
      userAgent: viewport.isMobile
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Spritz-Screenshot/1.0"
        : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Spritz-Screenshot/1.0",
    });

    // Inject CSS to kill all animations and transitions for stable shots.
    await context.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent = `*, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }`;
      document.documentElement.appendChild(style);
    });

    for (const route of routes) {
      const include =
        route.auth === "both" ||
        route.auth === authMode ||
        (route.auth === "out" && authMode === "out") ||
        (route.auth === "in" && authMode === "in");
      if (!include) continue;
      // Same path captured under both auth modes is fine for "both";
      // for routes pinned to "out" we want to skip the signed-in pass
      // even though we technically could load them, to avoid the home
      // page rendering the For You feed when the marker says "marketing".
      if (route.auth === "out" && authMode === "in") continue;
      if (route.auth === "in" && authMode === "out") continue;

      const dir = join(OUT_DIR, authMode === "in" ? "signed-in" : "signed-out", viewportName);
      await mkdir(dir, { recursive: true });
      const file = join(dir, `${route.name}.png`);

      const page = await context.newPage();
      try {
        await page.goto(`${BASE_URL}${route.path}`, {
          waitUntil: "networkidle",
          timeout: 30_000,
        });
        // Wait for fonts (Playfair + Roboto) so headings don't flash
        // serif-fallback in the screenshot.
        await page.evaluate(() => document.fonts.ready);

        if (route.waitFor) {
          await page.waitForSelector(route.waitFor, { timeout: 5_000 });
        }
        if (route.beforeShot) {
          await route.beforeShot(page);
        }

        await page.screenshot({ path: file, fullPage: true });
        console.log(`  ✓ ${authMode}/${viewportName}/${route.name}.png`);
        snapped++;
      } catch (err) {
        console.warn(`  ✗ ${authMode}/${viewportName}/${route.name}: ${err.message}`);
        failed++;
      } finally {
        await page.close();
      }
    }

    await context.close();
  }
}

await browser.close();

console.log(`\n[capture] done. ${snapped} snapped, ${failed} failed, ${skipped} skipped.`);
console.log(`[capture] output: ${OUT_DIR}/`);

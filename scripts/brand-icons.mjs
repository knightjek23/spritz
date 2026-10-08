// Renders every app icon, splash and favicon from public/brand/bottle-logo.svg.
//
//   node scripts/brand-icons.mjs
//
// Headless Chromium (Playwright) paints the SVG so the gradients come out
// exactly as the browser shows them. Re-run after any change to the logo;
// everything below is a derived file and never hand-edited.
//
// Surfaces:
//   public/            favicon-32, icon-192, icon-512, icon-maskable-512,
//                      apple-touch-icon (180)      -> bottle on sage (ICON_BG)
//   ios AppIcon        1024x1024, no alpha         -> bottle on sage
//   ios Splash         2732x2732 x3                -> bottle + wordmark on cream
//   android mipmap-*   ic_launcher, _round (legacy, full square on sage),
//                      ic_launcher_foreground (adaptive, 66% safe zone)
//   android drawable-* splash.png (all buckets)    -> bottle on cream
//   android drawable-* ic_stat_spritz.png          -> white bottle silhouette
//
// Native files only reach users with a new build (iOS build 4+, Android
// versionCode 3+). The public/ icons go live on the next Vercel deploy.

import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const SVG = await readFile(path.join(ROOT, "public/brand/bottle-logo.svg"), "utf8");
const EMERALD = "#1F3F2E";
// Icon tile background: sampled from Josh's reference PNG (2026-10-08).
const ICON_BG = "#ADC6B4";
const CREAM = "#F4EFE6";
// Natural aspect of the mark: 59 x 73.
const RATIO = 59 / 73;

// Flat white silhouette for the Android status bar (must be alpha-only).
const SVG_WHITE = SVG.replace(/fill="url\(#[^"]+\)"/g, 'fill="#FFFFFF"')
  .replace(/fill="#FAF6ED"/g, 'fill="#FFFFFF"')
  .replace(/stroke="#093616"/g, 'stroke="#FFFFFF"')
  .replace(/stroke="#144C24"/g, 'stroke="#FFFFFF"')
  .replace(/stroke="white"/g, 'stroke="#FFFFFF"');

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 100, height: 100 }, deviceScaleFactor: 1 });

/**
 * Render a composition to PNG.
 * @param {object} o
 * @param {number} o.w  width px
 * @param {number} o.h  height px
 * @param {string} o.bg CSS background ("transparent" allowed)
 * @param {number} o.markH bottle height px
 * @param {string} [o.svg] svg markup (default: the colour logo)
 * @param {string} [o.below] optional wordmark text under the bottle
 * @param {number} [o.wordPx] wordmark font size
 * @param {number} [o.shiftY] vertical offset of the whole group, px
 */
async function render({ w, h, bg, markH, svg = SVG, below, wordPx = 0, shiftY = 0 }) {
  const markW = Math.round(markH * RATIO);
  const html = `<!doctype html><html><head>
  ${below ? '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400&display=swap" rel="stylesheet">' : ""}
  <style>
    html,body{margin:0;background:transparent}
    #c{width:${w}px;height:${h}px;background:${bg};display:flex;flex-direction:column;align-items:center;justify-content:center;transform:translateY(${shiftY}px)}
    #c svg{width:${markW}px;height:${markH}px;display:block}
    #word{font-family:"Playfair Display",Georgia,serif;font-size:${wordPx}px;letter-spacing:-0.02em;color:${EMERALD};margin-top:${Math.round(markH * 0.22)}px;line-height:1}
  </style></head><body><div id="c">${svg}${below ? `<div id="word">${below}</div>` : ""}</div></body></html>`;
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: "networkidle" });
  if (below) await page.evaluate(() => document.fonts.ready);
  return page.locator("#c").screenshot({ omitBackground: bg === "transparent", type: "png" });
}

async function out(rel, buf) {
  const p = path.join(ROOT, rel);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, buf);
  console.log("wrote", rel);
}

// ---- Web (public/) ----
for (const [file, size, ratio] of [
  ["public/favicon-32.png", 32, 0.78],
  ["public/icon-192.png", 192, 0.64],
  ["public/icon-512.png", 512, 0.64],
  ["public/apple-touch-icon.png", 180, 0.64],
  ["public/icon-maskable-512.png", 512, 0.48],
]) {
  await out(file, await render({ w: size, h: size, bg: ICON_BG, markH: Math.round(size * ratio) }));
}

// ---- iOS ----
await out(
  "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
  await render({ w: 1024, h: 1024, bg: ICON_BG, markH: 655 }),
);
const splash = await render({ w: 2732, h: 2732, bg: CREAM, markH: 360, below: "spritz", wordPx: 150, shiftY: -60 });
for (const f of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  await out(`ios/App/App/Assets.xcassets/Splash.imageset/${f}`, splash);
}

// ---- Android ----
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENS)) {
  const legacy = Math.round(48 * k);
  const fg = Math.round(108 * k);
  const legacyPng = await render({ w: legacy, h: legacy, bg: ICON_BG, markH: Math.round(legacy * 0.64) });
  await out(`android/app/src/main/res/mipmap-${d}/ic_launcher.png`, legacyPng);
  await out(`android/app/src/main/res/mipmap-${d}/ic_launcher_round.png`, legacyPng);
  // Adaptive foreground: the visible safe zone is the central 66%.
  await out(
    `android/app/src/main/res/mipmap-${d}/ic_launcher_foreground.png`,
    await render({ w: fg, h: fg, bg: "transparent", markH: Math.round(fg * 0.46) }),
  );
  const stat = Math.round(24 * k);
  await out(
    `android/app/src/main/res/drawable-${d}/ic_stat_spritz.png`,
    await render({ w: stat, h: stat, bg: "transparent", markH: Math.round(stat * 0.9), svg: SVG_WHITE }),
  );
}
const SPLASH = {
  "drawable": [480, 800],
  "drawable-port-mdpi": [480, 800],
  "drawable-port-hdpi": [720, 1200],
  "drawable-port-xhdpi": [960, 1600],
  "drawable-port-xxhdpi": [1440, 2400],
  "drawable-port-xxxhdpi": [1920, 3200],
  "drawable-land-mdpi": [800, 480],
  "drawable-land-hdpi": [1200, 720],
  "drawable-land-xhdpi": [1600, 960],
  "drawable-land-xxhdpi": [2400, 1440],
  "drawable-land-xxxhdpi": [3200, 1920],
};
for (const [dir, [w, h]] of Object.entries(SPLASH)) {
  await out(
    `android/app/src/main/res/${dir}/splash.png`,
    await render({ w, h, bg: CREAM, markH: Math.round(Math.min(w, h) * 0.22) }),
  );
}

await browser.close();

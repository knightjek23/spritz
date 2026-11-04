// Renders the Android launch wordmark so it matches iOS SplashWordmark and
// the web launch layer (.launch-screen__word: 72px Playfair 400, #1F3F2E,
// line-height 1, tracking 0, centered in a 200x100 box).
//
//   node scripts/android-splash-wordmark.mjs
//
// Outputs, per density (mdpi 1x ... xxxhdpi 4x):
//   drawable-*/splash_icon_wordmark.png  288dp canvas, wordmark centered.
//       windowSplashScreenAnimatedIcon in values/styles.xml. Android 12+
//       masks this to a 192dp circle; the wordmark's widest point is
//       94.7dp from center, so it fits. Don't enlarge the type.
//   drawable-*/splash_wordmark.png       200x100dp, used by
//       drawable/launch_splash.xml (pre-12 window background and the splash
//       plugin's fallback view).
//
// Re-run if the wordmark size, font or colour changes in app/globals.css,
// and regenerate ios SplashWordmark.imageset at the same time.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const font = readFileSync(path.join(ROOT, "app/fonts/playfair-display-latin-wght-normal.woff2")).toString("base64");
const RES = path.join(ROOT, "android/app/src/main/res");

const browser = await chromium.launch();
async function render(w, h, scale, out) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await page.setContent(`<!doctype html><html><head><style>
@font-face{font-family:PF;src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:400 900}
html,body{margin:0;background:transparent}
.c{width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center}
.b{width:200px;height:100px;display:flex;align-items:center;justify-content:center}
span{font-family:PF;font-size:72px;font-weight:400;line-height:1;letter-spacing:0;color:#1F3F2E}
</style></head><body><div class="c"><div class="b"><span>spritz</span></div></div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(out, await page.screenshot({ omitBackground: true }));
  await page.close();
}
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, s] of Object.entries(DENSITIES)) {
  await render(288, 288, s, path.join(RES, `drawable-${d}`, "splash_icon_wordmark.png"));
  await render(200, 100, s, path.join(RES, `drawable-${d}`, "splash_wordmark.png"));
}
await browser.close();
console.log("Android splash wordmark rendered for", Object.keys(DENSITIES).join(", "));

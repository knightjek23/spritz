// One-off probe: scrape a single URL with the new Vue-wait logic and dump
// the rendered HTML to data/debug/vue-probe.html. Use this to confirm Vue
// rating components actually rendered (so I can write correct selectors)
// BEFORE committing to a 4-hour full re-scrape.
//
// Usage:
//   tsx src/probe-vue.ts https://www.fragrantica.com/perfume/Tom-Ford/Tobacco-Vanille-1825.html

import "dotenv/config";
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const HEADLESS = (process.env.HEADLESS ?? "false").toLowerCase() === "true";
const DEBUG_DIR = path.resolve("data/debug");

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
];

async function main() {
  const url = process.argv[2];
  if (!url || !/^https?:\/\//.test(url)) {
    console.error("usage: tsx src/probe-vue.ts <fragrantica-detail-url>");
    process.exit(1);
  }

  await fs.mkdir(DEBUG_DIR, { recursive: true });
  console.log(`[probe-vue] launching browser (headless=${HEADLESS})…`);

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const ctx = await browser.newContext({
    userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    viewport: { width: 1280, height: 800 },
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
  const page = await ctx.newPage();

  // Capture Fragrantica JSON API calls — this is how Vue components fetch
  // their longevity / sillage / season data.
  const apiCalls: Array<{ url: string; status: number; bodyPreview: string }> = [];
  page.on("response", async (response) => {
    const u = response.url();
    if (!/fragrantica\.com/.test(u)) return;
    if (/\.(png|jpe?g|gif|svg|webp|woff2?|ttf|css|js)(\?|$)/.test(u)) return;
    const status = response.status();
    let bodyPreview = "";
    try {
      const ct = response.headers()["content-type"] || "";
      if (ct.includes("json") || /\/(longevity|sillage|seasons|votes|rating)/i.test(u)) {
        const body = await response.text();
        bodyPreview = body.slice(0, 500);
      }
    } catch {
      /* response may have failed */
    }
    if (bodyPreview) apiCalls.push({ url: u, status, bodyPreview });
  });

  try {
    console.log(`[probe-vue] navigating to ${url}…`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    console.log(`[probe-vue] DOM loaded — scrolling + waiting for Vue render…`);
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight / 2, behavior: "smooth" }));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
    await page.waitForTimeout(2000);

    let vueRendered = false;
    try {
      await page.waitForFunction(
        () => {
          const tags = ["longevity-rating-new", "sillage-rating-new", "seasons-rating-new"];
          return tags.some((tag) => {
            const el = document.querySelector(tag);
            return el && (el.textContent!.trim().length > 5 || el.children.length > 0);
          });
        },
        { timeout: 15_000, polling: 250 },
      );
      vueRendered = true;
      await page.waitForTimeout(2000);
    } catch {
      vueRendered = false;
    }

    // Diagnostics — fully inlined to avoid tsx's `__name` instrumentation on
    // any `const arrow` declarations (those break inside page.evaluate because
    // the helper isn't defined in the browser context).
    const checks = await page.evaluate(() => {
      const tags = ["longevity-rating-new", "sillage-rating-new", "seasons-rating-new"] as const;
      return tags.map((tag) => {
        const el = document.querySelector(tag);
        if (!el) return { tag, exists: false };
        return {
          tag,
          exists: true,
          children: el.children.length,
          text_length: (el.textContent || "").trim().length,
          first_200_chars: (el.textContent || "").trim().slice(0, 200),
          inner_html_first_500: el.innerHTML.slice(0, 500),
        };
      });
    });

    const html = await page.content();
    const htmlPath = path.join(DEBUG_DIR, "vue-probe.html");
    const screenshotPath = path.join(DEBUG_DIR, "vue-probe.png");
    const reportPath = path.join(DEBUG_DIR, "vue-probe-report.json");

    // Save HTML and report FIRST — so we don't lose data if the screenshot fails.
    await fs.writeFile(htmlPath, html, "utf8");
    await fs.writeFile(
      reportPath,
      JSON.stringify(
        { url, vue_rendered: vueRendered, checks, html_size: html.length },
        null,
        2,
      ),
    );
    // Save API capture immediately too
    if (apiCalls.length > 0) {
      await fs.writeFile(
        path.join(DEBUG_DIR, "vue-probe-api-calls.json"),
        JSON.stringify(apiCalls, null, 2),
      );
    }
    // Screenshot is best-effort — skip if it times out (Fragrantica's font
    // requests can hang Playwright's screenshot for >30s).
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 8000 });
    } catch {
      console.log(`[probe-vue] (screenshot timed out — skipping; HTML + report saved OK)`);
    }

    console.log(`\n[probe-vue] vue rendered: ${vueRendered}`);
    console.log(`[probe-vue] html size: ${(html.length / 1024).toFixed(1)} KB`);
    console.log(`\nComponent diagnostics:`);
    for (const c of checks) {
      console.log(`  ${c.tag}:`, JSON.stringify(c, null, 2).split("\n").join("\n    "));
    }

    console.log(`\nAPI calls captured: ${apiCalls.length}`);
    if (apiCalls.length > 0) {
      console.log(`Likely rating endpoints (filtered for longevity/sillage/season/rating/votes):`);
      const interesting = apiCalls.filter((c) =>
        /(longevity|sillage|season|rating|vote|perfume)/i.test(c.url),
      );
      for (const c of interesting.slice(0, 20)) {
        console.log(`  [${c.status}] ${c.url}`);
        console.log(`    body[0..300]: ${c.bodyPreview.slice(0, 300)}`);
      }
      console.log(`\n  Full capture saved to data/debug/vue-probe-api-calls.json`);
    }
    console.log(`\nSaved:`);
    console.log(`  ${htmlPath}`);
    console.log(`  ${screenshotPath}`);
    console.log(`  ${reportPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

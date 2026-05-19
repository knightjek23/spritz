// Three-phase scraper:
//
//   discover          → opens the search page once, clicks "+ Show more results"
//                       in a loop until SCRAPE_LIMIT URLs are collected.
//                       Writes data/queue.json.
//   discover:debug    → opens the search page, takes a screenshot, dumps the
//                       button + result-card diagnostics to data/debug/.
//                       Use to verify selectors before kicking off the real run.
//   scrape            → for each URL in queue.json, fetch detail page → data/raw/
//   scrape --dry-run  → scrapes only first 10 URLs (validates parser end-to-end)
//
// Discovery and selectors are configurable via .env (no code edit needed):
//   DISCOVER_URL, DISCOVER_BUTTON_TEXT, DISCOVER_RESULT_SELECTOR,
//   DISCOVER_CLICK_WAIT_MS, DISCOVER_NO_GROWTH_LIMIT.

import "dotenv/config";
import { chromium, type BrowserContext, type Page } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const DELAY_MIN = Number(process.env.DELAY_MIN ?? 8);
const DELAY_MAX = Number(process.env.DELAY_MAX ?? 15);
const SCRAPE_LIMIT = Number(process.env.SCRAPE_LIMIT ?? 10000);
const DRY_RUN_LIMIT = Number(process.env.DRY_RUN_LIMIT ?? 10);
// HEADLESS=false runs a real Chrome window — much harder for Cloudflare to
// fingerprint as automation. Default false for scrape-style work; you can
// override with HEADLESS=true for headless operation if Cloudflare lets you.
const HEADLESS = (process.env.HEADLESS ?? "false").toLowerCase() === "true";

// ----- Discovery config (configurable via .env) -----
const DISCOVER_URL = process.env.DISCOVER_URL ?? "https://www.fragrantica.com/search/";
const DISCOVER_BUTTON_TEXT = process.env.DISCOVER_BUTTON_TEXT ?? "Show more results";
const DISCOVER_RESULT_SELECTOR =
  process.env.DISCOVER_RESULT_SELECTOR ?? 'a[href*="/perfume/"]';
const DISCOVER_CLICK_WAIT_MS = Number(process.env.DISCOVER_CLICK_WAIT_MS ?? 4000);
const DISCOVER_NO_GROWTH_LIMIT = Number(process.env.DISCOVER_NO_GROWTH_LIMIT ?? 3);
const FRAGRANCE_URL_REGEX = /\/perfume\/[^/]+\/[^/]+\.html/;

const DATA_DIR = path.resolve("data");
const RAW_DIR = path.join(DATA_DIR, "raw");
const DEBUG_DIR = path.join(DATA_DIR, "debug");
const QUEUE_FILE = path.join(DATA_DIR, "queue.json");
const STATE_FILE = path.join(DATA_DIR, "scrape-state.json");
const LOG_FILE = path.join(DATA_DIR, "scrape.log");

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => DELAY_MIN * 1000 + Math.random() * (DELAY_MAX - DELAY_MIN) * 1000;

function urlToSlug(url: string): string {
  const last = url.split("/").slice(-2).join("--");
  return last
    .toLowerCase()
    .replace(/\.html$/, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function makeContext(opts: { blockHeavy?: boolean } = { blockHeavy: true }) {
  const browser = await chromium.launch({
    headless: HEADLESS,
    // Common anti-fingerprinting flags
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });
  const ctx = await browser.newContext({
    userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });
  // Hide the navigator.webdriver flag — single biggest tell that this is a bot.
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
  if (opts.blockHeavy) {
    await ctx.route("**/*", (route) => {
      const t = route.request().resourceType();
      if (t === "image" || t === "font" || t === "media") return route.abort();
      return route.continue();
    });
  }
  return { browser, ctx };
}

async function appendLog(line: string) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.appendFile(LOG_FILE, `${new Date().toISOString()} ${line}\n`);
}

// ---------- helpers ----------

/** Read all fragrance URLs currently in the DOM, dedup, regex-filter. */
async function harvestUrls(page: Page): Promise<Set<string>> {
  const all = await page.$$eval(DISCOVER_RESULT_SELECTOR, (links) =>
    links.map((a) => (a as HTMLAnchorElement).href),
  );
  return new Set(all.filter((h) => FRAGRANCE_URL_REGEX.test(h)));
}

/** Scroll the button into view (lazy lists need this) and click it. */
async function clickShowMore(page: Page): Promise<boolean> {
  // Playwright's `getByRole('button', { name: ... })` is the cleanest match;
  // we fall back to a CSS :has-text contains-style match if that misses.
  const byRole = page.getByRole("button", { name: new RegExp(DISCOVER_BUTTON_TEXT, "i") });
  const candidates = [
    byRole,
    page.locator(`button:has-text("${DISCOVER_BUTTON_TEXT}")`),
    page.locator(`text=/${DISCOVER_BUTTON_TEXT}/i`),
  ];
  for (const c of candidates) {
    if ((await c.count()) > 0) {
      try {
        await c.first().scrollIntoViewIfNeeded({ timeout: 2000 });
        await c.first().click({ timeout: 5000 });
        return true;
      } catch {
        continue;
      }
    }
  }
  return false;
}

// ---------- discover phase ----------

async function discoverUrls(page: Page, limit: number): Promise<string[]> {
  console.log(`[discover] navigating to ${DISCOVER_URL}…`);
  const t0 = Date.now();
  await page.goto(DISCOVER_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  console.log(`[discover] DOM loaded in ${Date.now() - t0}ms`);
  await sleep(2000); // settle

  const collected = new Set<string>();
  let lastSize = 0;
  let consecutiveNoGrowth = 0;
  let clicks = 0;

  // Initial harvest
  for (const u of await harvestUrls(page)) collected.add(u);
  console.log(`[discover] initial load: ${collected.size} URLs`);

  while (collected.size < limit) {
    clicks++;
    const clicked = await clickShowMore(page);
    if (!clicked) {
      console.log(`[discover] could not find "${DISCOVER_BUTTON_TEXT}" button — stopping`);
      break;
    }

    // Wait for new results to render
    await sleep(DISCOVER_CLICK_WAIT_MS);

    for (const u of await harvestUrls(page)) collected.add(u);
    const grew = collected.size - lastSize;

    console.log(
      `[discover] click ${clicks}: +${grew} (total ${collected.size}/${limit})`,
    );
    await appendLog(`[discover] click ${clicks}: +${grew} total=${collected.size}`);

    if (grew === 0) {
      consecutiveNoGrowth++;
      if (consecutiveNoGrowth >= DISCOVER_NO_GROWTH_LIMIT) {
        console.log(
          `[discover] ${DISCOVER_NO_GROWTH_LIMIT} consecutive clicks with no new URLs — stopping`,
        );
        break;
      }
    } else {
      consecutiveNoGrowth = 0;
    }
    lastSize = collected.size;

    // Be polite — same pacing as detail-page scraping
    await sleep(jitter());
  }

  return Array.from(collected).slice(0, limit);
}

async function runDiscover() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  console.log(`[discover] URL:        ${DISCOVER_URL}`);
  console.log(`[discover] Button:     "${DISCOVER_BUTTON_TEXT}"`);
  console.log(`[discover] Selector:   ${DISCOVER_RESULT_SELECTOR}`);
  console.log(`[discover] Target:     ${SCRAPE_LIMIT} URLs\n`);

  // Don't block images/fonts during discovery — Fragrantica's JS depends on
  // image load events to render the load-more button. (Confirmed: with
  // blockHeavy=true we get 39 URLs and no button; with blockHeavy=false we
  // get 69 URLs and the button is present.)
  const { browser, ctx } = await makeContext({ blockHeavy: false });
  const page = await ctx.newPage();
  try {
    const urls = await discoverUrls(page, SCRAPE_LIMIT);
    await fs.writeFile(QUEUE_FILE, JSON.stringify(urls, null, 2));
    console.log(`\n[discover] wrote ${urls.length} URLs → ${QUEUE_FILE}`);
    if (urls.length === 0) {
      console.log(
        `\n[discover] ⚠ Queue is empty. Run \`npm run discover:debug\` to diagnose.`,
      );
    } else if (urls.length < SCRAPE_LIMIT) {
      console.log(
        `[discover] (got ${urls.length} of ${SCRAPE_LIMIT} target — increase ` +
          `DISCOVER_NO_GROWTH_LIMIT or DISCOVER_CLICK_WAIT_MS in .env if you want to keep trying)`,
      );
    }
  } finally {
    await browser.close();
  }
}

// ---------- discover:debug phase ----------

async function runDiscoverDebug() {
  await fs.mkdir(DEBUG_DIR, { recursive: true });
  console.log(`\n--- DISCOVER DEBUG ---`);
  console.log(`URL:       ${DISCOVER_URL}`);
  console.log(`Button:    "${DISCOVER_BUTTON_TEXT}"`);
  console.log(`Selector:  ${DISCOVER_RESULT_SELECTOR}\n`);

  // Don't block heavy resources in debug — we want to see what a real browser sees.
  console.log(`[debug] launching browser…`);
  const { browser, ctx } = await makeContext({ blockHeavy: false });
  const page = await ctx.newPage();

  try {
    let navError: string | null = null;
    console.log(`[debug] navigating to ${DISCOVER_URL}…`);
    const t0 = Date.now();
    try {
      await page.goto(DISCOVER_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
      console.log(`[debug] DOM loaded in ${Date.now() - t0}ms — letting page settle…`);
    } catch (err) {
      navError = String(err);
      console.log(`[debug] navigation error after ${Date.now() - t0}ms: ${navError}`);
    }
    await sleep(2000);
    console.log(`[debug] taking screenshot + dumping HTML…`);

    const title = await page.title();
    const html = await page.content();
    const finalUrl = page.url();
    const screenshotPath = path.join(DEBUG_DIR, "search-initial.png");
    const htmlPath = path.join(DEBUG_DIR, "search-initial.html");

    await page.screenshot({ path: screenshotPath, fullPage: true });
    await fs.writeFile(htmlPath, html, "utf8");

    const totalAnchors = await page.$$eval("a", (a) => a.length).catch(() => 0);
    const matchedSelector = await page
      .$$eval(DISCOVER_RESULT_SELECTOR, (links) =>
        links.map((a) => (a as HTMLAnchorElement).href),
      )
      .catch(() => []);
    const matchedRegex = matchedSelector.filter((h) => FRAGRANCE_URL_REGEX.test(h));
    console.log(`[debug] found ${matchedRegex.length} fragrance URLs on initial load`);

    // Try to locate the load-more button several ways
    console.log(`[debug] testing button locators + attempting one click…`);
    const buttonTrials = await Promise.all([
      page.getByRole("button", { name: new RegExp(DISCOVER_BUTTON_TEXT, "i") })
        .count()
        .catch(() => -1),
      page.locator(`button:has-text("${DISCOVER_BUTTON_TEXT}")`).count().catch(() => -1),
      page.locator(`text=/${DISCOVER_BUTTON_TEXT}/i`).count().catch(() => -1),
      page.locator("button").count().catch(() => -1),
    ]);

    // Try clicking and see if the count grows
    let beforeClick = matchedRegex.length;
    let afterClick = beforeClick;
    let clickWorked = false;
    let clickError: string | null = null;
    try {
      const clicked = await clickShowMore(page);
      if (clicked) {
        await sleep(DISCOVER_CLICK_WAIT_MS);
        const updated = await page.$$eval(DISCOVER_RESULT_SELECTOR, (l) =>
          l.map((a) => (a as HTMLAnchorElement).href),
        );
        afterClick = updated.filter((h) => FRAGRANCE_URL_REGEX.test(h)).length;
        clickWorked = afterClick > beforeClick;
        await page.screenshot({
          path: path.join(DEBUG_DIR, "search-after-click.png"),
          fullPage: true,
        });
      }
    } catch (err) {
      clickError = String(err);
    }

    const isCloudflare =
      /just a moment|cloudflare|attention required|cf-browser-verification/i.test(
        title + " " + html.slice(0, 5000),
      );

    const report = {
      timestamp: new Date().toISOString(),
      configured: {
        url: DISCOVER_URL,
        button_text: DISCOVER_BUTTON_TEXT,
        result_selector: DISCOVER_RESULT_SELECTOR,
        click_wait_ms: DISCOVER_CLICK_WAIT_MS,
      },
      navigation_error: navError,
      final_url_after_redirects: finalUrl,
      page_title: title,
      html_length: html.length,
      diagnostics: {
        total_anchors_on_page: totalAnchors,
        result_selector_matches: matchedSelector.length,
        regex_validated_fragrance_urls: matchedRegex.length,
        first_5_fragrance_urls: matchedRegex.slice(0, 5),
        button_locator_trials: {
          getByRole: buttonTrials[0],
          has_text: buttonTrials[1],
          text_regex: buttonTrials[2],
          total_buttons_on_page: buttonTrials[3],
        },
      },
      click_test: {
        clicked: clickWorked || beforeClick !== afterClick,
        urls_before_click: beforeClick,
        urls_after_click: afterClick,
        grew_by: afterClick - beforeClick,
        error: clickError,
      },
      flags: {
        looks_like_cloudflare_block: isCloudflare,
        page_seems_too_small: html.length < 5000,
      },
      saved_files: {
        raw_html: htmlPath,
        screenshot_initial: screenshotPath,
        screenshot_after_click: path.join(DEBUG_DIR, "search-after-click.png"),
      },
    };

    const reportPath = path.join(DEBUG_DIR, "discover-debug-report.json");
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(`Page title:        "${title}"`);
    console.log(`Final URL:         ${finalUrl}`);
    console.log(`HTML size:         ${(html.length / 1024).toFixed(1)} KB`);
    console.log(`Total anchors:     ${totalAnchors}`);
    console.log(`Result selector:   ${matchedSelector.length} matches`);
    console.log(`Fragrance URLs:    ${matchedRegex.length}`);
    if (matchedRegex.length > 0) {
      console.log(`First 5:`);
      matchedRegex.slice(0, 5).forEach((u) => console.log(`  ${u}`));
    }
    console.log(`\nButton locator trials:`);
    console.log(`  getByRole(button, "${DISCOVER_BUTTON_TEXT}"): ${buttonTrials[0]} matches`);
    console.log(`  button:has-text("${DISCOVER_BUTTON_TEXT}"):    ${buttonTrials[1]} matches`);
    console.log(`  text=/${DISCOVER_BUTTON_TEXT}/i:                ${buttonTrials[2]} matches`);
    console.log(`  total <button> elements on page:                ${buttonTrials[3]}`);
    console.log(`\nClick test:`);
    console.log(`  before: ${beforeClick} URLs`);
    console.log(`  after:  ${afterClick} URLs (+${afterClick - beforeClick})`);
    if (clickError) console.log(`  error:  ${clickError}`);
    if (isCloudflare) {
      console.log(`\n⚠ This page looks like a Cloudflare challenge.`);
    }
    console.log(`\nSaved:`);
    console.log(`  ${reportPath}`);
    console.log(`  ${htmlPath}                      (open in browser)`);
    console.log(`  ${screenshotPath}                (initial state)`);
    console.log(`  ${path.join(DEBUG_DIR, "search-after-click.png")}    (after one click)`);
  } finally {
    await browser.close();
  }
}

// ---------- scrape phase ----------

interface ScrapeState {
  completed: string[];
  failed: { url: string; reason: string; attempts: number }[];
}

async function loadState(): Promise<ScrapeState> {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { completed: [], failed: [] };
  }
}

async function saveState(state: ScrapeState) {
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function loadQueue(): Promise<string[]> {
  const raw = await fs.readFile(QUEUE_FILE, "utf8").catch(() => null);
  if (!raw) {
    throw new Error(`Queue not found at ${QUEUE_FILE}. Run \`npm run discover\` first.`);
  }
  return JSON.parse(raw);
}

async function scrapeOne(page: Page, url: string): Promise<string | null> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    // Human-like: pause to "read", then scroll halfway, pause, scroll to bottom.
    // Triggers Fragrantica's lazy-loaded sections + Vue components.
    await page.waitForTimeout(1500 + Math.random() * 1000);
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight / 2, behavior: "smooth" }));
    await page.waitForTimeout(1200 + Math.random() * 800);
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
    await page.waitForTimeout(1500 + Math.random() * 1000);

    // v1.5: wait for Vue rating components (longevity / sillage / seasons) to
    // populate. They're empty <longevity-rating-new> placeholders until Vue
    // hydrates and fetches the rating data. Poll for any rendered content
    // inside them; bail out after 10s so a slow page doesn't kill the run.
    try {
      await page.waitForFunction(
        () => {
          const tags = ["longevity-rating-new", "sillage-rating-new", "seasons-rating-new"];
          return tags.some((tag) => {
            const el = document.querySelector(tag);
            if (!el) return false;
            // After Vue renders, the element will have meaningful child content.
            // Empty placeholder = empty textContent + 0 children.
            return el.textContent!.trim().length > 5 || el.children.length > 0;
          });
        },
        { timeout: 10_000, polling: 250 },
      );
      // Buffer for in-flight DOM updates after the first signal
      await page.waitForTimeout(1500);
    } catch {
      // Vue didn't render in time — proceed with what we have. Page is otherwise valid.
    }

    return await page.content();
  } catch (err) {
    await appendLog(`[scrape] FAIL ${url}: ${String(err)}`);
    return null;
  }
}

async function runScrape(opts: { dryRun: boolean }) {
  await fs.mkdir(RAW_DIR, { recursive: true });
  const queue = await loadQueue();
  const state = await loadState();
  const completed = new Set(state.completed);

  const target = opts.dryRun ? queue.slice(0, DRY_RUN_LIMIT) : queue;
  console.log(
    `[scrape] queue=${queue.length} completed=${completed.size} ` +
      `target_this_run=${target.length}${opts.dryRun ? " (DRY RUN)" : ""}`,
  );

  // Don't block heavy resources — Fragrantica's JS depends on image loads to
  // fully render. Blocked-resource sessions get smaller HTML AND look more
  // bot-like to Cloudflare. (Same fix as runDiscover; same root cause.)
  const { browser, ctx } = await makeContext({ blockHeavy: false });
  const page = await ctx.newPage();
  let i = 0;

  try {
    for (const url of target) {
      i++;
      if (completed.has(url)) continue;

      const file = path.join(RAW_DIR, `${urlToSlug(url)}.html`);
      try {
        await fs.access(file);
        completed.add(url);
        state.completed.push(url);
        continue;
      } catch {
        /* not present, scrape it */
      }

      const html = await scrapeOne(page, url);
      // A real Fragrantica detail page is 500KB+ (full content + reviews + similars).
      // Anything under 50KB is almost certainly a Cloudflare challenge or error page.
      // Anything containing a Cloudflare marker is blocked even if larger.
      const tooSmall = !html || html.length < 50_000;
      const isCloudflare =
        !!html &&
        /just a moment|cloudflare|attention required|cf-browser-verification|cf-challenge/i.test(
          html.slice(0, 5000),
        );
      const ok = !tooSmall && !isCloudflare;

      if (ok && html) {
        await fs.writeFile(file, html, "utf8");
        completed.add(url);
        state.completed.push(url);
        console.log(
          `[scrape] (${i}/${target.length}) ✓ ${path.basename(file)} (${(html.length / 1024).toFixed(0)}KB)`,
        );
      } else {
        const reason = isCloudflare ? "cloudflare_challenge" : tooSmall ? "page_too_small" : "fetch_failed";
        const existing = state.failed.find((f) => f.url === url);
        if (existing) existing.attempts++;
        else state.failed.push({ url, reason, attempts: 1 });
        console.log(
          `[scrape] (${i}/${target.length}) ✗ ${url} (${reason}, ${html ? html.length + " bytes" : "no html"})`,
        );

        // If we hit 5 Cloudflare blocks in a row, abort early — continuing
        // just trains the WAF on us harder. Wait 24h before retrying.
        const recentFailures = state.failed.slice(-5);
        const allCloudflare =
          recentFailures.length === 5 &&
          recentFailures.every((f) => f.reason === "cloudflare_challenge");
        if (allCloudflare) {
          console.log(
            `\n[scrape] ⚠ 5 consecutive Cloudflare challenges — aborting.`,
          );
          console.log(`  Wait 24h, increase DELAY_MIN/DELAY_MAX in .env (try 8 / 15), then resume.`);
          break;
        }
      }

      if (i % 25 === 0) await saveState(state);
      await sleep(jitter());
    }
  } finally {
    await saveState(state);
    await browser.close();
  }

  console.log(`[scrape] done. completed=${completed.size} failed=${state.failed.length}`);
}

// ---------- entrypoint ----------

const cmd = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

(async () => {
  if (cmd === "discover") {
    await runDiscover();
  } else if (cmd === "discover:debug") {
    await runDiscoverDebug();
  } else if (cmd === "scrape") {
    await runScrape({ dryRun });
  } else {
    console.error(
      "usage:\n" +
        "  tsx src/scrape-fragrantica.ts discover\n" +
        "  tsx src/scrape-fragrantica.ts discover:debug   (when discover returns 0)\n" +
        "  tsx src/scrape-fragrantica.ts scrape [--dry-run]",
    );
    process.exit(1);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

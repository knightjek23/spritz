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

// Default seed URLs when DISCOVER_URLS isn't set. Fragrantica's main
// /search/ page tops out at ~1k results regardless of how many "Show
// more" clicks you do (their listing endpoint goes silent past that
// ceiling, often Cloudflare-mediated). Walking multiple filter pages
// gets around the ceiling because each filtered listing has its own
// ~1k window with mostly distinct fragrances. Each entry returns
// ~500-1000 URLs in practice; union of all six lands ~3-5k unique.
//
// The default list intentionally biases toward what scan users
// actually wear: top across both genders, plus the four highest-volume
// accord buckets (woody, floral, oriental, fresh).
const DEFAULT_DISCOVER_SEEDS = [
  "https://www.fragrantica.com/search/",
  "https://www.fragrantica.com/search/?gender_pgender_for_men=1",
  "https://www.fragrantica.com/search/?gender_pgender_for_women=1",
  "https://www.fragrantica.com/search/?accord_1=woody",
  "https://www.fragrantica.com/search/?accord_1=floral",
  "https://www.fragrantica.com/search/?accord_1=oriental",
  "https://www.fragrantica.com/search/?accord_1=fresh",
];

// Parse DISCOVER_URLS env (comma-separated) for multi-seed mode. Falls
// back to single DISCOVER_URL (back-compat) or the default seed list.
function getSeedUrls(): string[] {
  const multi = process.env.DISCOVER_URLS;
  if (multi) {
    const list = multi
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (list.length > 0) return list;
  }
  // Single-URL legacy mode: if the user explicitly set DISCOVER_URL,
  // respect it (single seed). Otherwise, multi-seed default.
  if (process.env.DISCOVER_URL) return [DISCOVER_URL];
  return DEFAULT_DISCOVER_SEEDS;
}

// Read the existing queue.json if present, so each discover run UNIONS
// new URLs with what's already there instead of overwriting. Lets you
// run discover repeatedly with different seeds and accumulate.
async function readExistingQueue(): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(QUEUE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((u): u is string => typeof u === "string"));
    }
  } catch {
    // No existing queue, or unreadable — start fresh.
  }
  return new Set();
}

async function runDiscover() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const seeds = getSeedUrls();
  console.log(`[discover] Seeds:      ${seeds.length} seed URL(s)`);
  for (const s of seeds) console.log(`             - ${s}`);
  console.log(`[discover] Button:     "${DISCOVER_BUTTON_TEXT}"`);
  console.log(`[discover] Selector:   ${DISCOVER_RESULT_SELECTOR}`);
  console.log(`[discover] Target:     ${SCRAPE_LIMIT} URLs\n`);

  // Union with whatever queue.json already holds — re-runs accumulate
  // rather than overwriting prior discover passes.
  const accumulated = await readExistingQueue();
  console.log(`[discover] starting from existing queue: ${accumulated.size} URLs\n`);

  const { browser, ctx } = await makeContext({ blockHeavy: false });
  const page = await ctx.newPage();
  try {
    for (let i = 0; i < seeds.length; i++) {
      const seed = seeds[i];
      console.log(`\n[discover] ━━━ seed ${i + 1}/${seeds.length}: ${seed} ━━━`);
      // Per-seed budget so one seed can't monopolize the run. Each
      // seed gets at most SCRAPE_LIMIT URLs, but the overall union
      // grows until we hit the limit OR exhaust all seeds.
      const before = accumulated.size;
      try {
        await page.goto(seed, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await sleep(2000);
        for (const u of await harvestUrls(page)) accumulated.add(u);

        // Re-implement the click loop here so each seed honors the same
        // no-growth ceiling but contributes to the shared accumulated
        // set across seeds.
        let lastSize = accumulated.size;
        let consecutiveNoGrowth = 0;
        let clicks = 0;
        while (accumulated.size < SCRAPE_LIMIT) {
          clicks++;
          const clicked = await clickShowMore(page);
          if (!clicked) {
            console.log(`[discover] seed ${i + 1}: no more "Show more" button — moving on`);
            break;
          }
          await sleep(DISCOVER_CLICK_WAIT_MS);
          for (const u of await harvestUrls(page)) accumulated.add(u);
          const grew = accumulated.size - lastSize;
          console.log(
            `[discover] seed ${i + 1} click ${clicks}: +${grew} (total ${accumulated.size}/${SCRAPE_LIMIT})`,
          );
          if (grew === 0) {
            consecutiveNoGrowth++;
            if (consecutiveNoGrowth >= DISCOVER_NO_GROWTH_LIMIT) {
              console.log(`[discover] seed ${i + 1}: no-growth ceiling hit — moving on`);
              break;
            }
          } else {
            consecutiveNoGrowth = 0;
          }
          lastSize = accumulated.size;
          await sleep(jitter());
        }
      } catch (err) {
        console.warn(
          `[discover] seed ${i + 1} failed:`,
          err instanceof Error ? err.message : String(err),
        );
      }
      const added = accumulated.size - before;
      console.log(`[discover] seed ${i + 1} contributed +${added} new URLs (total ${accumulated.size})`);
      if (accumulated.size >= SCRAPE_LIMIT) {
        console.log(`[discover] hit SCRAPE_LIMIT (${SCRAPE_LIMIT}) — stopping early`);
        break;
      }
    }

    const finalList = Array.from(accumulated).slice(0, SCRAPE_LIMIT);
    await fs.writeFile(QUEUE_FILE, JSON.stringify(finalList, null, 2));
    console.log(`\n[discover] wrote ${finalList.length} URLs → ${QUEUE_FILE}`);
    if (finalList.length === 0) {
      console.log(`\n[discover] ⚠ Queue is empty. Run \`npm run discover:debug\` to diagnose.`);
    } else if (finalList.length < SCRAPE_LIMIT) {
      console.log(
        `[discover] (got ${finalList.length} of ${SCRAPE_LIMIT} target — add more seeds via ` +
          `DISCOVER_URLS env, or bump DISCOVER_NO_GROWTH_LIMIT if you want to keep trying)`,
      );
    }
  } finally {
    await browser.close();
  }
}

// ---------- discover:sitemap phase ----------
//
// Bypasses the listing UI entirely by walking Fragrantica's XML sitemaps.
// Sitemaps are designed for bulk URL discovery, aren't paginated with
// "Show more" buttons, and aren't (in our experience) gated by the same
// ~1k cap that hits the search listings. When the standard discover
// keeps bailing at 1k, this is the fallback.
//
// Strategy:
//   1. Try known sitemap entry points in order until one returns 200
//   2. If the first response is a <sitemapindex>, walk each child sitemap
//   3. If it's a <urlset>, harvest <loc> values directly
//   4. Filter every harvested URL through FRAGRANCE_URL_REGEX
//   5. Union into queue.json (same accumulation semantics as discover)

// Canonical sitemap entry points. We try robots.txt first because that's
// where any compliant site declares its actual sitemap URLs; if that's
// gone or hides them, we fall back to a list of common paths.
const ROBOTS_TXT_URL = "https://www.fragrantica.com/robots.txt";
const SITEMAP_CANDIDATES = [
  "https://www.fragrantica.com/sitemap.xml",
  "https://www.fragrantica.com/sitemap_index.xml",
  "https://www.fragrantica.com/sitemap-perfumes.xml",
  "https://www.fragrantica.com/sitemaps/sitemap.xml",
  "https://www.fragrantica.com/sitemap/sitemap.xml",
];

// Pull every `Sitemap:` directive out of a robots.txt body. RFC says
// these are case-insensitive and one per line.
function parseRobotsSitemaps(body: string): string[] {
  const out: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^\s*sitemap\s*:\s*(\S+)\s*$/i);
    if (m) out.push(m[1]);
  }
  return out;
}

async function runDiscoverSitemap() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  console.log(`[discover:sitemap] target SCRAPE_LIMIT: ${SCRAPE_LIMIT}`);

  const accumulated = await readExistingQueue();
  console.log(`[discover:sitemap] starting from existing queue: ${accumulated.size} URLs\n`);

  const { browser, ctx } = await makeContext({ blockHeavy: false });
  const page = await ctx.newPage();

  try {
    // Build the candidate list. Start with anything robots.txt declares,
    // then fall back to common guesses if that turns up nothing. This is
    // the order most likely to find a working sitemap on a site that
    // either publishes one normally or just uses an unusual path.
    const candidates: string[] = [];
    console.log(`[discover:sitemap] checking robots.txt for sitemap declarations…`);
    try {
      const response = await page.goto(ROBOTS_TXT_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      if (response && response.ok()) {
        // robots.txt is plain text; Playwright wraps it in a <pre>, so
        // innerText on the body gives us the raw lines.
        const body = (await page.evaluate(() => document.body?.innerText ?? "")) || "";
        const declared = parseRobotsSitemaps(body);
        if (declared.length > 0) {
          console.log(`[discover:sitemap]   robots.txt declares ${declared.length} sitemap(s):`);
          for (const s of declared) console.log(`             - ${s}`);
          candidates.push(...declared);
        } else {
          console.log(`[discover:sitemap]   robots.txt has no Sitemap: directive`);
        }
      } else {
        console.log(`[discover:sitemap]   robots.txt HTTP ${response?.status() ?? "?"}`);
      }
    } catch (err) {
      console.log(
        `[discover:sitemap]   robots.txt error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    // Add the static fallbacks last so robots.txt-declared URLs take precedence.
    for (const c of SITEMAP_CANDIDATES) {
      if (!candidates.includes(c)) candidates.push(c);
    }

    // Find an accessible sitemap entry point. Some hosts gate /sitemap.xml
    // behind Cloudflare; if so, fall through to the next candidate.
    let entryUrl: string | null = null;
    let entryXml: string | null = null;
    for (const candidate of candidates) {
      console.log(`[discover:sitemap] trying ${candidate}…`);
      try {
        const response = await page.goto(candidate, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        if (response && response.ok()) {
          const body = await page.content();
          // Sanity check: must look like XML, not a Cloudflare challenge
          // page. The challenge HTML doesn't contain <loc> tags.
          if (body.includes("<loc>")) {
            entryUrl = candidate;
            entryXml = body;
            console.log(`[discover:sitemap] ✓ found accessible sitemap`);
            break;
          }
          console.log(`[discover:sitemap]   no <loc> tags (likely a challenge page)`);
        } else {
          console.log(`[discover:sitemap]   HTTP ${response?.status() ?? "?"} — trying next`);
        }
      } catch (err) {
        console.log(
          `[discover:sitemap]   error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (!entryXml || !entryUrl) {
      console.error("[discover:sitemap] ⚠ No accessible sitemap found. Tried:");
      for (const c of candidates) console.error(`             - ${c}`);
      console.error("");
      console.error(
        "  Fragrantica appears to either not publish a public sitemap or to " +
          "hide it from anonymous traffic. Next step: switch to brand-page " +
          "walking with `pnpm discover:brands`, which enumerates designers " +
          "and walks each brand's perfume list (not gated by the listing UI).",
      );
      return;
    }

    // Parse <loc> tags. A sitemapindex has child sitemap URLs (usually
    // ending in .xml or .gz); a urlset has actual page URLs.
    const subSitemaps: string[] = [];
    const directUrls: string[] = [];
    for (const m of entryXml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
      const url = m[1].trim();
      if (FRAGRANCE_URL_REGEX.test(url)) {
        directUrls.push(url);
      } else if (
        url.endsWith(".xml") ||
        url.endsWith(".xml.gz") ||
        url.includes("sitemap")
      ) {
        subSitemaps.push(url);
      }
    }

    console.log(
      `[discover:sitemap] entry: ${subSitemaps.length} sub-sitemaps, ${directUrls.length} direct URLs`,
    );

    // Take any direct URLs from the entry into the accumulator.
    let added = 0;
    for (const u of directUrls) {
      if (!accumulated.has(u)) added++;
      accumulated.add(u);
    }
    if (added > 0) console.log(`[discover:sitemap]   +${added} from entry (total ${accumulated.size})`);

    // Walk sub-sitemaps in order, stopping at SCRAPE_LIMIT.
    for (let i = 0; i < subSitemaps.length; i++) {
      if (accumulated.size >= SCRAPE_LIMIT) {
        console.log(`[discover:sitemap] hit SCRAPE_LIMIT (${SCRAPE_LIMIT}) — stopping`);
        break;
      }
      const sub = subSitemaps[i];
      const label = sub.split("/").pop() ?? sub;
      try {
        const response = await page.goto(sub, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        if (!response || !response.ok()) {
          console.log(
            `[discover:sitemap] sub ${i + 1}/${subSitemaps.length} ${label}: HTTP ${response?.status() ?? "?"} — skipping`,
          );
          continue;
        }
        const subXml = await page.content();
        let subAdded = 0;
        for (const m of subXml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
          const url = m[1].trim();
          if (FRAGRANCE_URL_REGEX.test(url)) {
            if (!accumulated.has(url)) subAdded++;
            accumulated.add(url);
          }
        }
        console.log(
          `[discover:sitemap] sub ${i + 1}/${subSitemaps.length} ${label}: +${subAdded} (total ${accumulated.size})`,
        );
        await sleep(jitter());
      } catch (err) {
        console.warn(
          `[discover:sitemap] sub failed ${label}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const finalList = Array.from(accumulated).slice(0, SCRAPE_LIMIT);
    await fs.writeFile(QUEUE_FILE, JSON.stringify(finalList, null, 2));
    console.log(`\n[discover:sitemap] wrote ${finalList.length} URLs → ${QUEUE_FILE}`);
    if (finalList.length < SCRAPE_LIMIT) {
      console.log(
        `[discover:sitemap] (got ${finalList.length} of ${SCRAPE_LIMIT} target — sitemap may not list every perfume; ` +
          `consider running standard discover too for additional sources)`,
      );
    }
  } finally {
    await browser.close();
  }
}

// ---------- discover:brands phase ----------
//
// Fragrantica's /search/ listing tops out around ~1k results regardless
// of filters or "Show more" clicks, and they don't publish a sitemap.
// The escape hatch is brand-page walking:
//
//   1. Fetch the /designers/ root + per-letter indexes (/designers-1.html
//      through /designers-26.html — Fragrantica's numbering is alphabetic)
//   2. From each index, extract /designers/<Brand-Slug>.html URLs
//   3. For each brand page, harvest every <a href> matching
//      FRAGRANCE_URL_REGEX (a brand's full catalog is on one page, no
//      pagination)
//   4. Union into queue.json, stopping at SCRAPE_LIMIT
//
// Brand pages aren't subject to the listing ceiling because each brand
// owns its own page — Fragrantica wants those pages indexable so they
// don't gate them the way they gate /search/. Typical run pulls 5k-10k
// fragrance URLs across the top ~500 brands.

const BRAND_INDEX_URLS: string[] = [
  "https://www.fragrantica.com/designers/",
  // Per-letter indexes — Fragrantica uses numeric slugs (1=A, 2=B, ...,
  // 26=Z, plus a separate slug for numerics/symbols). We try the full
  // alphabetic range; non-existent ones 404 and get skipped.
  ...Array.from({ length: 26 }, (_, i) => `https://www.fragrantica.com/designers-${i + 1}.html`),
];

const BRAND_URL_REGEX = /\/designers\/[^/?#]+\.html/i;

// Per-brand request cap so a single mega-brand (e.g. Avon, with
// thousands of entries) can't monopolize the budget. SCRAPE_LIMIT
// still ultimately caps the total.
const BRAND_FETCH_MAX = Number(process.env.BRAND_FETCH_MAX ?? 800);

// Curate the brand list and per-brand harvest to focus the catalog on
// what users actually wear, not the long tail. Defaults: top 100 brands
// (Fragrantica's /designers/ root returns them in popularity order,
// verified against Tom Ford / Creed / Chanel hits) × top 30 fragrances
// per brand (brand pages list perfumes in popularity order, mostly —
// with a small boost for recent releases). 100 * 30 = 3000 dense,
// high-signal entries instead of 5000+ filler.
//
// Set either to 0 to disable that cap (walk all brands, harvest all
// fragrances per brand — recovers the original behavior).
const BRANDS_MAX = Number(process.env.BRANDS_MAX ?? 100);
const FRAGRANCES_PER_BRAND_MAX = Number(process.env.FRAGRANCES_PER_BRAND_MAX ?? 30);

// Skip the first N brands before walking — useful for resuming an
// interrupted run or continuing past a previous BRANDS_MAX cap without
// re-fetching brands you've already processed. With BRANDS_OFFSET=100
// BRANDS_MAX=20 you walk brands 101-120 only.
const BRANDS_OFFSET = Number(process.env.BRANDS_OFFSET ?? 0);

async function runDiscoverBrands() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  console.log(`[discover:brands] target SCRAPE_LIMIT: ${SCRAPE_LIMIT}`);
  console.log(`[discover:brands] per-brand fetch cap: ${BRAND_FETCH_MAX}`);
  console.log(
    `[discover:brands] curation: BRANDS_OFFSET=${BRANDS_OFFSET}, BRANDS_MAX=${BRANDS_MAX || "all"}, FRAGRANCES_PER_BRAND_MAX=${FRAGRANCES_PER_BRAND_MAX || "all"}`,
  );

  const accumulated = await readExistingQueue();
  console.log(`[discover:brands] starting from existing queue: ${accumulated.size} URLs\n`);

  const { browser, ctx } = await makeContext({ blockHeavy: true });
  const page = await ctx.newPage();

  try {
    // ----- Step 1: discover brand page URLs from the indexes -----
    const brandUrls = new Set<string>();
    console.log(`[discover:brands] walking ${BRAND_INDEX_URLS.length} brand indexes…\n`);

    for (let i = 0; i < BRAND_INDEX_URLS.length; i++) {
      const indexUrl = BRAND_INDEX_URLS[i];
      const label = indexUrl.split("/").pop() || indexUrl;
      try {
        const response = await page.goto(indexUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        if (!response || !response.ok()) {
          console.log(
            `[discover:brands] index ${i + 1}/${BRAND_INDEX_URLS.length} ${label}: HTTP ${response?.status() ?? "?"} — skip`,
          );
          continue;
        }
        // Pull every anchor whose href matches the brand-page shape.
        // Using $$eval for absolute URL resolution (Playwright fills
        // href with origin for us).
        const hrefs = await page
          .$$eval("a", (links) => links.map((a) => (a as HTMLAnchorElement).href))
          .catch(() => [] as string[]);
        let added = 0;
        for (const href of hrefs) {
          if (BRAND_URL_REGEX.test(href)) {
            const cleaned = href.split("#")[0].split("?")[0];
            if (!brandUrls.has(cleaned)) added++;
            brandUrls.add(cleaned);
          }
        }
        console.log(
          `[discover:brands] index ${i + 1}/${BRAND_INDEX_URLS.length} ${label}: +${added} brands (total ${brandUrls.size})`,
        );
        await sleep(jitter());
      } catch (err) {
        console.warn(
          `[discover:brands] index ${label} error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (brandUrls.size === 0) {
      console.error(
        "\n[discover:brands] ⚠ No brand pages found — indexes may be gated. " +
          "Manual fallback: open https://www.fragrantica.com/designers/ in your " +
          "browser, save the HTML, and we can wire a file-input mode.",
      );
      return;
    }

    console.log(`\n[discover:brands] discovered ${brandUrls.size} unique brand pages`);

    // ----- Step 2: walk each brand page, harvest fragrance URLs -----
    // /designers/ returns brands in Fragrantica's popularity order
    // (verified: Chanel, Tom Ford, Creed near the top; obscure houses
    // deeper). BRANDS_OFFSET skips the first N (for resuming), then
    // BRANDS_MAX caps the slice. Default offset=0, max=100 walks brands
    // 1-100; offset=100, max=20 walks 101-120.
    const allBrands = Array.from(brandUrls);
    const sliceStart = Math.max(0, Math.min(BRANDS_OFFSET, allBrands.length));
    const sliceEnd =
      BRANDS_MAX > 0
        ? Math.min(sliceStart + BRANDS_MAX, allBrands.length)
        : allBrands.length;
    const brands = allBrands.slice(sliceStart, sliceEnd);
    if (sliceStart > 0 || sliceEnd < allBrands.length) {
      console.log(
        `[discover:brands] walking brands ${sliceStart + 1}-${sliceEnd} of ${allBrands.length} ` +
          `(${allBrands.length - brands.length} skipped)`,
      );
    }
    let processed = 0;
    let totalAdded = 0;

    for (const brandUrl of brands) {
      if (accumulated.size >= SCRAPE_LIMIT) {
        console.log(`\n[discover:brands] hit SCRAPE_LIMIT (${SCRAPE_LIMIT}) — stopping`);
        break;
      }
      if (processed >= BRAND_FETCH_MAX) {
        console.log(
          `\n[discover:brands] hit per-run brand cap (${BRAND_FETCH_MAX}) — stopping. ` +
            `Re-run to continue (queue is preserved).`,
        );
        break;
      }
      processed++;
      const brandLabel = brandUrl.split("/").pop()?.replace(/\.html$/, "") ?? brandUrl;
      try {
        const response = await page.goto(brandUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        if (!response || !response.ok()) {
          console.log(
            `[discover:brands] ${sliceStart + processed}/${allBrands.length} ${brandLabel}: HTTP ${response?.status() ?? "?"} — skip`,
          );
          continue;
        }
        const hrefs = await page
          .$$eval("a", (links) => links.map((a) => (a as HTMLAnchorElement).href))
          .catch(() => [] as string[]);

        // Filter to fragrance URLs and dedupe within the page (brand
        // pages often link to the same perfume multiple times — once
        // per thumbnail, once per name, etc.). Preserves DOM order so
        // the popularity-ordered listing stays intact through the slice.
        const seenOnPage = new Set<string>();
        const fragranceUrls: string[] = [];
        for (const href of hrefs) {
          if (FRAGRANCE_URL_REGEX.test(href)) {
            const cleaned = href.split("#")[0].split("?")[0];
            if (!seenOnPage.has(cleaned)) {
              seenOnPage.add(cleaned);
              fragranceUrls.push(cleaned);
            }
          }
        }

        // Slice to the top N per brand (defaults to 30). Brand pages
        // list perfumes in popularity-ish order so this captures each
        // brand's hits without dragging in obscure flankers.
        const capped =
          FRAGRANCES_PER_BRAND_MAX > 0
            ? fragranceUrls.slice(0, FRAGRANCES_PER_BRAND_MAX)
            : fragranceUrls;

        let added = 0;
        for (const cleaned of capped) {
          if (!accumulated.has(cleaned)) {
            accumulated.add(cleaned);
            added++;
            totalAdded++;
          }
        }
        console.log(
          `[discover:brands] ${sliceStart + processed}/${allBrands.length} ${brandLabel}: +${added} (total ${accumulated.size}/${SCRAPE_LIMIT})`,
        );

        // Persist every 20 brands so a crash doesn't lose progress.
        if (processed % 20 === 0) {
          const snapshot = Array.from(accumulated).slice(0, SCRAPE_LIMIT);
          await fs.writeFile(QUEUE_FILE, JSON.stringify(snapshot, null, 2));
        }
        await sleep(jitter());
      } catch (err) {
        console.warn(
          `[discover:brands] ${brandLabel} error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const finalList = Array.from(accumulated).slice(0, SCRAPE_LIMIT);
    await fs.writeFile(QUEUE_FILE, JSON.stringify(finalList, null, 2));
    console.log(`\n[discover:brands] processed ${processed} brand pages`);
    console.log(`[discover:brands] +${totalAdded} new URLs this run`);
    console.log(`[discover:brands] wrote ${finalList.length} URLs → ${QUEUE_FILE}`);
    if (finalList.length < SCRAPE_LIMIT) {
      console.log(
        `[discover:brands] (got ${finalList.length} of ${SCRAPE_LIMIT} target — ` +
          `re-run to walk more brands, or increase BRAND_FETCH_MAX)`,
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
  } else if (cmd === "discover:sitemap") {
    await runDiscoverSitemap();
  } else if (cmd === "discover:brands") {
    await runDiscoverBrands();
  } else if (cmd === "scrape") {
    await runScrape({ dryRun });
  } else {
    console.error(
      "usage:\n" +
        "  tsx src/scrape-fragrantica.ts discover\n" +
        "  tsx src/scrape-fragrantica.ts discover:sitemap   (try XML sitemap discovery)\n" +
        "  tsx src/scrape-fragrantica.ts discover:brands    (walk designer pages — bypass the ~1k ceiling)\n" +
        "  tsx src/scrape-fragrantica.ts discover:debug     (when discover returns 0)\n" +
        "  tsx src/scrape-fragrantica.ts scrape [--dry-run]",
    );
    process.exit(1);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

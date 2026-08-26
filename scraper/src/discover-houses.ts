// House discovery + popularity ranking + targeted queue building.
//
//   discover:houses  → walks /designers-1/ … /designers-11/, harvesting every
//                      brand on Fragrantica (~8,041) plus its fragrance count.
//                      Writes data/houses.json. ~11 requests, under a minute.
//
//   rank:houses      → for each candidate house, fetches its brand page once and
//                      parses the per-fragrance VOTE COUNT that Fragrantica
//                      renders inside each card anchor. Produces a real
//                      popularity ranking of houses AND a popularity-ordered
//                      fragrance list per house.
//                      Writes data/houses-ranked.json + data/house-fragrances/.
//                      Resumable — re-run after a crash and it skips cached houses.
//
//   discover:top     → takes the target houses and appends, for each, the next
//                      NEW_PER_HOUSE highest-vote fragrances that are NOT
//                      already scraped, into queue.json.
//
// Then: `npm run scrape` (existing) picks up the queue as normal.
//
// ---------------------------------------------------------------------------
// TWO WAYS TO PICK HOUSES
//
// `rank:houses` and `discover:top` both read HOUSE_SOURCE:
//
//   HOUSE_SOURCE=all        (default) every Fragrantica brand with at least
//                           HOUSE_MIN_FRAGRANCES releases — about 3,700. This
//                           is the principled option, but Fragrantica blocks
//                           after roughly 100-150 brand-page fetches, so it
//                           needs ~30 sessions. Ranking is by vote mass.
//
//   HOUSE_SOURCE=shortlist  the 360 curated houses in data/house-shortlist.json
//                           (built by `npm run match:shortlist` from
//                           data/house-shortlist-input.json). Two sessions.
//                           Priority is the curated tier order, not vote mass,
//                           because you're taking every house on the list
//                           anyway — the ordering only decides what an
//                           interrupted run leaves you holding.
//                           MAX_TIER=6 drops the ultra-niche tier.
//
// Typical shortlist run:
//   npm run match:shortlist
//   HOUSE_SOURCE=shortlist MAX_TIER=6 npm run rank:houses
//   HOUSE_SOURCE=shortlist MAX_TIER=6 npm run discover:top
//   npm run scrape
//
// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS — three facts about Fragrantica verified 2026-07-28:
//
//  1. `/designers-N.html` (what scrape-fragrantica.ts walked) returns 404 for
//     every N. The real index is `/designers-N/` with a trailing slash, and
//     there are 11 of them, not 26. Because of this, `discover:brands` only
//     ever saw the 120 brands on the `/designers/` root page.
//
//  2. `/designers/` is ALPHABETICAL despite its "Some of The Most Popular
//     Designers" heading.
//
//  3. Brand pages list their fragrances ALPHABETICALLY too. "Top 30 per brand"
//     was actually "first 30 alphabetically". The vote count parsed here is
//     what makes real popularity ordering possible.
//
// Fragrantica exposes no ranked list of houses anywhere, which is why ranking
// has to be computed from vote mass rather than read off a page.
// ---------------------------------------------------------------------------
// PERFORMANCE NOTE (learned the hard way 2026-07-28)
//
// v1 of this file did `page.evaluate(() => fetch(u).then(r => r.text()))` and
// returned the whole HTML to Node. Brand pages for mega-catalogue houses are
// enormous — Avon is 9.1 MB, The Dua Brand larger — and shuttling that through
// CDP froze the renderer past 45 s per house. Combined with a pool ordered by
// fragrance count DESCENDING, the first run spent 69 minutes and completed
// exactly 30 houses: Avon, The Dua Brand, Jequiti, Oriflame, Yves Rocher and
// friends. All slow, none of them anywhere near a popularity top 300.
//
// Two fixes, both load-bearing:
//   • Parse INSIDE the page and return only the compact result array. The page
//     is read as a stream and never materialised as one giant JS string.
//     Avon now takes 7.7 s instead of timing out.
//   • Order the pool so ordinary houses go first and mega-catalogues last, so
//     an interrupted run still leaves you with the houses that matter.
// ---------------------------------------------------------------------------

import "dotenv/config";
import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve("data"); // resolves from CWD — run from scraper/
const HOUSES_FILE = path.join(DATA_DIR, "houses.json");
const RANKED_FILE = path.join(DATA_DIR, "houses-ranked.json");
const HOUSE_FRAG_DIR = path.join(DATA_DIR, "house-fragrances");
const QUEUE_FILE = path.join(DATA_DIR, "queue.json");
const STATE_FILE = path.join(DATA_DIR, "scrape-state.json");
const SHORTLIST_FILE = path.join(DATA_DIR, "house-shortlist.json");

// Where the house list comes from.
//   "all"       every Fragrantica brand with >= HOUSE_MIN_FRAGRANCES (~3,700).
//               Correct in principle, but needs ~30 sessions at Fragrantica's
//               rate limit. Use only if you have days.
//   "shortlist" the curated list in data/house-shortlist.json (~360 houses),
//               produced by `npm run match:shortlist`. Two sessions.
const HOUSE_SOURCE = (process.env.HOUSE_SOURCE ?? "all").toLowerCase();
const USE_SHORTLIST = HOUSE_SOURCE === "shortlist";

// Shortlist tiers 1-6 are the core list; tier 7 is ultra-niche, which carries
// almost no scan volume and resolves to a Fragrantica page less reliably.
// MAX_TIER=6 skips it.
const MAX_TIER = Number(process.env.MAX_TIER ?? 7);

// Only rank houses with at least this many fragrances. Set to 0 to rank all.
const HOUSE_MIN_FRAGRANCES = Number(process.env.HOUSE_MIN_FRAGRANCES ?? 8);

// Houses above this many fragrances are drugstore / MLM / reseller catalogues
// (Avon 1,373 · The Dua Brand 2,034 · Victoria's Secret 1,210 · Jequiti 671).
// They're slow and rarely rank, so they're processed LAST — not excluded, just
// deprioritised, so an interrupted run doesn't burn its whole budget on them.
const MEGA_HOUSE_COUNT = Number(process.env.MEGA_HOUSE_COUNT ?? 600);

const HOUSES_TOP_N = Number(process.env.HOUSES_TOP_N ?? 300);
const NEW_PER_HOUSE = Number(process.env.NEW_PER_HOUSE ?? 10);

// Depth for houses that aren't in the catalogue at all yet (shortlist mode).
//
// A house you already carry only needs a top-up, and its highest-voted
// fragrances are usually scraped already, so "next 10 unseen" often yields 2-3.
// A brand-new house yields its full depth because nothing is scraped, and it's
// the row that actually widens coverage. Same budget buys far more there.
//
// 102 new houses x 25 = ~2,550, versus x10 = ~1,020.
const NEW_HOUSE_DEPTH = Number(process.env.NEW_HOUSE_DEPTH ?? 25);

// House score = sum of votes across its N most-voted fragrances. Summing the
// top slice rather than everything stops mega-catalogue houses from outranking
// Creed (103 releases) on sheer volume.
const HOUSE_SCORE_TOP_N = Number(process.env.HOUSE_SCORE_TOP_N ?? 10);

// Each worker gets its own tab — evaluate() calls on a shared page serialise on
// the renderer, which defeats the point of a worker pool.
//
// Pacing is deliberately conservative: at 3 workers × 400-1200ms Fragrantica
// started returning HTTP 429 after roughly 30 requests. This is ~1 req/s.
const FETCH_CONCURRENCY = Number(process.env.FETCH_CONCURRENCY ?? 2);
const FETCH_DELAY_MIN = Number(process.env.FETCH_DELAY_MIN ?? 1200);
const FETCH_DELAY_MAX = Number(process.env.FETCH_DELAY_MAX ?? 2500);

// 429 handling: pause every worker, back off exponentially, re-queue the house.
const RATE_LIMIT_BACKOFF_MS = Number(process.env.RATE_LIMIT_BACKOFF_MS ?? 30_000);
const RATE_LIMIT_BACKOFF_MAX_MS = Number(process.env.RATE_LIMIT_BACKOFF_MAX_MS ?? 300_000);
const MAX_HOUSE_RETRIES = Number(process.env.MAX_HOUSE_RETRIES ?? 3);

// Circuit breaker. A dead browser or a hard block should stop the run, not log
// 3,600 identical failures.
const MAX_CONSECUTIVE_FAILURES = Number(process.env.MAX_CONSECUTIVE_FAILURES ?? 8);

// Distinguish throttling from a block. Transient throttling recovers after a
// pause; a block does not, and every further request just deepens it. If this
// many rate-limit events happen with NO successful fetch in between, stop.
// Without this the per-house retry budget lets a block burn
// MAX_CONSECUTIVE_FAILURES × MAX_HOUSE_RETRIES events and ~20 minutes of
// accumulated backoff before the run gives up.
const MAX_RATE_LIMITS_WITHOUT_SUCCESS = Number(
  process.env.MAX_RATE_LIMITS_WITHOUT_SUCCESS ?? 4,
);

// Hard ceilings so one pathological page can't stall the run. Both are logged
// when hit — a truncated house must never look like a complete one.
const MAX_HOUSE_MB = Number(process.env.MAX_HOUSE_MB ?? 20);
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS ?? 45_000);

const HEADLESS = (process.env.HEADLESS ?? "false").toLowerCase() === "true";
const ORIGIN = "https://www.fragrantica.com";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () =>
  FETCH_DELAY_MIN + Math.random() * (FETCH_DELAY_MAX - FETCH_DELAY_MIN);

export interface House {
  slug: string;
  url: string;
  count: number; // fragrances in Fragrantica's base, per the index page
}

export interface HouseFragrance {
  url: string;
  votes: number;
  year: number | null;
}

export interface RankedHouse extends House {
  score: number; // sum of votes over the top HOUSE_SCORE_TOP_N fragrances
  totalVotes: number;
  parsed: number;
  capped?: boolean; // page hit MAX_HOUSE_MB — list is incomplete
}

interface HarvestResult {
  ok: boolean;
  error?: string;
  fragrances: HouseFragrance[];
  mb: number;
  capped: boolean;
}

/** A house we'll pull fragrances from, plus whatever we know about its depth. */
interface TargetHouse extends House {
  /** Undefined outside shortlist mode; drives per-house depth in discover:top. */
  inCatalogue?: boolean;
}

/** One row of data/house-shortlist.json, as written by match-shortlist.ts. */
interface ShortlistHouse {
  tier: number;
  name: string;
  slug: string | null;
  url: string | null;
  fragranceCount: number | null;
  inCatalogue: boolean;
}

/**
 * Load the curated shortlist as a House[] pool, dropping rows that never
 * resolved to a Fragrantica slug and rows above MAX_TIER. Preserves the
 * curated order (tier, then hand-ranked position), which is what makes an
 * interrupted run leave you with Dior rather than Hexennacht.
 */
async function loadShortlistPool(): Promise<{
  pool: TargetHouse[];
  skipped: number;
  unmatched: number;
}> {
  let rows: ShortlistHouse[];
  try {
    rows = JSON.parse(await fs.readFile(SHORTLIST_FILE, "utf8"));
  } catch {
    console.error(
      `[pool] ${SHORTLIST_FILE} not found. Run \`npm run match:shortlist\` first ` +
        `(it makes no Fragrantica requests).`,
    );
    process.exit(1);
  }
  const unmatched = rows.filter((r) => !r.slug).length;
  const inTier = rows.filter((r) => r.tier <= MAX_TIER);
  const skipped = rows.length - inTier.length;
  const pool: TargetHouse[] = inTier
    .filter((r): r is ShortlistHouse & { slug: string } => Boolean(r.slug))
    .map((r) => ({
      slug: r.slug,
      url: r.url ?? `${ORIGIN}/designers/${r.slug}.html`,
      count: r.fragranceCount ?? 0,
      inCatalogue: r.inCatalogue,
    }));
  return { pool, skipped, unmatched };
}

// ---------- browser ----------

async function launch(): Promise<{ browser: Browser; newTab: () => Promise<Page> }> {
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
  const newTab = async () => {
    const p = await ctx.newPage();
    // Land on the origin so same-origin fetch() carries a normal session.
    await p.goto(`${ORIGIN}/designers/`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    return p;
  };
  return { browser, newTab };
}

/**
 * Fetch a brand page and parse it ENTIRELY INSIDE the page, returning only the
 * compact fragrance array. The body is consumed as a stream and flushed through
 * the card regex incrementally, so a 9 MB page never becomes a 9 MB JS string
 * and never crosses the CDP boundary.
 *
 * Card shape: "<Name> <Brand> <Year> <Votes>" inside the anchor's own text,
 * e.g. "Beach Hut Man Amouage 2017 666". We take the LAST "<year> <number>"
 * pair — some cards carry a trailing badge, and anchoring to end-of-string
 * silently drops ~9% of them.
 */
async function harvestHouse(page: Page, slug: string): Promise<HarvestResult> {
  return page.evaluate(
    // ⚠ DO NOT declare named inner functions in this callback. tsx compiles it
    // with esbuild's keepNames, which rewrites `const flush = () => {}` into
    // `__name(() => {}, "flush")`. `__name` is a module-scope esbuild helper
    // that does not exist in the page, so the callback dies with a
    // ReferenceError on EVERY house. That is why the parse loop below is
    // inlined rather than factored into a helper. Verified 2026-07-28.
    async ({ slug, capBytes, timeoutMs, origin }) => {
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const r = await fetch(`/designers/${slug}.html`, { signal: ac.signal });
        if (!r.ok || !r.body) {
          return { ok: false, error: `HTTP ${r.status}`, fragrances: [], mb: 0, capped: false };
        }
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        const out: { url: string; year: number | null; votes: number }[] = [];
        const seen = new Set<string>();
        let buf = "";
        let bytes = 0;
        let capped = false;

        for (;;) {
          const chunk = await reader.read();
          if (!chunk.done && chunk.value) {
            bytes += chunk.value.length;
            buf += decoder.decode(chunk.value, { stream: true });
          }
          const overCap = bytes > capBytes;
          const atEnd = chunk.done || overCap;

          if (buf.length > 2_000_000 || atEnd) {
            const parts = buf.split(/<a\s/i);
            // Keep the trailing fragment unless we're done — it may be a
            // half-received anchor that completes in the next chunk.
            buf = atEnd ? "" : (parts.pop() ?? "");
            for (const p of parts) {
              const m = p.match(/href="(\/perfume\/[^"]+?\.html)"/i);
              if (!m) continue;
              const url = origin + m[1];
              if (seen.has(url)) continue;
              const text = p.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
              const pairs = [...text.matchAll(/\b(\d{4})\s+(\d[\d,]*)\b/g)];
              if (pairs.length === 0) continue;
              const last = pairs[pairs.length - 1];
              seen.add(url);
              out.push({
                url,
                year: Number(last[1]),
                votes: Number(last[2].replace(/,/g, "")),
              });
            }
          }

          if (atEnd) {
            if (overCap && !chunk.done) {
              capped = true;
              try {
                await reader.cancel();
              } catch {
                /* already closed */
              }
            }
            break;
          }
        }
        out.sort((a, b) => b.votes - a.votes);
        return {
          ok: true,
          fragrances: out,
          mb: Math.round((bytes / 1048576) * 100) / 100,
          capped,
        };
      } catch (e) {
        const name = e instanceof Error ? e.name : String(e);
        return {
          ok: false,
          error: name === "AbortError" ? "timeout" : name,
          fragrances: [],
          mb: 0,
          capped: false,
        };
      } finally {
        clearTimeout(to);
      }
    },
    {
      slug,
      capBytes: MAX_HOUSE_MB * 1048576,
      timeoutMs: FETCH_TIMEOUT_MS,
      origin: ORIGIN,
    },
  );
}

// ---------- discover:houses ----------

const BRAND_INDEX_COUNT = 11; // /designers-1/ … /designers-11/; 12+ are 404

/** Index rows render as "<name> <count>", e.g. "Amouage 154". */
export function parseHouseIndex(html: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const part of html.split(/<a\s/i)) {
    const m = part.match(/href="\/designers\/([^"/?#]+)\.html"/i);
    if (!m) continue;
    const text = part.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const num = text.match(/(\d[\d,]*)\s*$/);
    const count = num ? Number(num[1].replace(/,/g, "")) : 0;
    const prev = out.get(m[1]);
    if (prev === undefined || count > prev) out.set(m[1], count);
  }
  return out;
}

async function runDiscoverHouses() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  console.log(`[houses] walking ${BRAND_INDEX_COUNT} brand indexes…\n`);
  const { browser, newTab } = await launch();
  const page = await newTab();
  const all = new Map<string, number>();

  try {
    for (let n = 1; n <= BRAND_INDEX_COUNT; n++) {
      const html = await page.evaluate(async (u) => {
        try {
          const r = await fetch(u);
          return r.ok ? await r.text() : null;
        } catch {
          return null;
        }
      }, `/designers-${n}/`);
      if (!html) {
        console.log(`[houses] /designers-${n}/ — no response, skipping`);
        continue;
      }
      const found = parseHouseIndex(html);
      let added = 0;
      for (const [slug, count] of found) {
        if (!all.has(slug)) added++;
        const prev = all.get(slug);
        if (prev === undefined || count > prev) all.set(slug, count);
      }
      console.log(
        `[houses] /designers-${n}/ → ${found.size} brands (+${added} new, total ${all.size})`,
      );
      await sleep(jitter());
    }
  } finally {
    await browser.close();
  }

  const houses: House[] = [...all.entries()]
    .map(([slug, count]) => ({ slug, url: `${ORIGIN}/designers/${slug}.html`, count }))
    .sort((a, b) => b.count - a.count);

  await fs.writeFile(HOUSES_FILE, JSON.stringify(houses, null, 2));
  const eligible = houses.filter((h) => h.count >= HOUSE_MIN_FRAGRANCES).length;
  console.log(`\n[houses] wrote ${houses.length} houses → ${HOUSES_FILE}`);
  console.log(
    `[houses] ${eligible} have >= ${HOUSE_MIN_FRAGRANCES} fragrances (the rank:houses candidate pool)`,
  );
}

// ---------- rank:houses ----------

const safeName = (slug: string) => slug.replace(/[^a-zA-Z0-9._-]/g, "_");

/**
 * Ordinary houses first (by count desc, so Dior / Guerlain / YSL land early),
 * mega-catalogues last. Interrupting the run then costs you Avon, not Dior.
 */
function orderPool(pool: House[]): House[] {
  const normal = pool.filter((h) => h.count <= MEGA_HOUSE_COUNT);
  const mega = pool.filter((h) => h.count > MEGA_HOUSE_COUNT);
  normal.sort((a, b) => b.count - a.count);
  mega.sort((a, b) => a.count - b.count);
  return [...normal, ...mega];
}

async function buildRanking(pool: House[]): Promise<RankedHouse[]> {
  const ranked: RankedHouse[] = [];
  for (const house of pool) {
    const file = path.join(HOUSE_FRAG_DIR, `${safeName(house.slug)}.json`);
    const raw = await fs.readFile(file, "utf8").catch(() => null);
    if (!raw) continue;
    let frags: HouseFragrance[];
    try {
      frags = JSON.parse(raw);
    } catch {
      continue;
    }
    ranked.push({
      ...house,
      score: frags.slice(0, HOUSE_SCORE_TOP_N).reduce((s, f) => s + f.votes, 0),
      totalVotes: frags.reduce((s, f) => s + f.votes, 0),
      parsed: frags.length,
    });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

async function runRankHouses() {
  await fs.mkdir(HOUSE_FRAG_DIR, { recursive: true });

  let pool: House[];
  if (USE_SHORTLIST) {
    // Curated order already encodes priority, so only the mega-catalogue
    // deferral is applied on top of it.
    const { pool: sl, skipped, unmatched } = await loadShortlistPool();
    pool = orderPool(sl);
    console.log(`[rank] source: SHORTLIST (${SHORTLIST_FILE})`);
    console.log(`[rank] ${pool.length} houses, tiers 1-${MAX_TIER}`);
    if (skipped > 0) console.log(`[rank] ${skipped} skipped above tier ${MAX_TIER}`);
    if (unmatched > 0) {
      console.log(
        `[rank] ⚠ ${unmatched} shortlist rows have no Fragrantica slug and are excluded — ` +
          `see data/house-shortlist.md`,
      );
    }
  } else {
    const houses: House[] = JSON.parse(await fs.readFile(HOUSES_FILE, "utf8"));
    pool = orderPool(houses.filter((h) => h.count >= HOUSE_MIN_FRAGRANCES));
    console.log(`[rank] source: ALL Fragrantica brands`);
    console.log(
      `[rank] ${pool.length} candidate houses (>= ${HOUSE_MIN_FRAGRANCES} fragrances) of ${houses.length} total`,
    );
    console.log(
      `[rank]   at Fragrantica's ~100-150 fetches/session limit this needs roughly ` +
        `${Math.ceil(pool.length / 125)} sessions. HOUSE_SOURCE=shortlist needs 2.`,
    );
  }
  const megaCount = pool.filter((h) => h.count > MEGA_HOUSE_COUNT).length;
  console.log(
    `[rank] ${megaCount} mega-catalogues (> ${MEGA_HOUSE_COUNT}) deferred to the end`,
  );
  console.log(`[rank] score = sum of votes over each house's top ${HOUSE_SCORE_TOP_N}\n`);

  const cached = new Set(
    (await fs.readdir(HOUSE_FRAG_DIR).catch(() => [])).map((f) =>
      f.replace(/\.json$/, ""),
    ),
  );
  const todo = pool.filter((h) => !cached.has(safeName(h.slug)));
  console.log(`[rank] ${cached.size} cached, ${todo.length} to fetch\n`);

  const { browser, newTab } = await launch();
  const failures: { slug: string; reason: string }[] = [];
  const cappedHouses: string[] = [];
  const retries = new Map<string, number>();
  let done = 0;
  let checkpointAt = 0;
  let consecutiveFailures = 0;
  let rateLimitsWithoutSuccess = 0;
  let cooldownUntil = 0;
  let backoff = RATE_LIMIT_BACKOFF_MS;
  let aborted: string | null = null;

  try {
    const queue = [...todo];
    const worker = async (id: number) => {
      const page = await newTab();
      while (queue.length > 0 && !aborted) {
        // Shared cooldown — a 429 pauses every worker, not just the one that hit it.
        const wait = cooldownUntil - Date.now();
        if (wait > 0) await sleep(wait);

        const house = queue.shift();
        if (!house) break;
        let res: HarvestResult;
        try {
          res = await harvestHouse(page, house.slug);
        } catch (e) {
          res = {
            ok: false,
            error: e instanceof Error ? e.message.slice(0, 60) : "evaluate failed",
            fragrances: [],
            mb: 0,
            capped: false,
          };
        }

        // Rate limited: back off, re-queue, don't burn the house.
        if (!res.ok && res.error === "HTTP 429") {
          rateLimitsWithoutSuccess++;
          if (rateLimitsWithoutSuccess >= MAX_RATE_LIMITS_WITHOUT_SUCCESS) {
            aborted =
              `rate limited ${rateLimitsWithoutSuccess}× with no successful fetch in between — ` +
              `this is a block, not throttling`;
            queue.unshift(house);
            break;
          }
          const n = (retries.get(house.slug) ?? 0) + 1;
          retries.set(house.slug, n);
          if (n <= MAX_HOUSE_RETRIES) {
            queue.unshift(house);
            cooldownUntil = Date.now() + backoff;
            console.log(
              `[rank] rate limited on ${house.slug} — pausing all workers ${Math.round(backoff / 1000)}s ` +
                `(retry ${n}/${MAX_HOUSE_RETRIES}, ${rateLimitsWithoutSuccess}/${MAX_RATE_LIMITS_WITHOUT_SUCCESS} before abort)`,
            );
            backoff = Math.min(backoff * 2, RATE_LIMIT_BACKOFF_MAX_MS);
            continue;
          }
          // Out of retries — fall through and record it as a real failure.
        }

        // A dead browser produces an identical error for every remaining house.
        // Stop rather than logging thousands of them.
        if (!res.ok && /Target page, context or browser has been closed/i.test(res.error ?? "")) {
          aborted = "browser closed";
          break;
        }

        done++;

        if (!res.ok) {
          failures.push({ slug: house.slug, reason: res.error ?? "unknown" });
          consecutiveFailures++;
          console.log(`[rank] ${done}/${todo.length} ${house.slug} — FAILED (${res.error})`);
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            aborted = `${consecutiveFailures} consecutive failures (last: ${res.error})`;
            break;
          }
          await sleep(jitter());
          continue;
        }

        // A clean result means we're through whatever was blocking us.
        consecutiveFailures = 0;
        rateLimitsWithoutSuccess = 0;
        backoff = RATE_LIMIT_BACKOFF_MS;

        await fs.writeFile(
          path.join(HOUSE_FRAG_DIR, `${safeName(house.slug)}.json`),
          JSON.stringify(res.fragrances),
        );
        if (res.capped) cappedHouses.push(house.slug);
        const score = res.fragrances
          .slice(0, HOUSE_SCORE_TOP_N)
          .reduce((s, f) => s + f.votes, 0);
        console.log(
          `[rank] ${done}/${todo.length} ${house.slug}: ${res.fragrances.length} frags, ` +
            `${res.mb}MB, score ${score}${res.capped ? " ⚠TRUNCATED" : ""}`,
        );

        // Checkpoint so an interrupted run still leaves a usable ranking.
        if (done - checkpointAt >= 100) {
          checkpointAt = done;
          const partial = await buildRanking(pool);
          await fs.writeFile(RANKED_FILE, JSON.stringify(partial, null, 2));
          console.log(`[rank]   … checkpoint: ${partial.length} houses ranked`);
        }
        await sleep(jitter());
      }
      void id;
    };
    await Promise.all(
      Array.from({ length: Math.max(1, FETCH_CONCURRENCY) }, (_, i) => worker(i)),
    );
  } finally {
    await browser.close().catch(() => {});
  }

  const ranked = await buildRanking(pool);
  await fs.writeFile(RANKED_FILE, JSON.stringify(ranked, null, 2));

  if (aborted) {
    console.log(`\n[rank] ✗ ABORTED — ${aborted}`);
    console.log(`[rank]   Progress is saved. Cached houses are skipped on the next run.`);
    if (/block|rate limited/.test(aborted)) {
      console.log(
        `[rank]   Wait several HOURS before retrying — retrying sooner deepens the block and\n` +
          `[rank]   risks the residential IP your main \`npm run scrape\` depends on.`,
      );
      console.log(
        `[rank]   Then shrink the job rather than just slowing it:\n` +
          `[rank]     HOUSE_SOURCE=shortlist MAX_TIER=6 FETCH_CONCURRENCY=1 FETCH_DELAY_MIN=4000 FETCH_DELAY_MAX=8000 npm run rank:houses`,
      );
    }
  }

  console.log(`\n[rank] wrote ${ranked.length} ranked houses → ${RANKED_FILE}`);

  // Coverage must be loud. A ranking built from a fraction of the pool looks
  // exactly like a complete one downstream, which is how a 30-house ranking
  // silently produced a 260-URL queue on the first run.
  const missing = pool.length - ranked.length;
  if (missing > 0) {
    console.log(
      `\n[rank] ⚠ COVERAGE: ${ranked.length}/${pool.length} candidates ranked — ${missing} MISSING.`,
    );
    console.log(`[rank]   Re-run \`npm run rank:houses\` to fetch the rest (cached houses are skipped).`);
    if (failures.length > 0) {
      console.log(`[rank]   ${failures.length} failed this run, first 10:`);
      failures.slice(0, 10).forEach((f) => console.log(`     ${f.slug}: ${f.reason}`));
    }
  } else {
    console.log(`[rank] ✓ coverage complete: ${ranked.length}/${pool.length}`);
  }
  if (cappedHouses.length > 0) {
    console.log(
      `\n[rank] ${cappedHouses.length} houses exceeded ${MAX_HOUSE_MB}MB and were truncated: ` +
        cappedHouses.slice(0, 10).join(", "),
    );
  }

  console.log(`\n[rank] top 20 by vote mass:`);
  ranked.slice(0, 20).forEach((h, i) =>
    console.log(`  ${String(i + 1).padStart(3)}. ${h.slug} — ${h.score}`),
  );
}

// ---------- discover:top ----------

async function readJsonArray<T>(file: string): Promise<T[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Fragrantica URLs vary in trailing slash / protocol; normalise before diffing. */
const norm = (u: string) => u.trim().replace(/^http:/, "https:").replace(/\/+$/, "");

async function runDiscoverTop() {
  // Target houses, in the order we'll take fragrances from.
  let target: TargetHouse[];

  if (USE_SHORTLIST) {
    const { pool, skipped, unmatched } = await loadShortlistPool();
    // Curated order is the priority order. Where a house has already been
    // vote-ranked we keep the curated tier but can report its score.
    target = pool;
    console.log(`[top] source: SHORTLIST, ${target.length} houses (tiers 1-${MAX_TIER})`);
    if (skipped > 0) console.log(`[top] ${skipped} skipped above tier ${MAX_TIER}`);
    if (unmatched > 0) console.log(`[top] ${unmatched} shortlist rows have no slug and are excluded`);

    // Every target house needs a cached fragrance list, or we'd silently
    // under-deliver exactly like the 30-house ranking did.
    const cached = new Set(
      (await fs.readdir(HOUSE_FRAG_DIR).catch(() => [])).map((f) => f.replace(/\.json$/, "")),
    );
    const missing = target.filter((h) => !cached.has(safeName(h.slug)));
    if (missing.length > 0) {
      console.error(
        `\n[top] ✗ ABORTING — ${missing.length}/${target.length} shortlist houses have no cached fragrance list.`,
      );
      console.error(`[top]   You would get roughly ${(target.length - missing.length) * NEW_PER_HOUSE} URLs instead of ${target.length * NEW_PER_HOUSE}.`);
      console.error(`[top]   Finish ranking first:  HOUSE_SOURCE=shortlist npm run rank:houses`);
      console.error(`[top]   First 10 missing: ${missing.slice(0, 10).map((h) => h.slug).join(", ")}`);
      console.error(
        `[top]   Or proceed with what's cached anyway:  ALLOW_PARTIAL=1 HOUSE_SOURCE=shortlist npm run discover:top\n`,
      );
      if (process.env.ALLOW_PARTIAL !== "1") process.exit(1);
      target = target.filter((h) => cached.has(safeName(h.slug)));
      console.log(`[top] ALLOW_PARTIAL=1 — proceeding with ${target.length} cached houses\n`);
    }
  } else {
    const ranked = await readJsonArray<RankedHouse>(RANKED_FILE);
    if (ranked.length === 0) {
      console.error(`[top] ${RANKED_FILE} is empty or missing. Run \`npm run rank:houses\` first.`);
      process.exit(1);
    }

    // Refuse to quietly under-deliver: slicing 300 from a 30-entry ranking is how
    // the first run produced 260 URLs and looked like it had worked.
    if (ranked.length < HOUSES_TOP_N) {
      console.error(
        `\n[top] ✗ ABORTING — the ranking has only ${ranked.length} houses but HOUSES_TOP_N is ${HOUSES_TOP_N}.`,
      );
      console.error(
        `[top]   You would get roughly ${ranked.length * NEW_PER_HOUSE} URLs, not ${HOUSES_TOP_N * NEW_PER_HOUSE}.`,
      );
      console.error(`[top]   Finish ranking first:  npm run rank:houses`);
      console.error(
        `[top]   Or accept the smaller set:  HOUSES_TOP_N=${ranked.length} npm run discover:top\n`,
      );
      process.exit(1);
    }
    target = ranked.slice(0, HOUSES_TOP_N);
    console.log(`[top] source: global vote ranking, top ${target.length} of ${ranked.length} houses`);
  }

  const queue = await readJsonArray<string>(QUEUE_FILE);
  let completed: string[] = [];
  try {
    const state = JSON.parse(await fs.readFile(STATE_FILE, "utf8"));
    completed = Array.isArray(state.completed) ? state.completed : [];
  } catch {
    /* no state yet */
  }

  const have = new Set([...queue, ...completed].map(norm));
  console.log(
    `[top] queue=${queue.length} completed=${completed.length} distinct=${have.size}`,
  );
  const fresh = target.filter((h) => h.inCatalogue === false).length;
  if (USE_SHORTLIST && fresh > 0) {
    console.log(
      `[top] depth: ${NEW_PER_HOUSE} per existing house, ${NEW_HOUSE_DEPTH} per NEW house ` +
        `(${fresh} new, ${target.length - fresh} existing)`,
    );
    console.log(
      `[top] ceiling: ~${fresh * NEW_HOUSE_DEPTH + (target.length - fresh) * NEW_PER_HOUSE} URLs ` +
        `before dedupe against what's already scraped\n`,
    );
  } else {
    console.log(
      `[top] taking the next ${NEW_PER_HOUSE} unseen fragrances from each of ${target.length} houses\n`,
    );
  }

  const added: string[] = [];
  const shortfall: { slug: string; got: number; want: number }[] = [];
  let fromNew = 0;

  for (const house of target) {
    // A house with nothing in the catalogue gets full depth; one we already
    // carry gets a top-up. `inCatalogue` is only set in shortlist mode.
    const want = house.inCatalogue === false ? NEW_HOUSE_DEPTH : NEW_PER_HOUSE;
    const frags = await readJsonArray<HouseFragrance>(
      path.join(HOUSE_FRAG_DIR, `${safeName(house.slug)}.json`),
    );
    const picks: string[] = [];
    for (const f of frags) {
      if (picks.length >= want) break;
      const u = norm(f.url);
      if (have.has(u)) continue;
      have.add(u);
      picks.push(f.url);
    }
    added.push(...picks);
    if (house.inCatalogue === false) fromNew += picks.length;
    if (picks.length < want) shortfall.push({ slug: house.slug, got: picks.length, want });
  }

  await fs.writeFile(QUEUE_FILE, JSON.stringify([...queue, ...added], null, 2));

  console.log(`[top] +${added.length} new URLs`);
  if (USE_SHORTLIST && fresh > 0) {
    console.log(
      `[top]   ${fromNew} from houses new to the catalogue, ${added.length - fromNew} topping up existing ones`,
    );
  }
  console.log(`[top] queue is now ${queue.length + added.length} URLs → ${QUEUE_FILE}`);
  if (shortfall.length > 0) {
    const empty = shortfall.filter((s) => s.got === 0).length;
    console.log(
      `\n[top] ${shortfall.length} houses came up short (${empty} yielded none — already scraped deep, or a small catalogue):`,
    );
    shortfall.slice(0, 25).forEach((s) => console.log(`   ${s.slug}: ${s.got}/${s.want}`));
    if (shortfall.length > 25) console.log(`   …and ${shortfall.length - 25} more`);
  }
  console.log(`\n[top] next: npm run scrape`);
}

// ---------- entrypoint ----------

const cmd = process.argv[2];

(async () => {
  if (cmd === "discover:houses") await runDiscoverHouses();
  else if (cmd === "rank:houses") await runRankHouses();
  else if (cmd === "discover:top") await runDiscoverTop();
  else {
    console.error(
      "usage:\n" +
        "  tsx src/discover-houses.ts discover:houses   (harvest all ~8,041 brands + counts)\n" +
        "  tsx src/discover-houses.ts rank:houses       (fetch brand pages, rank by vote mass)\n" +
        "  tsx src/discover-houses.ts discover:top      (append next-N-unseen per house to queue)\n" +
        "\n" +
        "env:\n" +
        "  HOUSE_SOURCE=all|shortlist   all = ~3,700 brands (~30 sessions), shortlist = 360 (2 sessions)\n" +
        "  MAX_TIER=1..7                shortlist only; 6 drops the ultra-niche tier\n" +
        "  NEW_PER_HOUSE=10             how many unseen fragrances to take per house\n" +
        "  ALLOW_PARTIAL=1              discover:top only; proceed on an incomplete ranking",
    );
    process.exit(1);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

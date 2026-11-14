// Crawl FragranceNet's full "Top Sellers" listing and record, for every
// catalog fragrance with a FragranceNet offer, its bestseller position,
// review count and rating. Input to popularity v2 (rank-popularity-v2.ts).
//
// WHAT THE LISTING HAS (checked live 12 Nov 2026)
//   https://www.fragrancenet.com/fragrances?page=N is sorted by Top Sellers
//   ("sortParam": "pop") by default: ~19,100 products, 24 per page, ~797
//   pages. Each page's __NEXT_DATA__ (props.pageProps.pageData) carries
//     results[]   { sku, brand (product name), description (strength),
//                   designer, productPath, rating {count, score},
//                   isTopSeller, isTrending, price, section }
//     pagination  { currentPageNum, numOfPages, numOfResults }
//     sortOptions [{ sortParam: "pop", isActive: true }, ...]
//   position = (page - 1) * 24 + index + 1, so 1 = FragranceNet's best seller.
//
// MATCHING
//   Catalog fragrance -> its fragrance_offers row (retailer FragranceNet).
//   1. path (primary): the cached product page's final_url path equals the
//      listing's productPath ("cologne/christian-dior/dior-sauvage/edt").
//      Needs the product page in data/fragrancenet/pages/, so finish
//      `pnpm scrape:fragrancenet` (fetch) first for full coverage.
//   2. sku (bonus): FragranceNet numbers each SIZE. The listing carries the
//      product's default size sku (Sauvage EDT: 283046); the offer link ends
//      in whichever size the feed picked, so this only hits when they agree.
//   A fragrance matching several products keeps the best position.
//
// SAFE BY DEFAULT
//   * Dry run unless --write. Writes only popularity_snapshots and
//     fragrance_popularity_signals (migration 0045). Never touches
//     fragrances.popularity_rank.
//   * Pages are cached in data/fragrancenet/bestsellers/<snapshot>/, so a
//     stopped crawl resumes. The listing reshuffles daily, so a snapshot is
//     one date; a new day starts a new snapshot unless --snapshot= is given.
//   * Coverage gate: --write refuses unless >= 98% of pages are cached and
//     every cached page was sorted by Top Sellers.
//
// Usage (run from scraper/):
//   pnpm scrape:fragrancenet-bestsellers --pages=5         # pilot crawl, dry report
//   pnpm scrape:fragrancenet-bestsellers                   # full crawl (~60 min), dry report
//   pnpm scrape:fragrancenet-bestsellers --no-fetch        # report from cache only
//   pnpm scrape:fragrancenet-bestsellers --no-fetch --write
//   flags: --snapshot=YYYY-MM-DD (reuse a cache)  --refresh (refetch cached pages)
//   env:   HEADLESS=true|false (default false)  FN_DELAY_MIN / FN_DELAY_MAX (s, default 3 / 6)

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  matchProducts,
  normalizePath,
  parseListing,
  skuFromUrl,
  unwrapOfferUrl,
  type CachedListingPage,
} from "./popularity-v2-core";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];

const WRITE = flag("write");
const NO_FETCH = flag("no-fetch");
const REFRESH = flag("refresh");
const PAGE_LIMIT = opt("pages") ? Number(opt("pages")) : Infinity;
const SNAPSHOT = opt("snapshot") ?? new Date().toISOString().slice(0, 10);
const HEADLESS = (process.env.HEADLESS ?? "false").toLowerCase() === "true";
const DELAY_MIN = Number(process.env.FN_DELAY_MIN ?? 3);
const DELAY_MAX = Number(process.env.FN_DELAY_MAX ?? 6);

const ORIGIN = "https://www.fragrancenet.com";
const LISTING = "/fragrances";
const MIN_COVERAGE = 0.98;
const GAP_REPORT_TOP = 2000;
const SOURCE = "fragrancenet";

const CACHE_DIR = path.resolve("data/fragrancenet/bestsellers", SNAPSHOT);
const PRODUCT_CACHE_DIR = path.resolve("data/fragrancenet/pages");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabase: SupabaseClient<any, "public", any>;

// Types and pure helpers live in popularity-v2-core.ts.
interface Offer {
  fragrance_id: string;
  name: string;
  house: string;
  popularity_rank: number | null;
  product_url: string;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const pagePath = (n: number) => path.join(CACHE_DIR, `page-${String(n).padStart(4, "0")}.json`);

async function readPage(n: number): Promise<CachedListingPage | null> {
  try {
    return JSON.parse(await fs.readFile(pagePath(n), "utf8")) as CachedListingPage;
  } catch {
    return null;
  }
}

async function readAllPages(): Promise<CachedListingPage[]> {
  let names: string[] = [];
  try {
    names = (await fs.readdir(CACHE_DIR)).filter((f) => /^page-\d+\.json$/.test(f)).sort();
  } catch {
    return [];
  }
  const out: CachedListingPage[] = [];
  for (const f of names) out.push(JSON.parse(await fs.readFile(path.join(CACHE_DIR, f), "utf8")));
  return out;
}

// ---------------------------------------------------------------------------
// Crawl
// ---------------------------------------------------------------------------
// Each listing page is a real navigation (page.goto), the same path the
// product-page scraper uses successfully. The first version used an in-page
// fetch() and failed on page 1 with "TypeError: Failed to fetch" (12 Nov):
// an in-flight fetch is aborted when the page navigates or redirects under
// it, so it is not used here. page.evaluate callbacks are inline arrows on
// purpose: named inner functions break under tsx
// (see reference_tsx_playwright_evaluate).

async function fetchListingPageOnce(page: Page, n: number): Promise<CachedListingPage> {
  const base = { fetched_at: new Date().toISOString(), error: null as string | null };
  try {
    // Page 1 must be the bare listing: FragranceNet redirects ?page=1 in a
    // loop (ERR_TOO_MANY_REDIRECTS, seen 13 Nov 2026, also in a normal browser).
    const listingUrl = n === 1 ? `${ORIGIN}${LISTING}` : `${ORIGIN}${LISTING}?page=${n}`;
    const resp = await page.goto(listingUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const status = resp?.status() ?? null;
    if (status && status >= 400) return { ...parseListing(null, n), ...base, error: `HTTP ${status}` };
    const json = await page.evaluate(() => document.getElementById("__NEXT_DATA__")?.textContent ?? null);
    const parsed = parseListing(json, n);
    if (parsed.products.length === 0) return { ...parsed, ...base, error: `no products in __NEXT_DATA__ (landed on ${page.url()})` };
    if (parsed.sort !== "pop") return { ...parsed, ...base, error: `listing not sorted by Top Sellers (sort=${parsed.sort})` };
    return { ...parsed, ...base };
  } catch (e) {
    return { ...parseListing(null, n), ...base, error: e instanceof Error ? e.message.split("\n")[0] : String(e) };
  }
}

/** One retry after a pause, so a single hiccup does not cost a page. */
async function fetchListingPage(page: Page, n: number): Promise<CachedListingPage> {
  const first = await fetchListingPageOnce(page, n);
  if (!first.error) return first;
  await new Promise((r) => setTimeout(r, 10_000));
  return fetchListingPageOnce(page, n);
}

async function crawl(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: HEADLESS, args: ["--disable-blink-features=AutomationControlled"] });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });
  // String, not a function (tsx __name issue).
  await ctx.addInitScript('Object.defineProperty(navigator, "webdriver", { get: function () { return false; } });');
  await ctx.route("**/*", (route) => {
    const type = route.request().resourceType();
    return type === "image" || type === "font" || type === "media" ? route.abort() : route.continue();
  });
  const page = await ctx.newPage();
  try {
    // Page 1 gives the page count.
    let first = await readPage(1);
    if (!first || first.error || REFRESH) {
      first = await fetchListingPage(page, 1);
      await fs.writeFile(pagePath(1), JSON.stringify(first, null, 2));
    }
    if (first.error || !first.num_of_pages) {
      console.error(`  ⚠ page 1 failed (${first.error ?? "no page count"}); stopping.`);
      return;
    }
    const total = Math.min(first.num_of_pages, PAGE_LIMIT);
    console.log(`  listing: ${first.num_of_results} products on ${first.num_of_pages} pages; crawling ${total}`);

    let consecutiveErrors = 0;
    for (let n = 2; n <= total; n++) {
      const cached = await readPage(n);
      if (cached && !cached.error && !REFRESH) continue;
      const rec = await fetchListingPage(page, n);
      await fs.writeFile(pagePath(n), JSON.stringify(rec, null, 2));
      if (rec.error) consecutiveErrors++;
      else consecutiveErrors = 0;
      console.log(`  [${n}/${total}] ${rec.error ? `ERROR ${rec.error}` : `${rec.products.length} products`}`);
      if (consecutiveErrors >= 5) {
        console.error("\n  ⚠ 5 errors in a row; stopping so a block is not hammered. Re-run to resume.");
        break;
      }
      const wait = (DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN)) * 1000;
      await new Promise((r) => setTimeout(r, wait));
    }
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

async function loadOffers(): Promise<Offer[]> {
  const out: Offer[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("fragrance_offers")
      .select("product_url, fragrance:fragrances(id, name, house, popularity_rank)")
      .ilike("retailer", "fragrancenet")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`[bestsellers] offers query failed: ${error.message}`);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of data as any[]) {
      if (!r.fragrance) continue;
      out.push({
        fragrance_id: r.fragrance.id,
        name: r.fragrance.name,
        house: r.fragrance.house,
        popularity_rank: r.fragrance.popularity_rank,
        product_url: r.product_url,
      });
    }
    if (data.length < PAGE) break;
  }
  return out;
}

/** Skus and paths for one offer, from the offer link and the cached product page. */
async function keysFor(o: Offer): Promise<{ fragrance_id: string; skus: string[]; paths: string[] }> {
  const skus = new Set<string>();
  const paths = new Set<string>();
  const unwrapped = unwrapOfferUrl(o.product_url);
  const s1 = skuFromUrl(unwrapped);
  if (s1) skus.add(s1);
  try {
    const c = JSON.parse(await fs.readFile(path.join(PRODUCT_CACHE_DIR, `${o.fragrance_id}.json`), "utf8"));
    const s2 = skuFromUrl(c.final_url ?? null);
    if (s2) skus.add(s2);
    const s3 = skuFromUrl(c.requested_url ?? null);
    if (s3) skus.add(s3);
    const p = normalizePath(c.final_url ?? null);
    if (p) paths.add(p);
  } catch {
    /* no cached product page: sku from the offer link only */
  }
  return { fragrance_id: o.fragrance_id, skus: [...skus], paths: [...paths] };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[k]) {
      console.error(`[bestsellers] missing ${k} in scraper/.env`);
      process.exit(1);
    }
  }
  supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  console.log("--- Spritz: FragranceNet Top Sellers ---");
  console.log(`  snapshot: ${SNAPSHOT}   mode: ${WRITE ? "WRITE signals" : "dry run (no DB writes)"}${NO_FETCH ? ", cache only" : ""}\n`);

  if (!NO_FETCH) await crawl();

  // ---- coverage ----
  const pages = await readAllPages();
  const good = pages.filter((p) => !p.error && p.sort === "pop" && p.products.length > 0);
  const totalPages = Math.max(0, ...pages.map((p) => p.num_of_pages ?? 0));
  const coverage = totalPages ? good.length / totalPages : 0;
  const products = good.flatMap((p) => p.products);
  const totalListed = Math.max(0, ...pages.map((p) => p.num_of_results ?? 0));
  console.log(`\n  coverage: ${good.length}/${totalPages} pages (${(coverage * 100).toFixed(1)}%), ${products.length} products`);

  // ---- match ----
  const offers = await loadOffers();
  const keys = await Promise.all(offers.map(keysFor));
  const matches = matchProducts(keys, products);
  const matchedIds = new Set(matches.map((m) => m.fragrance_id));
  const bySku = matches.filter((m) => m.method === "sku").length;
  const matchedSkus = new Set(matches.map((m) => m.product.sku));
  const unmatchedOffers = offers.filter((o) => !matchedIds.has(o.fragrance_id));
  const gaps = products
    .filter((p) => p.position <= GAP_REPORT_TOP && !matchedSkus.has(p.sku))
    .map((p) => ({ position: p.position, designer: p.designer, name: p.name, description: p.description, review_count: p.review_count, product_path: p.product_path }));

  console.log(`  offers:   ${offers.length} catalog fragrances with a FragranceNet offer`);
  console.log(`  matched:  ${matches.length} (${bySku} by sku, ${matches.length - bySku} by path)`);
  console.log(`  no match: ${unmatchedOffers.length} (product not in the crawled pages, or URL without a product number)`);
  console.log(`  gaps:     ${gaps.length} of FragranceNet's top ${GAP_REPORT_TOP} not linked to any catalog fragrance`);

  const sorted = [...matches].sort((a, b) => a.product.position - b.product.position);
  console.log("\n  top 25 matched:");
  const offerById = new Map(offers.map((o) => [o.fragrance_id, o]));
  for (const m of sorted.slice(0, 25)) {
    const o = offerById.get(m.fragrance_id)!;
    console.log(`    #${String(m.product.position).padEnd(5)} ${o.house} - ${o.name}   (${m.product.review_count ?? 0} reviews, old rank ${o.popularity_rank ?? "-"})`);
  }

  // ---- write ----
  let written = 0;
  let writeError: string | null = null;
  if (WRITE) {
    if (coverage < MIN_COVERAGE) {
      console.error(`\n  ⚠ REFUSING TO WRITE: coverage ${(coverage * 100).toFixed(1)}% < ${MIN_COVERAGE * 100}%. Re-run to resume the crawl.`);
    } else {
      const { error: snapErr } = await supabase.from("popularity_snapshots").upsert(
        {
          source: SOURCE,
          snapshot_date: SNAPSHOT,
          pages_total: totalPages,
          pages_fetched: good.length,
          products_listed: products.length,
          coverage: Number(coverage.toFixed(4)),
        },
        { onConflict: "source,snapshot_date" },
      );
      if (snapErr) writeError = `snapshot: ${snapErr.message}`;
      for (let i = 0; !writeError && i < matches.length; i += 500) {
        const chunk = matches.slice(i, i + 500).map((m) => ({
          fragrance_id: m.fragrance_id,
          source: SOURCE,
          snapshot_date: SNAPSHOT,
          sku: m.product.sku,
          product_path: m.product.product_path,
          position: m.product.position,
          total_listed: totalListed || products.length,
          review_count: m.product.review_count,
          rating: m.product.rating,
          is_top_seller: m.product.is_top_seller,
          is_trending: m.product.is_trending,
          match_method: m.method,
        }));
        const { error } = await supabase
          .from("fragrance_popularity_signals")
          .upsert(chunk, { onConflict: "fragrance_id,source,snapshot_date" });
        if (error) writeError = `signals: ${error.message}`;
        else written += chunk.length;
      }
      console.log(writeError ? `\n  ⚠ write failed: ${writeError}` : `\n  written: ${written} signal rows for snapshot ${SNAPSHOT}`);
    }
  }

  const outFile = path.resolve(
    `data/fragrancenet-bestsellers-${WRITE ? "write" : "dry"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  await fs.writeFile(
    outFile,
    JSON.stringify(
      {
        snapshot: SNAPSHOT,
        coverage: { pages_good: good.length, pages_total: totalPages, ratio: coverage, products: products.length },
        counts: { offers: offers.length, matched: matches.length, by_sku: bySku, by_path: matches.length - bySku, unmatched: unmatchedOffers.length, written },
        write_error: writeError,
        matched: sorted.map((m) => ({ ...offerById.get(m.fragrance_id), method: m.method, ...m.product })),
        unmatched_offers: unmatchedOffers,
        catalog_gaps_top: gaps,
      },
      null,
      2,
    ),
  );
  console.log(`\n  report: ${path.relative(process.cwd(), outFile)}`);
  if (coverage < MIN_COVERAGE) console.log(`  ⚠ COVERAGE ${(coverage * 100).toFixed(1)}%: partial snapshot, not usable for ranking yet.`);
  else if (!WRITE) console.log(`  Coverage OK. Apply with --no-fetch --write --snapshot=${SNAPSHOT}`);
}

if (process.argv[1] && /scrape-fragrancenet-bestsellers\.(ts|js|mjs)$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

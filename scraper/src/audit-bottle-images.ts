// Sweep every bottle_image_url and null the ones that are actually dead.
//
// Why: images are HOTLINKED to retailer CDNs (that's the licence — display
// while promoting them, not redistribution). Those URLs rot silently when a
// retailer reorganises its CDN, delists a product, or ends a partnership.
// The app degrades gracefully now (components/bottle-image.tsx falls back to
// the placeholder on error), but the DB still claims coverage it doesn't
// have, which makes every coverage number a lie and stops the backfill from
// retrying those rows against a newer feed.
//
// Conservative by design: a URL is only nulled on a DEFINITIVE dead
// response (404 / 410). Timeouts, 5xx, rate limits and network blips are
// counted and reported but left alone — a CDN having a bad minute must not
// cost you thousands of working images. Re-run later and genuinely dead
// links will fail consistently.
//
// Usage:
//   cd scraper
//   pnpm audit:images --dry            # report only, no writes  <- start here
//   pnpm audit:images                  # null the confirmed-dead ones
//
// Flags:
//   --dry              report only
//   --limit=N          check only the first N (smoke test)
//   --concurrency=N    parallel requests, default 8
//   --host=substring   only check URLs containing this (e.g. --host=fimgs.net)
//   --browser          re-check every 403 through a real Chromium with the
//                      APP's referer (the exact request a visitor's browser
//                      makes). A 403 that survives that is hotlink protection:
//                      the image is dead for users even though the URL "works"
//                      in a tab. Reported as `hotlink-blocked`.
//   --forbidden-is-dead  null hotlink-blocked rows too (needs --browser).
//                      Refuses to null more than 20% of what it checked unless
//                      --force is also passed — a false positive here would
//                      wipe the catalog's images.
//
// Why 403 matters (Aug 2026): fragranceshop.com serves its product images to
// its own pages but 403s anything else, including our <img> tags. Those rows
// showed placeholders in the app while the DB still claimed an image. Run:
//   pnpm audit:images --host=fragranceshop.com --browser --dry
//   pnpm audit:images --host=fragranceshop.com --browser --forbidden-is-dead
// then `pnpm backfill:images` to refill them from another feed.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const LIMIT = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0");
const CONCURRENCY = Math.max(
  1,
  Number(args.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? "8"),
);
const HOST_FILTER = args.find((a) => a.startsWith("--host="))?.split("=")[1];
const BROWSER = args.includes("--browser");
const FORBIDDEN_IS_DEAD = args.includes("--forbidden-is-dead");
const FORCE = args.includes("--force");
// The referer a real visitor's browser sends when the app hotlinks an image.
const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL ?? "https://spritzofficial.app").replace(/\/$/, "");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const TIMEOUT_MS = 12_000;

if (FORBIDDEN_IS_DEAD && !BROWSER) {
  console.error("--forbidden-is-dead requires --browser (a Node 403 alone is not proof of death)");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

interface Row {
  id: string;
  name: string;
  house: string;
  bottle_image_url: string;
}

type Verdict = "ok" | "dead" | "unknown" | "hotlink-blocked";

interface CheckResult {
  verdict: Verdict;
  status: number | null;
  note: string;
}

/**
 * HEAD first (cheap), falling back to a 1-byte ranged GET. Some CDNs answer
 * 405/403 to HEAD while serving GET perfectly well, so treating a HEAD
 * failure as death would delete good images.
 */
async function checkUrl(url: string): Promise<CheckResult> {
  const attempt = async (method: "HEAD" | "GET"): Promise<CheckResult> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        signal: ctrl.signal,
        redirect: "follow",
        headers: {
          // Some CDNs 403 unknown agents.
          "user-agent":
            "Mozilla/5.0 (compatible; SpritzImageAudit/1.0; +https://spritzofficial.app)",
          ...(method === "GET" ? { range: "bytes=0-0" } : {}),
        },
      });
      if (res.status === 404 || res.status === 410) {
        return { verdict: "dead", status: res.status, note: "not found" };
      }
      if (res.ok || res.status === 206 || res.status === 304) {
        return { verdict: "ok", status: res.status, note: "" };
      }
      // 403 / 405 on HEAD is common and not proof of death.
      return { verdict: "unknown", status: res.status, note: `http ${res.status}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        verdict: "unknown",
        status: null,
        note: msg.includes("abort") ? "timeout" : msg.slice(0, 60),
      };
    } finally {
      clearTimeout(timer);
    }
  };

  const head = await attempt("HEAD");
  if (head.verdict !== "unknown") return head;
  // HEAD was inconclusive — confirm with a ranged GET before judging.
  const get = await attempt("GET");
  if (get.status === 403 && BROWSER) return browserCheck(url);
  return get;
}

// ---------------------------------------------------------------------------
// Real-browser re-check for 403s. Uses Chromium's network stack (so TLS
// fingerprint bot walls don't confuse the verdict) and sends the APP's
// origin as Referer, which is exactly what a visitor's <img> request looks
// like. If THAT gets a 403, the image is hotlink-protected and every user
// sees the placeholder. Uses context.request, no page.evaluate (tsx
// keepNames gotcha).
// ---------------------------------------------------------------------------
let browser: import("playwright").Browser | null = null;
let browserCtx: import("playwright").BrowserContext | null = null;

async function browserCheck(url: string): Promise<CheckResult> {
  try {
    if (!browserCtx) {
      const { chromium } = await import("playwright");
      browser = await chromium.launch({ headless: process.env.AUDIT_HEADED !== "1" });
      browserCtx = await browser.newContext({ userAgent: UA, locale: "en-US" });
    }
    const res = await browserCtx.request.get(url, {
      headers: {
        Referer: `${APP_ORIGIN}/`,
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "cross-site",
      },
      timeout: 20_000,
      maxRedirects: 5,
    });
    const status = res.status();
    if (status === 403) return { verdict: "hotlink-blocked", status, note: "403 in a browser with the app referer" };
    if (status === 404 || status === 410) return { verdict: "dead", status, note: "not found" };
    if (res.ok()) {
      const mime = res.headers()["content-type"] ?? "";
      if (!mime.startsWith("image/")) return { verdict: "hotlink-blocked", status, note: `served ${mime || "non-image"}` };
      return { verdict: "ok", status, note: "browser ok" };
    }
    return { verdict: "unknown", status, note: `browser http ${status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Executable doesn't exist|npx playwright install/i.test(msg)) {
      console.error("  ! Playwright Chromium not installed — run `npx playwright install chromium` in scraper/");
      process.exit(1);
    }
    return { verdict: "unknown", status: null, note: `browser: ${msg.slice(0, 60)}` };
  }
}

async function closeBrowser(): Promise<void> {
  await browserCtx?.close().catch(() => {});
  await browser?.close().catch(() => {});
}

/** Run tasks with a fixed worker pool. */
async function pool<T>(items: T[], n: number, worker: (item: T) => Promise<void>) {
  let i = 0;
  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in scraper/.env");
    process.exit(1);
  }

  console.log("--- Bottle image audit ---");
  if (DRY) console.log("  (dry run — nothing will be written)");
  console.log(`  concurrency: ${CONCURRENCY}`);
  if (HOST_FILTER) console.log(`  host filter: ${HOST_FILTER}`);

  // Page through every row that claims to have an image.
  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("fragrances")
      .select("id, name, house, bottle_image_url")
      .not("bottle_image_url", "is", null)
      .order("id")
      .range(from, from + PAGE - 1)
      .returns<Row[]>();
    if (error) {
      console.error("Supabase query failed:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  let targets = rows.filter((r) => r.bottle_image_url);
  if (HOST_FILTER) targets = targets.filter((r) => r.bottle_image_url.includes(HOST_FILTER));
  if (LIMIT) targets = targets.slice(0, LIMIT);

  console.log(`  rows with an image URL: ${rows.length}`);
  console.log(`  checking: ${targets.length}\n`);

  const byHost = new Map<string, { ok: number; dead: number; unknown: number; "hotlink-blocked": number }>();
  const dead: Row[] = [];
  const blocked: Row[] = [];
  let ok = 0;
  let unknown = 0;
  let done = 0;

  try {
    await pool(targets, CONCURRENCY, async (row) => {
      const res = await checkUrl(row.bottle_image_url);
      let host = "?";
      try {
        host = new URL(row.bottle_image_url).host;
      } catch {
        /* malformed URL — counts under "?" */
      }
      const bucket = byHost.get(host) ?? { ok: 0, dead: 0, unknown: 0, "hotlink-blocked": 0 };
      bucket[res.verdict]++;
      byHost.set(host, bucket);

      if (res.verdict === "dead") {
        dead.push(row);
        if (dead.length <= 20) {
          console.log(`  ✗ ${row.house} — ${row.name}  (${res.status})`);
        }
      } else if (res.verdict === "hotlink-blocked") {
        blocked.push(row);
        if (blocked.length <= 10) {
          console.log(`  ⊘ ${row.house} — ${row.name}  (${res.note})`);
        }
      } else if (res.verdict === "unknown") {
        unknown++;
      } else {
        ok++;
      }

      done++;
      if (done % 250 === 0) {
        console.log(`  … ${done}/${targets.length} checked (${dead.length} dead, ${blocked.length} hotlink-blocked so far)`);
      }
    });
  } finally {
    await closeBrowser();
  }

  console.log("");
  console.log("--- Results ---");
  console.log(`  ok               ${ok}`);
  console.log(`  dead             ${dead.length}   (404/410 — will be nulled)`);
  console.log(
    `  hotlink-blocked  ${blocked.length}   (403 in a real browser with the app referer — users see the placeholder${
      FORBIDDEN_IS_DEAD ? "; will be nulled" : "; pass --forbidden-is-dead to null"
    })`,
  );
  console.log(`  unknown          ${unknown}   (timeout/5xx${BROWSER ? "" : "/403 — add --browser to settle the 403s"} — LEFT ALONE, re-run later)`);
  console.log("");
  console.log("  by host:");
  for (const [host, b] of [...byHost.entries()].sort((a, z) => z[1].dead + z[1]["hotlink-blocked"] - (a[1].dead + a[1]["hotlink-blocked"]))) {
    console.log(
      `    ${host.padEnd(34)} ok=${String(b.ok).padStart(5)}  dead=${String(b.dead).padStart(5)}  blocked=${String(b["hotlink-blocked"]).padStart(5)}  unknown=${String(b.unknown).padStart(4)}`,
    );
  }

  const toClear = FORBIDDEN_IS_DEAD ? [...dead, ...blocked] : dead;

  if (DRY) {
    console.log(`\n  Dry run — no changes written. Re-run without --dry to null ${toClear.length} rows.`);
    return;
  }
  if (toClear.length === 0) {
    console.log("\n  Nothing to clear.");
    return;
  }
  // Guard against a systemic false positive (a CDN having a bad hour, the
  // app referer tripping a rule on the host that carries most of the
  // catalog). Nulling 20%+ of what was checked is a decision, not a chore.
  if (FORBIDDEN_IS_DEAD && targets.length > 0 && blocked.length / targets.length > 0.2 && !FORCE) {
    console.log(
      `\n  ! ${blocked.length} of ${targets.length} checked rows (${Math.round((100 * blocked.length) / targets.length)}%) came back hotlink-blocked.` +
        ` That's too many to null on autopilot. Narrow with --host=<confirmed host>, or re-run with --force if you've verified the placeholders in the app.`,
    );
    return;
  }
  dead.length = 0;
  dead.push(...toClear);

  // Null the dead ones in batches so the next backfill treats them as
  // needing an image again.
  let cleared = 0;
  const IDS = 200;
  for (let i = 0; i < dead.length; i += IDS) {
    const batch = dead.slice(i, i + IDS).map((r) => r.id);
    const { error } = await supabase
      .from("fragrances")
      .update({ bottle_image_url: null })
      .in("id", batch);
    if (error) {
      console.warn(`  ! failed to clear a batch: ${error.message}`);
    } else {
      cleared += batch.length;
    }
  }
  console.log(`\n  cleared ${cleared} image URLs (dead + hotlink-blocked).`);
  console.log("  Re-run `pnpm backfill:images` against your feeds to refill them.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

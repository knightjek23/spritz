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

const TIMEOUT_MS = 12_000;

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

type Verdict = "ok" | "dead" | "unknown";

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
  return attempt("GET");
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

  const byHost = new Map<string, { ok: number; dead: number; unknown: number }>();
  const dead: Row[] = [];
  let ok = 0;
  let unknown = 0;
  let done = 0;

  await pool(targets, CONCURRENCY, async (row) => {
    const res = await checkUrl(row.bottle_image_url);
    let host = "?";
    try {
      host = new URL(row.bottle_image_url).host;
    } catch {
      /* malformed URL — counts under "?" */
    }
    const bucket = byHost.get(host) ?? { ok: 0, dead: 0, unknown: 0 };
    bucket[res.verdict]++;
    byHost.set(host, bucket);

    if (res.verdict === "dead") {
      dead.push(row);
      if (dead.length <= 20) {
        console.log(`  ✗ ${row.house} — ${row.name}  (${res.status})`);
      }
    } else if (res.verdict === "unknown") {
      unknown++;
    } else {
      ok++;
    }

    done++;
    if (done % 250 === 0) {
      console.log(`  … ${done}/${targets.length} checked (${dead.length} dead so far)`);
    }
  });

  console.log("");
  console.log("--- Results ---");
  console.log(`  ok        ${ok}`);
  console.log(`  dead      ${dead.length}   (404/410 — will be nulled)`);
  console.log(`  unknown   ${unknown}   (timeout/5xx/403 — LEFT ALONE, re-run later)`);
  console.log("");
  console.log("  by host:");
  for (const [host, b] of [...byHost.entries()].sort((a, z) => z[1].dead - a[1].dead)) {
    console.log(
      `    ${host.padEnd(34)} ok=${String(b.ok).padStart(5)}  dead=${String(b.dead).padStart(5)}  unknown=${String(b.unknown).padStart(4)}`,
    );
  }

  if (DRY) {
    console.log("\n  Dry run — no changes written. Re-run without --dry to null the dead ones.");
    return;
  }
  if (dead.length === 0) {
    console.log("\n  Nothing to clear.");
    return;
  }

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
  console.log(`\n  cleared ${cleared} dead image URLs.`);
  console.log("  Re-run `pnpm backfill:images` against your feeds to refill them.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

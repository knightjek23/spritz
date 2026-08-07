// Backfill licensed bottle images from a retailer affiliate product feed.
//
// Affiliate networks (Rakuten Advertising, etc.) hand you a product feed
// once an advertiser approves you: a CSV/TSV with, per product, the
// name, brand, an IMAGE URL you're licensed to display, and a product
// URL. This script matches each catalog fragrance to a feed product by
// normalized brand + name and writes the feed's image URL into
// bottle_image_url.
//
// Safe by design: it only fills rows whose current image is empty or an
// unlicensed source (fimgs.net / our mirror bucket). It never overwrites
// an image that's already licensed. Resumable, and --dry shows exactly
// what it would do before touching the DB.
//
// Usage:
//   cd scraper
//   pnpm backfill:images --feed=./data/fragrancenet-feed.csv
//
// Flags:
//   --feed=PATH   REQUIRED. The affiliate product feed file (.csv / .tsv).
//   --dry         Parse + match + report only. No DB writes.
//   --limit=N     Cap catalog rows scanned (smoke test).
//
// Before the first real run: open your feed's header row and set
// FEED_COLUMNS below to match. Rakuten's spec uses names like
// "productname", "imageurl", "brand", but every advertiser's export
// differs, so confirm against your actual file.

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// ---- Column mapping: candidate header names, first match wins ----
// Pre-loaded with Awin's standard datafeed fields (merchant_image_url,
// product_name, brand_name, aw_deep_link) plus the common variants used by
// Rakuten, CJ, FlexOffers and Google-format feeds. Comparison ignores case
// and punctuation, so "Merchant Image URL" matches "merchant_image_url".
// If a feed uses something exotic, add it here.
const FEED_COLUMNS = {
  name: ["title", "product_name", "productname", "name", "product_short_description"],
  brand: ["brand", "brand_name", "manufacturer", "brandname", "merchant_name"],
  imageUrl: [
    "image_link", // Google Shopping spec — CJ feeds use this
    "merchant_image_url", // Awin standard
    "aw_image_url",
    "large_image",
    "imageurl",
    "image_url",
    "image",
    "largeimage",
    "imageurl_large",
    "additional_image_link",
  ],
  productUrl: ["link", "aw_deep_link", "merchant_deep_link", "linkurl", "producturl", "product_url", "url"],
};

// ---- Unlicensed sources we're replacing (mirror of lib/bottle-image) ----
// The leading class must include `/`. With the old `(^|\.)` this did NOT match
// `https://fimgs.net/...`, so every bare-domain fimgs row read as "already
// licensed" and was SKIPPED by this backfill — i.e. the rows that most needed a
// licensed image were the exact ones the feed refused to fill.
const BLOCKED_SOURCE_PATTERNS: RegExp[] = [
  /(^|[.\/])fimgs\.net\//i,
  /\/storage\/v1\/object\/public\/bottle-images\//i,
];
function isBlockedOrEmpty(url: string | null): boolean {
  if (!url) return true;
  return BLOCKED_SOURCE_PATTERNS.some((re) => re.test(url));
}

// ---- House-name normalization (inline; scraper is a separate package) ----
const HOUSE_ALIASES: Record<string, string> = {
  mfk: "maison francis kurkdjian",
  ysl: "yves saint laurent",
  tf: "tom ford",
  pdm: "parfums de marly",
  jpg: "jean paul gaultier",
  "d&g": "dolce gabbana",
  dg: "dolce gabbana",
  ck: "calvin klein",
  ga: "giorgio armani",
  armani: "giorgio armani",
  "viktor and rolf": "viktor rolf",
  "comme des garcons": "comme des garcons",
};
// Catalogs and retailer feeds disagree on house suffixes: the catalog says
// "Al Haramain Perfumes" / "Demeter Fragrance" / "Lattafa Perfumes" where
// the feed says "Al Haramain" / "Demeter" / "Lattafa". Strip these trailing
// descriptors so both sides converge. Only TRAILING words are removed, so
// "Parfums de Marly" (leading) is untouched.
const HOUSE_SUFFIXES = [
  "perfumes",
  "perfume",
  "fragrances",
  "fragrance",
  "parfums",
  "parfum",
  "cosmetics",
  "beauty",
  "official",
];

function stripHouseSuffix(collapsed: string): string {
  const words = collapsed.split(" ");
  // Never strip down to nothing (a house literally called "Perfume").
  while (words.length > 1 && HOUSE_SUFFIXES.includes(words[words.length - 1])) {
    words.pop();
  }
  return words.join(" ");
}

function normHouse(h: string): string {
  const key = collapse(h);
  const aliased = HOUSE_ALIASES[key];
  if (aliased) return collapse(aliased);
  return stripHouseSuffix(key);
}
// Lowercase, drop punctuation and the word "and"/"&", collapse whitespace.
function collapse(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/\band\b/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
// Order-independent name key so "Born In Roma Donna" == "Donna Born in Roma".
function nameKey(s: string): string {
  return collapse(s).split(" ").filter(Boolean).sort().join(" ");
}
function matchKey(house: string, name: string): string {
  return `${normHouse(house)}::${nameKey(name)}`;
}

// Concentration terms describe the strength of the SAME fragrance, and the
// feed already strips them from its titles (they live after the " - " in
// the retailer's product name). Your catalog keeps them, so "Sauvage Eau de
// Parfum" never matches the feed's "Sauvage". Removing them lets those pair
// up.
//
// Deliberately NOT stripped: Intense, Extreme, Absolu, Elixir, Extrait,
// Sport, Noir and similar. Those denote genuinely different flankers with
// their own bottles, and matching them to the base fragrance would put the
// wrong photo on the page.
const CONCENTRATION_WORDS = new Set([
  "eau",
  "de",
  "parfum",
  "toilette",
  "cologne",
  "edp",
  "edt",
  "edc",
  "spray",
  "pour",
  "homme",
  "femme",
  "men",
  "women",
  "for",
]);

function looseNameKey(name: string): string {
  const words = collapse(name)
    .split(" ")
    .filter((w) => w && !CONCENTRATION_WORDS.has(w));
  return words.sort().join(" ");
}

function looseMatchKey(house: string, name: string): string {
  return `${normHouse(house)}::~${looseNameKey(name)}`;
}

// ---- Minimal CSV/TSV parser (handles quoted fields with embedded delims) ----
function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // ignore; handled by \n
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function pickColumn(header: string[], candidates: string[]): number {
  const norm = header.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  for (const cand of candidates) {
    const idx = norm.indexOf(cand.replace(/[^a-z0-9]/g, ""));
    if (idx !== -1) return idx;
  }
  return -1;
}

interface FeedProduct {
  imageUrl: string;
  /** Higher wins when several feed rows map to the same fragrance. */
  quality: number;
}

// Retailer titles bundle the fragrance name with the product type and size:
//   "Drakkar Noir Cologne for Men - Body Spray 6.0 oz"
// Everything after " - " is product type and size, and "Cologne/Perfume for
// Men/Women" is boilerplate. Strip both to recover the actual fragrance
// name ("Drakkar Noir") so it can match a catalog row.
function cleanFeedTitle(title: string): string {
  let t = title.split(" - ")[0];
  t = t.replace(/\b(cologne|perfume)\b/gi, " ");
  t = t.replace(/\bfor (men|women|unisex)\b/gi, " ");
  t = t.replace(/\b(tester|unboxed)\b/gi, " ");
  return t.replace(/\s+/g, " ").trim();
}

// Feeds carry knockoff "Type Perfume Oil" products: cheap imitations sold
// under the original's name ("Baccarat Rouge 540 Type Perfume Oil"). Their
// images are generic oil vials, so matching one would put a knockoff photo
// on a real fragrance's page. Excluded outright.
function isKnockoffOil(title: string): boolean {
  return /\b(type)\b.*\boil\b|concentrated perfume oil/i.test(title);
}

// Rank the product types that map to the same fragrance so the real bottle
// wins over an after-shave balm or shower gel that shares its name.
function productQuality(title: string): number {
  if (/eau de (parfum|toilette|cologne)|extrait|parfum spray|cologne spray/i.test(title)) {
    return /tester/i.test(title) ? 2 : 3; // real bottle; testers slightly lower
  }
  if (/after ?shave|body spray|shower gel|deodorant|body lotion|body wash|balm/i.test(title)) {
    return 1; // ancillary product, not the bottle
  }
  return 2;
}

// Sniff the delimiter from the header line rather than trusting the file
// extension. CJ's Google-format export arrives as "<name>-shopping.txt"
// (tab-separated despite the .txt extension), Awin ships .csv, and some
// networks ship .tsv. Whichever candidate appears most in the header wins.
function sniffDelimiter(text: string): string {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const candidates = ["\t", ",", "|", ";"];
  let best = ",";
  let bestCount = 0;
  for (const c of candidates) {
    const count = firstLine.split(c).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = c;
    }
  }
  return best;
}

async function loadFeed(feedPath: string): Promise<Map<string, FeedProduct>> {
  const raw = await fs.readFile(feedPath, "utf8");
  const delimiter = sniffDelimiter(raw);
  console.log(
    `  delimiter detected: ${delimiter === "\t" ? "TAB" : JSON.stringify(delimiter)}`,
  );
  const rows = parseDelimited(raw, delimiter).filter((r) => r.length > 1);
  if (rows.length === 0) throw new Error("feed is empty");

  const header = rows[0];
  const nameIdx = pickColumn(header, FEED_COLUMNS.name);
  const brandIdx = pickColumn(header, FEED_COLUMNS.brand);
  const imageIdx = pickColumn(header, FEED_COLUMNS.imageUrl);
  if (nameIdx === -1 || brandIdx === -1 || imageIdx === -1) {
    throw new Error(
      `Could not find required columns in the feed header.\n` +
        `Header was: ${header.join(" | ")}\n` +
        `Update FEED_COLUMNS in this script to match (need name, brand, imageUrl).`,
    );
  }

  const lookup = new Map<string, FeedProduct>();
  let skippedKnockoff = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rawTitle = (r[nameIdx] ?? "").trim();
    const brand = (r[brandIdx] ?? "").trim();
    const imageUrl = (r[imageIdx] ?? "").trim();
    if (!rawTitle || !brand || !imageUrl) continue;

    if (isKnockoffOil(rawTitle)) {
      skippedKnockoff++;
      continue;
    }

    const name = cleanFeedTitle(rawTitle);
    if (!name) continue;

    const quality = productQuality(rawTitle);
    // Index under both the exact key and the loose (concentration-stripped)
    // key. Exact is tried first at match time, so loose only ever fills in
    // where exact found nothing.
    for (const key of [matchKey(brand, name), looseMatchKey(brand, name)]) {
      const existing = lookup.get(key);
      if (!existing || quality > existing.quality) {
        lookup.set(key, { imageUrl, quality });
      }
    }
  }
  if (skippedKnockoff > 0) {
    console.log(`  skipped ${skippedKnockoff} knockoff "type" oil products`);
  }
  return lookup;
}

const args = process.argv.slice(2);
const FEED = args.find((a) => a.startsWith("--feed="))?.split("=")[1];
const DRY = args.includes("--dry");
const DIAGNOSE = args.includes("--diagnose");
const LIMIT = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

interface CatalogRow {
  id: string;
  name: string;
  house: string;
  bottle_image_url: string | null;
  popularity_rank: number | null;
}

// Raw match count is misleading: a 7,000-row catalog scraped from a
// reference site has a long tail of niche and discontinued fragrances no
// retailer stocks. What matters is whether the fragrances users actually
// open have images. These bands report coverage weighted by popularity.
const POPULARITY_BANDS: Array<{ label: string; max: number }> = [
  { label: "top 100", max: 100 },
  { label: "top 500", max: 500 },
  { label: "top 1000", max: 1000 },
  { label: "top 2500", max: 2500 },
];

async function main() {
  if (!FEED) {
    console.error("Missing --feed=PATH (the affiliate product feed .csv/.tsv).");
    process.exit(1);
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in scraper/.env.");
    process.exit(1);
  }

  console.log(`--- Affiliate image backfill ---`);
  console.log(`  feed: ${path.resolve(FEED)}`);
  if (DRY) console.log(`  (dry run, no DB writes)`);

  const feed = await loadFeed(FEED);
  console.log(`  feed products indexed: ${feed.size}\n`);

  // Set of normalized house names present in the feed, so we can tell a
  // "house isn't carried by this retailer" miss (unfixable, need another
  // feed) apart from a "house matches but the name didn't" miss (fixable
  // in the matcher).
  const feedHouses = new Set<string>();
  for (const key of feed.keys()) feedHouses.add(key.split("::")[0]);

  const diag = {
    houseMissing: 0,
    houseHitNameMiss: 0,
    houseMissSamples: new Map<string, number>(),
    nameMissSamples: [] as string[],
    // [matched, total] per popularity band
    bands: POPULARITY_BANDS.map(() => [0, 0] as [number, number]),
  };

  function recordBand(rank: number | null, didMatch: boolean) {
    if (rank === null) return;
    POPULARITY_BANDS.forEach((b, i) => {
      if (rank <= b.max) {
        diag.bands[i][1]++;
        if (didMatch) diag.bands[i][0]++;
      }
    });
  }

  const PAGE = 500;
  let offset = 0;
  let scanned = 0;
  let matched = 0;
  let updated = 0;
  let alreadyOk = 0;

  while (true) {
    if (LIMIT && scanned >= LIMIT) break;
    const { data, error } = await supabase
      .from("fragrances")
      .select("id, name, house, bottle_image_url, popularity_rank")
      .order("id")
      .range(offset, offset + PAGE - 1)
      .returns<CatalogRow[]>();
    if (error) {
      console.error("Supabase query failed:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (LIMIT && scanned >= LIMIT) break;
      scanned++;

      // Skip rows that already carry a licensed image.
      if (!isBlockedOrEmpty(row.bottle_image_url)) {
        alreadyOk++;
        continue;
      }

      // Exact first, then the concentration-stripped fallback.
      const hit =
        feed.get(matchKey(row.house, row.name)) ??
        feed.get(looseMatchKey(row.house, row.name));
      if (!hit) {
        recordBand(row.popularity_rank, false);
        // Classify the miss so we know whether the matcher or the feed is
        // the problem.
        // normHouse already lowercases, strips punctuation and applies
        // aliases, producing the same form used in the feed lookup keys.
        if (feedHouses.has(normHouse(row.house))) {
          diag.houseHitNameMiss++;
          if (diag.nameMissSamples.length < 25) {
            diag.nameMissSamples.push(`${row.house} — ${row.name}`);
          }
        } else {
          diag.houseMissing++;
          diag.houseMissSamples.set(
            row.house,
            (diag.houseMissSamples.get(row.house) ?? 0) + 1,
          );
        }
        continue;
      }
      recordBand(row.popularity_rank, true);
      matched++;

      if (DRY) {
        console.log(`  [dry] ${row.house} — ${row.name} -> ${hit.imageUrl}`);
        continue;
      }

      const { error: upErr } = await supabase
        .from("fragrances")
        .update({ bottle_image_url: hit.imageUrl })
        .eq("id", row.id);
      if (upErr) {
        console.warn(`  ! ${row.house} — ${row.name}: ${upErr.message}`);
      } else {
        updated++;
        if (updated % 100 === 0) console.log(`  ✓ ${updated} images backfilled`);
      }
    }

    offset += data.length;
    if (data.length < PAGE) break;
  }

  console.log("");
  console.log(
    `Done. scanned=${scanned} needed_image=${scanned - alreadyOk} matched=${matched} ${DRY ? "(dry)" : `updated=${updated}`}`,
  );
  console.log(
    `Unmatched rows keep the house-initials placeholder. Re-run with a fuller feed to fill more.`,
  );

  if (DIAGNOSE) {
    console.log("");
    console.log("--- Coverage where it matters (by popularity) ---");
    POPULARITY_BANDS.forEach((b, i) => {
      const [m, t] = diag.bands[i];
      const pct = t ? Math.round((100 * m) / t) : 0;
      const bar = "#".repeat(Math.round(pct / 4)).padEnd(25, ".");
      console.log(`  ${b.label.padEnd(9)} ${bar} ${m}/${t}  (${pct}%)`);
    });

    const misses = diag.houseMissing + diag.houseHitNameMiss;
    console.log("");
    console.log("--- Why rows did not match ---");
    console.log(
      `  house not in this feed : ${diag.houseMissing}  (${misses ? Math.round((100 * diag.houseMissing) / misses) : 0}%)  <- retailer doesn't carry it; need a different feed`,
    );
    console.log(
      `  house OK, name differs : ${diag.houseHitNameMiss}  (${misses ? Math.round((100 * diag.houseHitNameMiss) / misses) : 0}%)  <- matcher could be improved`,
    );
    console.log("");
    console.log("  Top houses in your catalog missing from this feed:");
    const topMissing = [...diag.houseMissSamples.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
    for (const [house, n] of topMissing) {
      console.log(`     ${String(n).padStart(4)}  ${house}`);
    }
    console.log("");
    console.log("  Sample name mismatches (house exists in feed):");
    for (const s of diag.nameMissSamples.slice(0, 15)) {
      console.log(`     ${s}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

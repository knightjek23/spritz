// Convert a Rakuten Advertising publisher Product Catalog file into a headed
// CSV that scraper/src/backfill-affiliate-images.ts already understands.
//
// Why a converter rather than a new mode inside the backfill: Rakuten's
// publisher feed is the legacy LinkShare format, which is nothing like the
// header-bearing CSV/TSV every other network ships. It is pipe-delimited,
// POSITIONAL (no column names), and its first line is a HDR record rather than
// a header row. Teaching the backfill two completely different parsers would
// make that file worse. This converts once, and the backfill stays unchanged.
//
// Verified against a real FragranceNet feed (MID 216), 38 fields per row.
//
// Field positions that matter (1-based, per Rakuten's Appendix A):
//    2  Product Name        full retail title, always of the form
//                           "<NAME> by <HOUSE> <TYPE> <SIZE> for <GENDER>"
//    5  Secondary Category  e.g. "Bath & Body" — used to demote non-wearables
//    6  Product URL         the affiliate tracking link (monetised)
//    7  Product Image URL   <- the reason we are here
//   17  "Brand"             MISLABELLED in the spec. FragranceNet puts the
//                           PRODUCT TITLE here — see the house-prefix note.
//   21  Manufacturer Name   the actual HOUSE ("Royall Fragrances").
//   23  Availability        in-stock / out-of-stock
//   24  UPC                 populated and check-digit valid in this feed
//
// ---------------------------------------------------------------------------
// THE HOUSE-PREFIX PROBLEM (this is what the first version got wrong)
// ---------------------------------------------------------------------------
// Field 17 is not a clean fragrance name. Measured across all 34,480 rows of
// the real feed:
//
//     field 17 == the house exactly     12,179 rows  (35%)
//     field 17 starts with the house    15,418 rows  (44%)
//     ------------------------------------------------------
//     unusable as-is                    27,597 rows  (80%)
//
// FragranceNet writes retail titles, so field 17 reads "Chanel Gabrielle",
// "Creed Centaurus", "Perry Ellis 360" — the house is glued to the front. The
// catalog stores those as "Gabrielle", "Centaurus", "360". The backfill's
// matcher normalises and SORTS name tokens, so "chanel gabrielle" and
// "gabrielle" are simply different keys and never meet. That single defect is
// why the first pass matched 660 rows.
//
// Fix: emit an ALIAS ROW with the house prefix removed, alongside the raw one.
// Two rows, one image, two keys into the matcher — nothing is lost if the
// catalog happens to store the house-prefixed form ("Bottega Veneta Pour
// Homme"), and the stripped form matches everything else.
//
// Simulated against the 11,667-row scraped catalog:
//     raw field 17 only              856 matches  ( 7%)
//     + house-prefix alias row     2,773 matches  (23%)   <- 3.2x
//
// The 35% where field 17 IS the house are mostly skincare and haircare
// (FragranceNet sells both), but 634 are real eponymous fragrances — Aramis by
// Aramis, Vera Wang by Vera Wang, Joop! by Joop!. Those must NOT be stripped,
// hence the eponymous guard in stripHousePrefix().
//
// Usage (from scraper/):
//   npx tsx src/rakuten-to-csv.ts --in=./data/rakuten/216_4736579_mp.txt --out=./data/rakuten/fragrancenet.csv
//   npx tsx src/backfill-affiliate-images.ts --feed=./data/rakuten/fragrancenet.csv --dry --diagnose

import fs from "node:fs";
import readline from "node:readline";

const args = process.argv.slice(2);
const IN = args.find((a) => a.startsWith("--in="))?.split("=")[1];
const OUT = args.find((a) => a.startsWith("--out="))?.split("=")[1];
const KEEP_ALL = args.includes("--keep-all"); // don't drop non-wearables
const NO_ALIAS = args.includes("--no-alias"); // emit raw field 17 only

if (!IN || !OUT) {
  console.error("Usage: tsx src/rakuten-to-csv.ts --in=<feed.txt> --out=<feed.csv> [--keep-all] [--no-alias]");
  process.exit(1);
}

// ---- Field indices (0-based array positions for the 1-based spec numbers) ----
const F = {
  productId: 0,
  title: 1,
  sku: 2,
  primaryCategory: 3,
  secondaryCategory: 4,
  productUrl: 5,
  imageUrl: 6,
  retailPrice: 13,
  fragranceName: 16, // spec calls this "Brand"
  mpn: 19,
  house: 20, // spec calls this "Manufacturer Name"
  availability: 22,
  upc: 23,
} as const;

// ---- GTIN normalisation (mirrors backfill-affiliate-images.ts) ----
function hasValidGtinCheckDigit(digits: string): boolean {
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}
function normalizeGtin(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(d.length)) return null;
  if (/^0+$/.test(d)) return null;
  if (!hasValidGtinCheckDigit(d)) return null;
  return d.padStart(14, "0");
}

// ---- Normalisation, kept deliberately in step with the backfill ----
function collapse(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Trailing descriptors the catalog keeps and the feed drops (or vice versa).
const HOUSE_SUFFIXES = new Set([
  "perfumes", "perfume", "fragrances", "fragrance",
  "parfums", "parfum", "cosmetics", "beauty", "official",
]);

function houseTokens(house: string): string[] {
  const w = collapse(house).split(" ").filter(Boolean);
  while (w.length > 1 && HOUSE_SUFFIXES.has(w[w.length - 1])) w.pop();
  return w;
}

/**
 * Remove a leading house-token run from a retail product title.
 *
 * Returns null when there is nothing safe to strip, which covers three cases:
 *   - the title has no house prefix at all
 *   - the title IS the house (eponymous fragrance: Aramis, Vera Wang, Joop!)
 *   - stripping would leave nothing behind
 *
 * The partial run matters: field 21 says "Hugo Boss" while field 17 says
 * "Boss Orange Man Charity". Only leading tokens that are themselves house
 * tokens are consumed, so "Boss" goes and "Orange Man Charity" stays.
 */
function stripHousePrefix(name: string, house: string): string | null {
  const nw = collapse(name).split(" ").filter(Boolean);
  const hw = houseTokens(house);
  if (!nw.length || !hw.length) return null;

  // Eponymous: the whole title is the house. Never strip.
  if (nw.join(" ") === hw.join(" ")) return null;

  // Full run first, so multi-word houses are consumed as a unit.
  if (nw.length > hw.length && hw.every((t, i) => nw[i] === t)) {
    return nw.slice(hw.length).join(" ");
  }
  // Partial run: consume leading tokens that appear anywhere in the house.
  let i = 0;
  while (i < nw.length && hw.includes(nw[i])) i++;
  if (i === 0 || i >= nw.length) return null;
  return nw.slice(i).join(" ");
}

// A handful of houses append a city to their brand line in retail titles
// ("Montale Paris Dallachai", "Bond No 9 New York Wall Street"). Emitting one
// more alias with a leading city removed is free — it is an extra key, never a
// replacement, so a wrong guess cannot displace a correct match.
const BRAND_LINE_CITIES = ["paris", "new york", "london", "milano", "roma"];
function stripBrandLineCity(stripped: string): string | null {
  for (const city of BRAND_LINE_CITIES) {
    if (stripped.startsWith(city + " ")) {
      const rest = stripped.slice(city.length + 1).trim();
      if (rest) return rest;
    }
  }
  return null;
}

/**
 * Remove EVERY house token plus a stranded "by", wherever they appear.
 *
 * stripHousePrefix only handles the house at the front. FragranceNet also
 * writes it at the back ("Hot Couture By Givenchy", "Vetiver Guerlain") and
 * in the middle. This is the catch-all alias.
 *
 * Rejects degenerate results — a title that is nothing but house tokens
 * ("Gucci By Gucci") would otherwise produce an empty key that swallows an
 * entire house.
 */
const CONC_WORDS = new Set([
  "eau", "de", "parfum", "toilette", "cologne", "edp", "edt", "edc",
  "spray", "pour", "homme", "femme", "men", "women", "for",
]);
function deHouseName(name: string, house: string): string | null {
  const drop = new Set(houseTokens(house));
  drop.add("by");
  const words = collapse(name).split(" ").filter((w) => w && !drop.has(w));
  const out = words.join(" ");
  if (!out || out.length < 3) return null;
  if (words.every((w) => CONC_WORDS.has(w))) return null;
  return out;
}

// ---- Product-type ranking ----
// FragranceNet's catalogue mixes real bottles with aftershave balm, body wash
// and gift sets that share a fragrance name. When several rows collapse to the
// same (house, name) we keep the highest-ranked one, so the page gets a photo
// of the bottle rather than a shower gel.
function rank(title: string, secondaryCategory: string): number {
  const t = title.toLowerCase();
  if (/\b(eau de (parfum|toilette|cologne)|edp|edt|extrait|parfum spray|cologne spray)\b/.test(t)) {
    return /\btester\b/.test(t) ? 3 : 4;
  }
  if (/\b(after ?shave|body (wash|spray|lotion|cream|oil)|shower gel|deodorant|balm|soap|shampoo|scrub)\b/.test(t)) return 1;
  if (/\b(gift set|set|collection|sampler|vial|decant)\b/.test(t)) return 1;
  if (/bath\s*&\s*body/i.test(secondaryCategory)) return 1;
  return 2;
}

function csvEscape(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

interface Row {
  name: string;
  house: string;
  imageUrl: string;
  ean: string;
  productUrl: string;
  rank: number;
  alias: boolean;
}

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream(IN!, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  const best = new Map<string, Row>();
  let lines = 0, skippedHdr = 0, malformed = 0, noImage = 0, noName = 0;
  let withEan = 0, badEan = 0, demoted = 0;
  let eponymous = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    lines++;

    if (line.startsWith("HDR|") || line.startsWith("TRL|")) { skippedHdr++; continue; }

    const f = line.split("|");
    if (f.length < 26) { malformed++; continue; }

    const imageUrl = (f[F.imageUrl] ?? "").trim();
    if (!imageUrl) { noImage++; continue; }

    const rawName = (f[F.fragranceName] ?? "").trim() || (f[F.title] ?? "").trim();
    const house = (f[F.house] ?? "").trim();
    if (!rawName || !house) { noName++; continue; }

    const rawUpc = (f[F.upc] ?? "").trim();
    const ean = rawUpc ? normalizeGtin(rawUpc) : null;
    if (ean) withEan++;
    else if (rawUpc) badEan++;

    const r = rank(f[F.title] ?? "", f[F.secondaryCategory] ?? "");
    if (r <= 1) demoted++;
    if (r <= 1 && !KEEP_ALL) continue;

    // Candidate names: the raw retail title, plus the house-stripped alias,
    // plus a city-stripped alias. Duplicates collapse in the Set.
    const names = new Set<string>([rawName]);
    if (!NO_ALIAS) {
      const stripped = stripHousePrefix(rawName, house);
      if (stripped) {
        names.add(stripped);
        const city = stripBrandLineCity(stripped);
        if (city) names.add(city);
      } else if (collapse(rawName) === houseTokens(house).join(" ")) {
        eponymous++;
      }
      // Catch-all for house tokens that sit at the END or in the middle.
      const deHoused = deHouseName(rawName, house);
      if (deHoused) names.add(deHoused);
    }

    let first = true;
    for (const name of names) {
      const key = `${collapse(house)}::${collapse(name)}`;
      const existing = best.get(key);
      if (!existing || r > existing.rank) {
        best.set(key, {
          name,
          house,
          imageUrl,
          ean: ean ?? "",
          productUrl: (f[F.productUrl] ?? "").trim(),
          rank: r,
          alias: !first,
        });
      }
      first = false;
    }
  }

  // Header names chosen to match FEED_COLUMNS in backfill-affiliate-images.ts
  // exactly, so that script needs no changes at all.
  const out = [["product_name", "brand", "image_url", "ean", "product_url"].join(",")];
  for (const r of best.values()) {
    out.push([r.name, r.house, r.imageUrl, r.ean, r.productUrl].map(csvEscape).join(","));
  }
  fs.writeFileSync(OUT!, out.join("\n") + "\n", "utf8");

  const aliasTotal = [...best.values()].filter((r) => r.alias).length;
  const eanPct = lines ? Math.round((100 * withEan) / lines) : 0;
  console.log(`--- Rakuten feed -> CSV ---`);
  console.log(`  read              ${lines} lines (${skippedHdr} HDR/TRL)`);
  console.log(`  malformed         ${malformed}`);
  console.log(`  no image url      ${noImage}`);
  console.log(`  no name or house  ${noName}`);
  console.log(`  non-wearable      ${demoted}${KEEP_ALL ? " (kept, --keep-all)" : " (dropped)"}`);
  console.log(`  barcodes usable   ${withEan}  rejected ${badEan}  (~${eanPct}% of rows)`);
  console.log(`  eponymous kept    ${eponymous} (title == house, e.g. Aramis by Aramis — not stripped)`);
  console.log(`  house-prefix alias rows written  ${aliasTotal}${NO_ALIAS ? " (--no-alias)" : ""}`);
  console.log(`\n  wrote ${best.size} rows to ${OUT}`);
  console.log(`\nNext:`);
  console.log(`  npx tsx src/backfill-affiliate-images.ts --feed=${OUT} --dry --diagnose`);
}

main().catch((e) => { console.error(e); process.exit(1); });

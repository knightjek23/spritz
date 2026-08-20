// Rakuten "merchandiser" XML feed -> headed CSV.
//
// Rakuten ships two completely different formats depending on the merchant:
//   - FragranceNet: pipe-delimited, positional, no header (see rakuten-to-csv.ts)
//   - Nicchia Luxury: merchandiser XML (this file)
//
// Both converge on the same CSV shape the backfill reads, so downstream
// nothing needs to know which merchant it came from.
//
// The XML carries everything the buy-offer feature needs, which the
// positional text feed does not always: an affiliate-tracked product URL,
// a price WITH its currency, and a UPC.
//
// <product product_id="..." name="..." manufacturer_name="...">
//   <URL><product>https://click.linksynergy.com/...</product>
//        <productImage>https://cdn.shopify.com/...</productImage></URL>
//   <price currency="EUR"><retail>225.00</retail></price>
//   <brand>Aedes de Venustas</brand>
//   <upc>00758890797721</upc>
// </product>
//
// Deliberately hand-parsed rather than pulling in an XML dependency: the
// file is machine-generated with a fixed shape, and the scraper is a
// separate package where every added dep is another thing to break.
//
// Usage:
//   pnpm tsx src/rakuten-xml-to-csv.ts --in=./data/rakuten/54306_4736579_mp.xml --out=./data/rakuten/nicchia.csv

import fs from "node:fs";

const args = process.argv.slice(2);
const IN = args.find((a) => a.startsWith("--in="))?.split("=")[1];
const OUT = args.find((a) => a.startsWith("--out="))?.split("=")[1];

if (!IN || !OUT) {
  console.error(
    "Usage: tsx src/rakuten-xml-to-csv.ts --in=<feed.xml> --out=<out.csv>",
  );
  process.exit(1);
}

// ---- helpers ----

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#0?39;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

/** Text content of the first <tag>...</tag>, or "" when absent. */
function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1]).trim() : "";
}

/** Value of an attribute on the block's opening tag. */
function attr(block: string, name: string): string {
  const m = block.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return m ? decodeEntities(m[1]).trim() : "";
}

function csvEscape(v: string): string {
  const s = (v ?? "").replace(/\r?\n/g, " ").trim();
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GTIN normalisation, mirroring backfill-affiliate-images.ts: strip to
// digits, pad to 14, validate the check digit. An invalid barcode is worse
// than none, since it would match the wrong bottle in a later feed.
function hasValidGtinCheckDigit(digits: string): boolean {
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

function normalizeGtin(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return "";
  const padded = digits.padStart(14, "0");
  return hasValidGtinCheckDigit(padded) ? padded : "";
}

// ---- main ----

const xml = fs.readFileSync(IN, "utf8");

// Split on product boundaries. Everything before the first <product is the
// header, which we skip.
const blocks = xml.split(/<product\s+product_id=/i).slice(1);

const merchant = tag(xml, "merchantName") || "unknown";

let noImage = 0;
let noName = 0;
let noUrl = 0;
let withEan = 0;
const seen = new Set<string>();
const out: string[] = [
  ["product_name", "brand", "image_url", "ean", "product_url", "price", "currency"].join(","),
];

for (const raw of blocks) {
  const block = `<product product_id=${raw}`;

  const name = attr(block, "name");
  // <brand> is the cleaner value; manufacturer_name is the fallback.
  const house = tag(block, "brand") || attr(block, "manufacturer_name");
  if (!name || !house) {
    noName++;
    continue;
  }

  const imageUrl = tag(block, "productImage");
  if (!imageUrl) {
    noImage++;
    continue;
  }

  // The affiliate-tracked destination. Nested inside <URL>, so pull that
  // wrapper first — a bare <product> match would hit the outer element.
  const urlBlock = block.match(/<URL>([\s\S]*?)<\/URL>/i)?.[1] ?? "";
  const productUrl = tag(urlBlock, "product");
  if (!productUrl) noUrl++;

  const priceBlock = block.match(/<price[^>]*>([\s\S]*?)<\/price>/i)?.[0] ?? "";
  const price = tag(priceBlock, "retail");
  const currency = attr(priceBlock, "currency") || "USD";

  const ean = normalizeGtin(tag(block, "upc"));
  if (ean) withEan++;

  // Collapse duplicates on house+name; feeds list size variants separately.
  const key = `${house.toLowerCase()}::${name.toLowerCase()}`;
  if (seen.has(key)) continue;
  seen.add(key);

  out.push(
    [name, house, imageUrl, ean, productUrl, price, currency]
      .map(csvEscape)
      .join(","),
  );
}

fs.writeFileSync(OUT, out.join("\n") + "\n", "utf8");

const rows = out.length - 1;
console.log("--- Rakuten XML -> CSV ---");
console.log(`  merchant          ${merchant}`);
console.log(`  product blocks    ${blocks.length}`);
console.log(`  written           ${rows}`);
console.log(`  skipped no image  ${noImage}`);
console.log(`  skipped no name   ${noName}`);
console.log(`  missing buy URL   ${noUrl}`);
console.log(`  with valid EAN    ${withEan}`);
console.log(`\n  -> ${OUT}`);

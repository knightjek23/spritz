// Repair fragrances.concentration from retailer SKU titles.
//
// ---------------------------------------------------------------------------
// WHY
// ---------------------------------------------------------------------------
// As of Aug 2026 the concentration column was ~93% wrong: essentially every
// fragrance in the app displayed EDP, including famous EDTs. Three causes,
// documented in full in migration 0024:
//
//   1. The name parser (backfill-concentration.ts) claims 60-80% coverage.
//      Measured on the real 11,668-row parsed catalog it fires on 6.4%,
//      because Fragrantica names the flagship bare ("Sauvage"), not
//      "Sauvage Eau de Toilette".
//   2. That 6.4% is EDP-skewed by construction: Fragrantica gives the
//      ORIGINAL (usually the EDT) the bare name and only appends "Eau de
//      Parfum" to the later flanker.
//   3. infer-concentration.ts asked a model to fill the other 93.6% with a
//      prompt asserting EDP is "the default for most modern releases". It
//      answered edp at high confidence, sailing past the 0.7 gate.
//
// A retailer's SKU title is a description of a real bottle on a shelf, which
// is as close to ground truth as this data gets. FragranceNet's feed alone
// carries a usable concentration on 18,450 of 34,480 rows.
//
// ---------------------------------------------------------------------------
// SAFETY RULES (each one exists because breaking it produces silent damage)
// ---------------------------------------------------------------------------
// * STRICT KEYS ONLY. backfill-affiliate-images.ts matches on a "loose" key
//   that deliberately strips concentration words so "Sauvage" pairs with
//   "Sauvage Eau de Parfum" -- correct when hunting for a photo, fatal here,
//   because it would let an EDP flanker inherit the base EDT's SKU. This
//   script uses the exact-token key only and accepts the lower hit rate.
// * UNANIMOUS ONLY. A base name often has both an EDT and an EDP SKU. If the
//   feed disagrees with itself for a name, that name is genuinely ambiguous
//   from the feed alone; we leave it NULL and report it rather than pick.
// * NEVER OVERWRITE source='name'. A concentration stated in the fragrance's
//   own name outranks a retailer's title.
// * WIPE source='ai' FIRST, unconditionally. Those values are untrusted. If
//   the feed cannot replace one, NULL is the correct answer and the UI
//   already hides the field. A wrong EDP is worse than a blank.
//
// Requires migration 0024 (concentration_source).
//
// Usage:
//   cd scraper && pnpm repair:concentration --dry     # report, write nothing
//   cd scraper && pnpm repair:concentration           # apply
//   cd scraper && pnpm repair:concentration --keep-ai # skip the AI wipe
//
// Flags:
//   --dry        report only
//   --keep-ai    do not wipe ai-sourced values (not recommended)
//   --limit=N    cap catalog rows processed (smoke test)

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const KEEP_AI = args.includes("--keep-ai");
const LIMIT = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0");

const DATA_DIR = path.resolve(process.cwd(), "data");
const PAGE_SIZE = 500;

type Concentration = "edt" | "edp" | "parfum" | "extrait";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

// ---------------------------------------------------------------------------
// Normalization. Mirrors backfill-affiliate-images.ts. Duplicated rather than
// imported because that file executes main() on import; keep the two in sync.
// ---------------------------------------------------------------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&#0?39;|&apos;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&nbsp;/gi, " ");
}

function collapse(s: string): string {
  return decodeEntities(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " ")
    .replace(/\band\b/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const HOUSE_SUFFIXES = ["parfums", "parfum", "perfumes", "perfume", "fragrances", "fragrance", "paris", "cosmetics", "beauty"];

function stripHouseSuffix(collapsed: string): string {
  const words = collapsed.split(" ");
  while (words.length > 1 && HOUSE_SUFFIXES.includes(words[words.length - 1])) words.pop();
  return words.join(" ");
}

function normHouse(h: string): string {
  return stripHouseSuffix(collapse(h));
}

/** Order-independent EXACT token key. Concentration words are intentionally
 *  KEPT here (unlike the image matcher's loose key) so a flanker can never
 *  collide with its base. */
function nameKey(s: string): string {
  return collapse(s).split(" ").filter(Boolean).sort().join(" ");
}

/** Last significant house token: "gianni versace" -> "versace",
 *  "christian dior" -> "dior". Lets the catalog's house name meet the
 *  retailer's without an alias table. */
function houseBridge(h: string): string {
  const w = normHouse(h).split(" ").filter(Boolean);
  return w[w.length - 1] ?? "";
}

// ---------------------------------------------------------------------------
// MEASURED PRECISION (1,459-row catalog sample vs FragranceNet, Aug 2026).
// Ground truth: the raw feed's own SKUs are ~45% EDT. A matcher that returns
// a wildly different split is inventing matches, not finding them.
//
//   strict name key only        5.4% coverage   51.7% EDT   precise
//   + house bridge              6.1% coverage   45.6% EDT   precise  <- adopted
//   + de-housed name           20.2% coverage   19.7% EDT   BROKEN
//   + both                     22.1% coverage   18.8% EDT   BROKEN
//
// De-housing (stripping the house out of the product name, which the image
// matcher does) quadruples coverage and destroys the result: the shortened
// keys let distinct products collide, and because the feed carries 12,198 EDP
// SKUs against 4,550 EDT, every collision resolves EDP. That would rebuild
// the exact "everything is EDP" bug this script exists to fix, just with a
// different mechanism. Do not add it back to chase a coverage number.
// ---------------------------------------------------------------------------
function keysFor(house: string, name: string): string[] {
  const n = nameKey(name);
  if (!n) return [];
  const out = new Set<string>();
  for (const h of [normHouse(house), houseBridge(house)]) {
    if (h) out.add(`${h}::${n}`);
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// Concentration out of a retail SKU title.
// ---------------------------------------------------------------------------
//
// Retail titles look like:
//   "CERRUTI 1881 BY NINO CERRUTI EDT SPRAY 3.4 OZ FOR WOMEN"
//   "MY BURBERRY BLUSH BY BURBERRY EAU DE PARFUM SPRAY 1.7 OZ"
//
// Order matters for the same reason it does in lib/concentrations.ts:
// "EAU DE PARFUM" contains "PARFUM".
//
// "COLOGNE" is deliberately UNUSABLE. In the US market retailers use it to
// mean "a men's fragrance" as often as they mean Eau de Cologne, and our
// enum has no edc member anyway. Guessing here would reintroduce exactly the
// class of error this script exists to remove.
function concentrationFromTitle(title: string): Concentration | null {
  const T = ` ${title.toUpperCase()} `;
  if (/\bEXTRAIT\b/.test(T)) return "extrait";
  if (/\bEAU\s+DE\s+PARFUM\b|\bEDP\b/.test(T)) return "edp";
  if (/\bEAU\s+DE\s+TOILETTE\b|\bEDT\b/.test(T)) return "edt";
  if (/\bEAU\s+DE\s+COLOGNE\b|\bEDC\b/.test(T)) return null;
  if (/\bPARFUM\s+SPRAY\b|\bPURE\s+PERFUME\b/.test(T)) return "parfum";
  return null;
}

/** FragranceNet-style titles: "<product> BY <house> <format> <size> FOR
 *  <gender>". Everything before " BY " is the product name. */
function splitTitle(title: string): { name: string; house: string } | null {
  const m = title.match(/^(.+?)\s+BY\s+(.+)$/i);
  if (!m) return null;
  const name = m[1].trim();
  // House runs until the format/size noise starts.
  const houseRaw = m[2]
    .replace(
      /\s+(EDT|EDP|EDC|EAU\s+DE\s+\w+|EXTRAIT|PARFUM|COLOGNE|AFTERSHAVE|DEODORANT|BODY|SHOWER|GIFT|MINI|VIAL|TESTER|SPRAY|SPLASH|LOTION|CREAM|OIL|\d).*$/i,
      "",
    )
    .trim();
  if (!name || !houseRaw) return null;
  return { name, house: houseRaw };
}

/** CJ / Google Shopping titles carry no "BY <house>" (the house is its own
 *  BRAND column) and instead append format noise:
 *    "Drakkar Noir Cologne for Men - Body Spray 6.0 oz"
 *  Strip everything from the first format marker onward to recover the name. */
function cleanRetailTitle(title: string): string {
  return title
    .replace(/\s*[-–]\s*.*$/, "")
    .replace(/\b(eau\s+de\s+\w+|edt|edp|edc|extrait|parfum|cologne|perfume)\b.*$/i, "")
    .replace(/\bfor\s+(men|women|him|her|unisex)\b.*$/i, "")
    .replace(/\s+\d+(\.\d+)?\s*(oz|ml)\b.*$/i, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Feed loading
// ---------------------------------------------------------------------------

interface FeedIndexEntry {
  values: Set<Concentration>;
  sampleTitle: string;
}

/** Index a SKU under every key form (exact house + bridged house). */
function addToIndex(
  index: Map<string, FeedIndexEntry>,
  house: string,
  name: string,
  conc: Concentration,
  title: string,
): void {
  for (const key of keysFor(house, name)) {
    let e = index.get(key);
    if (!e) {
      e = { values: new Set(), sampleTitle: title };
      index.set(key, e);
    }
    e.values.add(conc);
  }
}

/** Rakuten publisher feed: pipe-delimited, field 2 (index 1) is the full
 *  retail title. First line is a header row. */
function loadRakutenPipe(file: string, index: Map<string, FeedIndexEntry>): number {
  if (!fs.existsSync(file)) return 0;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  let used = 0;
  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split("|");
    if (fields.length < 5) continue;
    const title = fields[1];
    if (!title) continue;
    const conc = concentrationFromTitle(title);
    if (!conc) continue;
    const parts = splitTitle(title);
    if (!parts) continue;
    addToIndex(index, parts.house, parts.name, conc, title);
    used++;
  }
  return used;
}

/** CJ / Google Shopping style: tab or comma delimited, with the house in its
 *  own BRAND column rather than inside the title. */
function loadDelimited(file: string, index: Map<string, FeedIndexEntry>): number {
  if (!fs.existsSync(file)) return 0;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  if (lines.length < 2) return 0;
  const delim =
    (lines[0].match(/\t/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? "\t" : ",";
  const header = lines[0].split(delim).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const ti = header.findIndex((h) => ["title", "name", "product_name", "productname"].includes(h));
  const bi = header.findIndex((h) => ["brand", "brand_name", "manufacturer"].includes(h));
  if (ti < 0 || bi < 0) {
    console.warn(`  ! ${path.basename(file)}: no title/brand column, skipped`);
    return 0;
  }
  let used = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delim);
    const title = (cols[ti] ?? "").replace(/^"|"$/g, "").trim();
    const brand = (cols[bi] ?? "").replace(/^"|"$/g, "").trim();
    if (!title || !brand) continue;
    const conc = concentrationFromTitle(title);
    if (!conc) continue;
    const name = cleanRetailTitle(title);
    if (!name || name.length < 3) continue;
    addToIndex(index, brand, name, conc, title);
    used++;
  }
  return used;
}

function buildFeedIndex(): Map<string, FeedIndexEntry> {
  const index = new Map<string, FeedIndexEntry>();
  const pipeFeeds = [path.join(DATA_DIR, "rakuten", "216_4736579_mp.txt")];
  const delimFeeds = [
    path.join(DATA_DIR, "FragranceShop_com_-CJ_Product_Feed-shopping.txt"),
    // Nicchia: niche houses (Aedes de Venustas etc.) that the mass-market
    // feeds never carry, so this is the only concentration source for them.
    // Its own split is ~93% EDP, which is genuine for niche rather than a
    // matcher artifact, so it drags the overall EDT share down legitimately.
    path.join(DATA_DIR, "rakuten", "nicchia.csv"),
  ];

  console.log("--- Loading feeds ---");
  for (const f of pipeFeeds) {
    const n = loadRakutenPipe(f, index);
    console.log(`  ${path.basename(f)}: ${n} SKUs with a concentration`);
  }
  for (const f of delimFeeds) {
    const n = loadDelimited(f, index);
    console.log(`  ${path.basename(f)}: ${n} SKUs with a concentration`);
  }
  const conflicted = [...index.values()].filter((e) => e.values.size > 1).length;
  console.log(`  distinct products: ${index.size} (${conflicted} with conflicting SKUs)\n`);
  return index;
}

// ---------------------------------------------------------------------------

interface Row {
  id: string;
  name: string;
  house: string;
  concentration: Concentration | null;
  concentration_source: "name" | "feed" | "ai" | null;
}

// ---------------------------------------------------------------------------
// Sibling subtraction — resolving the "sold in several strengths" case.
// ---------------------------------------------------------------------------
//
// The ambiguous rows are not random; they are the catalog's most popular
// fragrances, ambiguous precisely BECAUSE they are big enough for the house
// to ship an EDT, an EDP and a Parfum. The feed honestly reports all three.
//
// But Fragrantica models those as SEPARATE entries, and it names them in a
// consistent way: the ORIGINAL gets the bare name, and each later strength
// gets its own entry with the strength appended.
//
//   "Polo Blue"                     <- the original, bare
//   "Polo Blue Eau de Parfum"       <- flanker, name-parsed as edp
//   "Polo Blue Parfum"              <- flanker, name-parsed as parfum
//
// So for a bare row we can SUBTRACT the strengths already claimed by its own
// named siblings. Polo Blue: feed says {edt, edp, parfum}, siblings claim
// {edp, parfum}, leaving exactly {edt}. That is a deduction, not a guess.
//
// Deliberately NOT assuming "bare means EDT". Tom Ford's Black Orchid
// launched as an EDP, and its feed set {edp, edt, parfum} minus its one
// Parfum sibling still leaves {edp, edt} -- so it stays NULL. Only a
// subtraction down to exactly one candidate is accepted.

/** Tokens that mark a sibling as "same fragrance, different strength". */
const STRENGTH_TOKENS = new Set(["eau", "de", "parfum", "toilette", "extrait", "edp", "edt"]);

/**
 * Index bare-name -> strengths claimed by named siblings in the same house.
 * A sibling qualifies only when its name is the bare name plus tokens that
 * are ALL strength words, so "Polo Blue Eau de Parfum" counts but
 * "Polo Blue Sport" (a genuinely different fragrance) does not.
 */
function buildSiblingIndex(rows: Row[]): Map<string, Set<Concentration>> {
  const byHouse = new Map<string, Row[]>();
  for (const r of rows) {
    const h = normHouse(r.house);
    const list = byHouse.get(h);
    if (list) list.push(r);
    else byHouse.set(h, [r]);
  }

  const out = new Map<string, Set<Concentration>>();
  for (const [h, list] of byHouse) {
    // Only name-sourced siblings are trustworthy evidence of a claim.
    const named = list.filter((r) => r.concentration_source === "name" && r.concentration);
    if (named.length === 0) continue;

    for (const base of list) {
      const baseTokens = collapse(base.name).split(" ").filter(Boolean);
      if (baseTokens.length === 0) continue;
      const baseSet = new Set(baseTokens);
      const claimed = new Set<Concentration>();

      for (const sib of named) {
        if (sib.id === base.id) continue;
        const sibTokens = collapse(sib.name).split(" ").filter(Boolean);
        if (sibTokens.length <= baseTokens.length) continue;
        // Every base token must appear in the sibling...
        if (!baseTokens.every((t) => sibTokens.includes(t))) continue;
        // ...and every EXTRA token must be a strength word.
        const extra = sibTokens.filter((t) => !baseSet.has(t));
        if (extra.length === 0 || !extra.every((t) => STRENGTH_TOKENS.has(t))) continue;
        claimed.add(sib.concentration as Concentration);
      }

      if (claimed.size > 0) out.set(`${h}::${nameKey(base.name)}`, claimed);
    }
  }
  return out;
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in scraper/.env");
    process.exit(1);
  }

  console.log("=== Spritz concentration repair ===");
  if (DRY) console.log("  (dry run — no writes)\n");

  const feed = buildFeedIndex();
  if (feed.size === 0) {
    console.error("No feed data loaded. Expected files under scraper/data/. Aborting rather than");
    console.error("wiping AI values with nothing to replace them.");
    process.exit(1);
  }

  // ---- Step 1: wipe untrusted AI values -----------------------------------
  if (!KEEP_AI) {
    const { count } = await supabase
      .from("fragrances")
      .select("id", { count: "exact", head: true })
      .eq("concentration_source", "ai");
    console.log(`--- Step 1: wipe AI-sourced values ---`);
    console.log(`  ai-sourced rows: ${count ?? 0}`);
    if (!DRY && (count ?? 0) > 0) {
      const { error } = await supabase
        .from("fragrances")
        .update({ concentration: null, concentration_source: null })
        .eq("concentration_source", "ai");
      if (error) {
        console.error("  wipe failed:", error.message);
        process.exit(1);
      }
      console.log(`  wiped ${count}.`);
    } else if (DRY) {
      console.log(`  [dry] would wipe ${count ?? 0}.`);
    }
    console.log("");
  }

  // ---- Step 2: load the whole catalog -------------------------------------
  // Loaded up front rather than streamed, because sibling subtraction needs
  // to see a row's whole house before it can judge that row.
  console.log("--- Step 2: load catalog ---");
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("fragrances")
      .select("id, name, house, concentration, concentration_source")
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1)
      .returns<Row[]>();
    if (error) {
      console.error("query failed:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  const catalog = LIMIT ? rows.slice(0, LIMIT) : rows;
  const siblings = buildSiblingIndex(rows);
  console.log(`  rows: ${rows.length}   bare names with named siblings: ${siblings.size}\n`);

  // ---- Step 3: derive from retail SKU titles ------------------------------
  console.log("--- Step 3: derive from retail SKU titles ---");
  let processed = 0;
  let matched = 0;
  let ambiguous = 0;
  let written = 0;
  let deduced = 0;
  const byType: Record<Concentration, number> = { edt: 0, edp: 0, parfum: 0, extrait: 0 };
  const conflicts: string[] = [];
  const deductions: string[] = [];

  {
    for (const row of catalog) {
      processed++;
      // A concentration stated in the fragrance's own name beats a retailer's.
      if (row.concentration_source === "name") continue;

      // Union across key forms. If the exact-house and bridged-house keys
      // disagree, that is a genuine ambiguity and must not be resolved by
      // key-precedence — treat it like any other conflict.
      const found = new Set<Concentration>();
      for (const k of keysFor(row.house, row.name)) {
        const e = feed.get(k);
        if (e) for (const v of e.values) found.add(v);
      }
      if (found.size === 0) continue;
      matched++;

      let value: Concentration;
      let viaDeduction = false;

      if (found.size > 1) {
        // Subtract strengths already claimed by this fragrance's own named
        // siblings. Accept only when exactly one candidate survives.
        const claimed = siblings.get(`${normHouse(row.house)}::${nameKey(row.name)}`);
        const remaining = claimed
          ? [...found].filter((v) => !claimed.has(v))
          : [...found];

        if (remaining.length !== 1) {
          ambiguous++;
          if (conflicts.length < 15) {
            conflicts.push(
              `  ${row.house} — ${row.name}  (feed has ${[...found].join("/")}` +
                (claimed ? `, siblings claim ${[...claimed].join("/")}` : "") +
                `)`,
            );
          }
          continue;
        }
        value = remaining[0];
        viaDeduction = true;
        deduced++;
        if (deductions.length < 12) {
          deductions.push(
            `  ${row.house} — ${row.name}: ${[...found].join("/")} minus sibling ${[...(claimed as Set<Concentration>)].join("/")} → ${value}`,
          );
        }
      } else {
        value = [...found][0];
      }

      if (row.concentration === value && row.concentration_source === "feed") continue;
      byType[value]++;

      if (DRY) {
        if (written < 20) {
          console.log(`  [dry] ${row.house} — ${row.name} → ${value}${viaDeduction ? " (deduced)" : ""}`);
        }
        written++;
        continue;
      }

      const { error: upErr } = await supabase
        .from("fragrances")
        .update({ concentration: value, concentration_source: "feed" })
        .eq("id", row.id);
      if (upErr) console.warn(`  ! ${row.name}: ${upErr.message}`);
      else written++;
    }
  }

  console.log("");
  console.log(
    `Done. scanned=${processed} feed_matched=${matched} ambiguous_skipped=${ambiguous} deduced_from_siblings=${deduced} written=${written}`,
  );
  console.log(`Resolved: EDT=${byType.edt} EDP=${byType.edp} Parfum=${byType.parfum} Extrait=${byType.extrait}`);

  const totalResolved = byType.edt + byType.edp;
  if (totalResolved > 50) {
    const edtPct = (byType.edt / totalResolved) * 100;
    console.log(`\nSanity check: EDT is ${edtPct.toFixed(1)}% of EDT+EDP writes.`);
    // The retail ground-truth split is roughly 45/55. Anything near 0 or 100
    // means the title parser regressed, not that the catalog is unusual.
    if (edtPct < 15 || edtPct > 85) {
      console.log("  ^ WARNING: that is far from the ~45% retail baseline. Inspect");
      console.log("    concentrationFromTitle() before trusting this run.");
    } else {
      console.log("  Consistent with the ~45% retail baseline.");
    }
  }

  if (deductions.length) {
    console.log(`\nDeduced by sibling subtraction (multi-strength fragrances resolved`);
    console.log(`by removing what their own named flanker entries already claim):`);
    deductions.forEach((d) => console.log(d));
    if (deduced > deductions.length) console.log(`  ...and ${deduced - deductions.length} more.`);
  }

  if (conflicts.length) {
    console.log(`\nStill ambiguous (left NULL — more than one candidate survives):`);
    conflicts.forEach((c) => console.log(c));
    if (ambiguous > conflicts.length) console.log(`  ...and ${ambiguous - conflicts.length} more.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

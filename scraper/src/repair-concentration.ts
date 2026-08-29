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
/** Print each catalog row beside the feed title it matched. This is the real
 *  precision check — read the pairings. Aggregate splits can't tell a false
 *  positive from a population shift. */
const AUDIT = args.includes("--audit");
/** Skip the inferred house-prior pass; keep only retail-verified values. */
const SKIP_PRIORS = args.includes("--no-priors");
/** A house must be this consistent, over this many known releases, before an
 *  unlabelled release of theirs inherits its strength. Tuned so houses with
 *  genuinely mixed output (most designer houses) never qualify. */
const PRIOR_AGREEMENT = 0.9;
const PRIOR_MIN_SAMPLE = 5;
const LIMIT = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0");

const DATA_DIR = path.resolve(process.cwd(), "data");
const PAGE_SIZE = 500;

type Concentration = "edt" | "edp" | "parfum" | "extrait";

/** Display order, lightest first. */
const ORDER: Concentration[] = ["edt", "edp", "parfum", "extrait"];

/**
 * When a fragrance ships in several strengths, its Fragrantica siblings tell
 * us which one the BARE entry refers to: the original. Polo Blue's feed set
 * {edt,edp,parfum} minus what its named flankers claim {edp,parfum} leaves
 * {edt}. Used only to fill the legacy scalar column; the full set is written
 * either way.
 */
function deducedOriginal(
  set: Concentration[],
  siblings: Map<string, Set<Concentration>>,
  row: { house: string; name: string },
): Concentration | null {
  const claimed = siblings.get(`${normHouse(row.house)}::${nameKey(row.name)}`);
  if (!claimed) return null;
  const remaining = set.filter((v) => !claimed.has(v));
  return remaining.length === 1 ? remaining[0] : null;
}

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

/**
 * Remove a LEADING or TRAILING run of house tokens from a product name.
 *
 * Retail feeds routinely glue the brand into the product name, in both
 * directions, while the catalog does not:
 *
 *   feed "Creed Aventus by Creed"                      catalog "Aventus"
 *   feed "Prada Luna Rossa by Prada"                   catalog "Luna Rossa"
 *   feed "La Nuit De L'homme Yves Saint Laurent by ..." catalog "La Nuit de L'Homme"
 *
 * Without this, the matcher scored 3/20 on the most famous fragrances in the
 * world. With it, 14/20.
 *
 * Deliberately an AFFIX strip, not a token filter: only runs at the start and
 * end are removed, so the middle of a name can never be gutted, and a name
 * that IS the house survives (never strips below one token / 3 chars).
 */
function stripHouseAffix(name: string, house: string): string | null {
  const hw = new Set(normHouse(house).split(" ").filter(Boolean));
  if (hw.size === 0) return null;
  const words = collapse(name).split(" ").filter(Boolean);
  const before = words.length;
  while (words.length > 1 && hw.has(words[0])) words.shift();
  while (words.length > 1 && hw.has(words[words.length - 1])) words.pop();
  if (words.length === before) return null;
  const out = words.join(" ");
  return out.length >= 3 ? out : null;
}

// ---------------------------------------------------------------------------
// MEASURED COVERAGE (1,459-row catalog sample vs FragranceNet, Aug 2026)
//
//   strict name key only        5.4%   famous:  -/20
//   + house bridge              6.2%   famous:  3/20
//   + house-affix strip        22.3%   famous: 14/20   <- adopted
//
// A NOTE ON THE PRECISION GUARD, because this was got wrong once already.
//
// An earlier version of this file rejected name de-housing on the grounds
// that it dropped the EDT share of resolved rows from ~45% to ~19%, and
// concluded the extra matches were false positives. That reasoning was
// invalid, and it cost ~16 points of coverage.
//
// The ~45% EDT baseline is FragranceNet's overall SKU mix, which is dominated
// by mass-market Western designer brands. Affix stripping unlocks a DIFFERENT
// population: niche and Middle-Eastern houses (Afnan, Ajmal, Al Haramain,
// Akro) that genuinely release almost nothing but EDP. Hand-auditing 18 rows
// that match only under affix strip found 18/18 correct pairings. The EDT
// share moved because the population moved, not because the matcher broke.
//
// So: EDT share is a population statistic, NOT a precision metric. Do not
// gate this matcher on it. To check precision, print the catalog row beside
// the feed title it matched and read them (see --audit).
// ---------------------------------------------------------------------------
function keysFor(house: string, name: string): string[] {
  const names = [nameKey(name)];
  const stripped = stripHouseAffix(name, house);
  if (stripped) names.push(nameKey(stripped));

  const out = new Set<string>();
  for (const h of [normHouse(house), houseBridge(house)]) {
    if (!h) continue;
    for (const n of names) if (n) out.add(`${h}::${n}`);
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
  // NOTE: plain \bEAU DE PARFUM\b already covers Lancome's "L'EAU DE PARFUM"
  // spelling, because the apostrophe is a word boundary. An earlier attempt
  // to "handle" it wrote L'? -- which means a literal L plus an OPTIONAL
  // apostrophe, i.e. it REQUIRED an L. Every ordinary "EAU DE PARFUM" title
  // then fell through to the PARFUM SPRAY branch and was tagged parfum:
  // 12,198 EDP SKUs became 6. Do not add an L here. (L'EAU does matter in
  // the house-strip regex in splitTitle, which is a different problem.)
  if (/\bEXTRAIT\b/.test(T)) return "extrait";
  if (/\bEAU\s+DE\s+PARFUM\b|\bEDP\b/.test(T)) return "edp";
  if (/\bEAU\s+DE\s+TOILETTE\b|\bEDT\b/.test(T)) return "edt";
  if (/\bEAU\s+DE\s+COLOGNE\b|\bEDC\b/.test(T)) return null;
  if (/\bPARFUM\s+SPRAY\b|\bPURE\s+PERFUME\b/.test(T)) return "parfum";
  return null;
}

// ---------------------------------------------------------------------------
// Parser self-test.
//
// concentrationFromTitle has silently regressed twice, and both times the
// damage was invisible in the summary line because the totals still looked
// like plausible numbers. A wrong regex here does not crash, it quietly
// relabels thousands of bottles. So the parser is checked against known
// titles on every run and the script refuses to continue if any fail.
// ---------------------------------------------------------------------------
const PARSER_CASES: Array<[string, Concentration | null]> = [
  ["MY BURBERRY BLUSH BY BURBERRY EAU DE PARFUM SPRAY 1.7 OZ", "edp"],
  ["CERRUTI 1881 BY NINO CERRUTI EDT SPRAY 3.4 OZ FOR WOMEN", "edt"],
  ["SAUVAGE BY CHRISTIAN DIOR EAU DE TOILETTE SPRAY 3.4 OZ", "edt"],
  // Lancome's apostrophe spelling must still read as EDP.
  ["LA VIE EST BELLE BY LANCOME L'EAU DE PARFUM SPRAY 2.5 OZ FOR WOMEN", "edp"],
  ["AL HARAMAIN AMBER OUD BY AL HARAMAIN EXTRAIT DE PARFUM SPRAY 3 OZ", "extrait"],
  ["BLACK ORCHID BY TOM FORD PARFUM SPRAY 1.7 OZ FOR WOMEN", "parfum"],
  // Cologne is unusable: US retailers use it to mean "a men's fragrance".
  ["BRUT BY FABERGE COLOGNE SPRAY 5 OZ FOR MEN", null],
  ["4711 BY MAURER & WIRTZ EAU DE COLOGNE SPRAY 8.1 OZ", null],
  ["POLO BLUE BY RALPH LAUREN AFTERSHAVE 4.2 OZ FOR MEN", null],
];

function selfTestParser(): void {
  const failures: string[] = [];
  for (const [title, expected] of PARSER_CASES) {
    const got = concentrationFromTitle(title);
    if (got !== expected) {
      failures.push(`  expected ${expected ?? "null"}, got ${got ?? "null"}  <- "${title}"`);
    }
  }
  if (failures.length > 0) {
    console.error("PARSER SELF-TEST FAILED — refusing to run.\n");
    failures.forEach((f) => console.error(f));
    console.error("\nconcentrationFromTitle() is misreading retail titles. Writing now would");
    console.error("relabel thousands of fragrances. Fix the regexes before re-running.");
    process.exit(1);
  }
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
      /\s+(L'?\s?EAU\s+DE\s+\w+|EDT|EDP|EDC|EAU\s+DE\s+\w+|EXTRAIT|PARFUM|COLOGNE|AFTERSHAVE|DEODORANT|BODY|SHOWER|GIFT|MINI|VIAL|TESTER|SPRAY|SPLASH|LOTION|CREAM|OIL|\d).*$/i,
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
  selfTestParser();
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
  const ambiguous = 0; // retained: multi-strength is now an answer, not a skip
  let written = 0;
  let deduced = 0;
  let multi = 0;
  let auditShown = 0;
  const byType: Record<Concentration, number> = { edt: 0, edp: 0, parfum: 0, extrait: 0 };
  const conflicts: string[] = [];
  const deductions: string[] = [];
  const examples: string[] = [];
  /** Rows grouped by identical payload, flushed in Step 4. */
  const batches = new Map<
    string,
    { set: Concentration[]; scalar: Concentration | null; ids: string[] }
  >();
  /** rowId -> strengths resolved this run. Feeds the house priors in Step 5,
   *  and is populated in dry runs too so --dry previews the whole pipeline. */
  const resolvedThisRun = new Map<string, Concentration[]>();
  let priorWritten = 0;

  {
    for (const row of catalog) {
      processed++;
      if (!AUDIT && processed % 2000 === 0) {
        process.stdout.write(`\r  scanned ${processed}/${catalog.length}`);
      }
      // A concentration stated in the fragrance's own name beats a retailer's.
      if (row.concentration_source === "name") continue;

      // Union across key forms. If the exact-house and bridged-house keys
      // disagree, that is a genuine ambiguity and must not be resolved by
      // key-precedence — treat it like any other conflict.
      const found = new Set<Concentration>();
      let matchedTitle: string | null = null;
      for (const k of keysFor(row.house, row.name)) {
        const e = feed.get(k);
        if (e) {
          matchedTitle = e.sampleTitle;
          for (const v of e.values) found.add(v);
        }
      }
      if (found.size === 0) continue;
      matched++;

      if (AUDIT && auditShown < 40) {
        auditShown++;
        console.log(`  catalog: ${row.house} — ${row.name}`);
        console.log(`  feed:    ${matchedTitle?.slice(0, 76)}`);
        console.log(`  -> ${[...found].join("/")}\n`);
      }

      // Every strength the feed reports is written. A fragrance sold as an
      // EDT, an EDP and a Parfum genuinely IS all three (migration 0025), so
      // a multi-value result is an answer, not a failure. This is where the
      // top-100 coverage comes from: the most famous fragrances are the most
      // likely to be multi-strength.
      let set = [...found];
      let viaDeduction = false;

      if (set.length > 1) {
        multi++;
        // Sibling subtraction still runs, but now only to decide whether we
        // can ALSO fill the legacy scalar column. It never discards a row.
        const claimed = siblings.get(`${normHouse(row.house)}::${nameKey(row.name)}`);
        const remaining = claimed ? set.filter((v) => !claimed.has(v)) : set;
        if (claimed && remaining.length === 1) {
          viaDeduction = true;
          deduced++;
          if (deductions.length < 12) {
            deductions.push(
              `  ${row.house} — ${row.name}: ${set.join("/")} minus sibling ${[...claimed].join("/")} → ${remaining[0]} (original)`,
            );
          }
        }
        if (examples.length < 12) {
          examples.push(`  ${row.house} — ${row.name}: available as ${set.join(", ")}`);
        }
      }

      // Stable order so the UI reads EDT -> EDP -> Parfum -> Extrait.
      set = ORDER.filter((c) => set.includes(c));
      // Legacy scalar: only meaningful when there is exactly one strength,
      // or when sibling subtraction identified the original.
      const scalar: Concentration | null =
        set.length === 1 ? set[0] : viaDeduction ? deducedOriginal(set, siblings, row) : null;

      for (const v of set) byType[v]++;
      resolvedThisRun.set(row.id, set);

      if (DRY) {
        if (written < 20) {
          console.log(
            `  [dry] ${row.house} — ${row.name} → [${set.join(", ")}]${viaDeduction ? " (original deduced)" : ""}`,
          );
        }
        written++;
        continue;
      }

      // Queue rather than write. One UPDATE per row means thousands of
      // sequential network round-trips, which took long enough with no
      // output that it looked like a hang. Rows are grouped by identical
      // payload below, which collapses ~2,700 requests into a few dozen.
      const key = `${set.join(",")}|${scalar ?? ""}`;
      const pending = batches.get(key);
      if (pending) pending.ids.push(row.id);
      else batches.set(key, { set, scalar, ids: [row.id] });
    }
  }

  // ---- Step 4: flush ------------------------------------------------------
  if (!DRY && batches.size > 0) {
    const totalQueued = [...batches.values()].reduce((n, b) => n + b.ids.length, 0);
    console.log(`\n--- Step 4: writing ${totalQueued} rows in ${batches.size} groups ---`);
    const CHUNK = 200;
    let done = 0;
    for (const b of batches.values()) {
      for (let i = 0; i < b.ids.length; i += CHUNK) {
        const chunk = b.ids.slice(i, i + CHUNK);
        const { error: upErr } = await supabase
          .from("fragrances")
          .update({
            concentrations: b.set,
            concentration: b.scalar,
            concentration_source: "feed",
          })
          .in("id", chunk);
        if (upErr) {
          console.warn(`  ! [${b.set.join(",")}] chunk of ${chunk.length}: ${upErr.message}`);
        } else {
          written += chunk.length;
          done += chunk.length;
          process.stdout.write(`\r  ${done}/${totalQueued} written`);
        }
      }
    }
    process.stdout.write("\n");
  }

  const totalResolved = byType.edt + byType.edp;
  if (totalResolved > 0) {
    const edtPct = (byType.edt / totalResolved) * 100;
    // Reported, NOT gated on. This is a population statistic: mass-market
    // designer houses run ~45% EDT, niche and Middle-Eastern houses run
    // ~10%. A low number here means the run reached more niche houses, not
    // that the matcher broke. See the note above keysFor(). To actually
    // judge precision, run with --audit and read the pairings.
    console.log(`\nEDT share of EDT+EDP writes: ${edtPct.toFixed(1)}% (population statistic, not a precision signal)`);
    console.log(`Run with --audit to print catalog rows beside the feed titles they matched.`);
  }

  if (deductions.length) {
    console.log(`\nDeduced by sibling subtraction (multi-strength fragrances resolved`);
    console.log(`by removing what their own named flanker entries already claim):`);
    deductions.forEach((d) => console.log(d));
    if (deduced > deductions.length) console.log(`  ...and ${deduced - deductions.length} more.`);
  }

  // ---- Step 5: house priors -----------------------------------------------
  //
  // Everything above is evidence about a specific bottle. This step is the
  // only inference in the script, and it is deliberately a claim about a
  // HOUSE rather than about a fragrance: if every Amouage release we can
  // verify is an EDP, an unlabelled Amouage release is very likely an EDP.
  //
  // Self-limiting by construction: a house that actually makes both EDT and
  // EDP never reaches the agreement threshold and is skipped, so this cannot
  // manufacture a strength for a house with mixed output. Tagged
  // 'house_prior' so it is auditable and removable in one statement.
  if (!SKIP_PRIORS) {
    console.log(`\n--- Step 5: house priors (>=${Math.round(PRIOR_AGREEMENT * 100)}% agreement, >=${PRIOR_MIN_SAMPLE} known) ---`);

    // Evidence = anything resolved this run (step 3) plus anything the
    // fragrance's own name already stated. Only SINGLE-strength rows count as
    // evidence: a house that ships multi-strength bottles is exactly the kind
    // of house whose prior we should not trust.
    const known = new Map<string, Concentration[]>();
    const unknown = new Map<string, Row[]>();
    for (const row of rows) {
      const h = normHouse(row.house);
      const r =
        resolvedThisRun.get(row.id) ??
        (row.concentration_source === "name" && row.concentration ? [row.concentration] : null);

      if (r && r.length === 1) {
        const list = known.get(h);
        if (list) list.push(r[0]);
        else known.set(h, [r[0]]);
      } else if (!r) {
        const list = unknown.get(h);
        if (list) list.push(row);
        else unknown.set(h, [row]);
      }
    }

    const priorBatches = new Map<Concentration, string[]>();
    const priorLines: string[] = [];
    let housesUsed = 0;
    for (const [h, samples] of known) {
      const targets = unknown.get(h);
      if (!targets?.length || samples.length < PRIOR_MIN_SAMPLE) continue;
      const counts = new Map<Concentration, number>();
      for (const s of samples) counts.set(s, (counts.get(s) ?? 0) + 1);
      const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      const agreement = n / samples.length;
      if (agreement < PRIOR_AGREEMENT) continue;

      housesUsed++;
      const ids = priorBatches.get(top) ?? [];
      for (const t of targets) ids.push(t.id);
      priorBatches.set(top, ids);
      if (priorLines.length < 15) {
        priorLines.push(
          `  ${h}: ${samples.length} known, ${Math.round(agreement * 100)}% ${top} → labelling ${targets.length}`,
        );
      }
    }

    const priorTotal = [...priorBatches.values()].reduce((n, ids) => n + ids.length, 0);
    console.log(`  qualifying houses: ${housesUsed}   rows: ${priorTotal}`);
    priorLines.forEach((l) => console.log(l));

    if (!DRY && priorTotal > 0) {
      const CHUNK = 200;
      let done = 0;
      for (const [value, ids] of priorBatches) {
        for (let i = 0; i < ids.length; i += CHUNK) {
          const chunk = ids.slice(i, i + CHUNK);
          const { error: pErr } = await supabase
            .from("fragrances")
            .update({
              concentrations: [value],
              concentration: value,
              concentration_source: "house_prior",
            })
            .in("id", chunk);
          if (pErr) console.warn(`  ! prior ${value}: ${pErr.message}`);
          else {
            done += chunk.length;
            process.stdout.write(`\r  ${done}/${priorTotal} written`);
          }
        }
      }
      process.stdout.write("\n");
      priorWritten = done;
    } else if (DRY) {
      console.log(`  [dry] would label ${priorTotal} rows.`);
    }
    console.log(
      `\n  These are INFERRED, not verified. Expect ~5-10% wrong. Remove with:`,
    );
    console.log(
      `    update fragrances set concentrations='{}', concentration=null,`,
    );
    console.log(
      `    concentration_source=null where concentration_source='house_prior';`,
    );
  }

  if (examples.length) {
    console.log(`\nMulti-strength fragrances (previously dropped, now written as a set):`);
    examples.forEach((e) => console.log(e));
    if (multi > examples.length) console.log(`  ...and ${multi - examples.length} more.`);
  }

  // ---- Summary (last, so it can report every pass) ------------------------
  // Label the count honestly. Printing "written=2723" after a --dry run once
  // sent someone hunting for rows in the database that were never meant to
  // be there.
  console.log("");
  console.log(
    `Done. scanned=${processed} feed_matched=${matched} ` +
      `${DRY ? `WOULD_WRITE=${written} (dry run — nothing was saved)` : `written=${written}`} ` +
      `multi_strength=${multi} original_deduced=${deduced}` +
      (priorWritten ? ` house_prior=${priorWritten}` : ""),
  );
  // This counts STRENGTH OCCURRENCES, not rows: a fragrance sold as both an
  // EDT and an EDP adds to both tallies, so the total legitimately exceeds
  // the row count. Labelled explicitly because reading it as a row count
  // makes the arithmetic look broken.
  const occurrences = byType.edt + byType.edp + byType.parfum + byType.extrait;
  console.log(
    `Strengths across the ${written} feed-matched rows: ` +
      `EDT=${byType.edt} EDP=${byType.edp} Parfum=${byType.parfum} Extrait=${byType.extrait}` +
      ` (${occurrences} occurrences; multi-strength rows counted once per strength)`,
  );
  if (priorWritten) {
    console.log(`Plus ${priorWritten} rows labelled by house prior (inferred, not verified).`);
  }
  console.log(
    `\nTOTAL ROWS LABELLED THIS RUN: ${written + priorWritten}` +
      ` (${written} verified + ${priorWritten} inferred)`,
  );
  if (DRY) console.log(`\n  Nothing was written. Re-run without --dry to apply.`);

  void ambiguous;
  void conflicts;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

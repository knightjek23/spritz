// Fix wrong FragranceNet Buy links found by scrape-fragrancenet.ts.
//
// INPUT (all local; the database is only touched with --write)
//   * the latest data/fragrancenet-offer-mismatches-<time>.csv: offers whose
//     FragranceNet page is a different fragrance, the men's or women's
//     version, a different strength, or a gift set
//   * the latest data/fragrancenet-(dry|write)-<time>.json report: adds the
//     offers whose page no longer exists (HTTP 404), and tells us which other
//     catalog rows already use a given FragranceNet page correctly
//   * the FragranceNet Rakuten feed, data/rakuten/216_4736579_mp.txt: every
//     SKU with its full retail title, "<NAME> by <HOUSE> <TYPE> <SIZE> for
//     <GENDER>", so the right strength / gender / non-set bottle can be found
//
// EACH OFFER GETS ONE ACTION
//   repoint         the feed has the right bottle (same fragrance, strength
//                   and gender, a regular bottle, not a set/tester/mini): the
//                   offer's link and price are replaced with that SKU's
//   remove          FragranceNet sells the fragrance, but not this version:
//                   the offer is deleted, so the Buy button falls back to
//                   FragranceNet search instead of the wrong product
//   check_strength  FragranceNet sells only another strength and no other
//                   catalog row covers it: the catalog's strength may be the
//                   thing that is wrong (Black Afgano listed as EDP, sold as
//                   Parfum). Never written; listed for a person to decide
//   not_in_feed     the fragrance is not in the feed at all. Never written;
//                   listed for review (the feed is a snapshot and may be stale)
//
// SAFE BY DEFAULT
//   * Dry run unless --write. Writes only repoint and remove.
//   * Every change is saved with the old link and price in
//     data/fragrancenet-offer-fixes-<mode>-<time>.csv, so it can be undone.
//
// Usage (run from scraper/):
//   pnpm fix:fragrancenet-offers           # dry run: plan CSV + summary
//   pnpm fix:fragrancenet-offers --write   # apply repoint + remove
//   flags: --mismatches=<csv> --report=<json> --feed=<txt>
//
// After a --write run, refetch the repointed pages so their notes can be
// checked: pnpm scrape:fragrancenet --only=<the ids file this script prints> --refresh

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const opt = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const WRITE = args.includes("--write");
const FEED = path.resolve(opt("feed") ?? "data/rakuten/216_4736579_mp.txt");

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

export type Strength = "edt" | "edp" | "parfum" | "extrait" | "edc" | "elixir";
export type FeedGender = "masculine" | "feminine" | "unisex";

/** Lowercase, accents stripped, punctuation to spaces. */
export function key(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STRENGTH_WORDS =
  /\b(eau de parfum|eau de toilette|eau de cologne|extrait de parfum|extrait|edp|edt|edc|parfum|cologne|spray|perfume)\b/g;

/** Name without strength words: "Black Orchid Eau de Toilette" -> "black orchid". */
export function baseName(name: string): string {
  return key(name).replace(STRENGTH_WORDS, " ").replace(/\s+/g, " ").trim();
}

/** Strength from free text: a catalog name or a feed TYPE ("EAU DE PARFUM SPRAY"). */
export function strengthOf(s: string): Strength | null {
  const k = ` ${key(s)} `;
  if (k.includes(" elixir ")) return "elixir";
  if (k.includes(" extrait ") || k.includes(" parfum extract ") || k.includes(" extract ")) return "extrait";
  if (k.includes(" eau de parfum ") || k.includes(" edp ")) return "edp";
  if (k.includes(" eau de toilette ") || k.includes(" edt ")) return "edt";
  if (k.includes(" eau de cologne ") || k.includes(" edc ")) return "edc";
  if (k.includes(" parfum ")) return "parfum";
  return null;
}

const HOUSE_STOP = new Set(["by", "parfums", "parfum", "paris", "the", "fragrances", "perfumes", "maison", "de"]);
const houseTokens = (h: string) => key(h).split(" ").filter((t) => t && !HOUSE_STOP.has(t));

/** "Rabanne" ~ "Paco Rabanne", "Versace" ~ "Gianni Versace", "By Kilian" ~ "Kilian". */
export function sameHouse(a: string, b: string): boolean {
  const ta = houseTokens(a);
  const tb = houseTokens(b);
  if (ta.length === 0 || tb.length === 0) return key(a) === key(b);
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((t) => long.includes(t));
}

export interface FeedRow {
  sku: string;
  title: string;
  name: string;      // before " by "
  house: string;     // manufacturer field
  typeText: string;  // trailing upper-case run: "EAU DE PARFUM SPRAY 3.4 OZ"
  strength: Strength | null;
  gender: FeedGender | null;
  category: string;
  url: string;
  price: number | null;
  inStock: boolean;
  sizeOz: number;
  regularBottle: boolean;
}

/** Parse one pipe-delimited Rakuten feed line (see rakuten-to-csv.ts). */
export function parseFeedLine(line: string): FeedRow | null {
  const p = line.split("|");
  if (p.length < 30 || p[0] === "HDR") return null;
  const title = p[1] ?? "";
  const by = title.lastIndexOf(" by ");
  if (by < 0) return null;
  const gm = / for (MEN|WOMEN|UNISEX)\s*$/i.exec(title);
  const gender: FeedGender | null = !gm
    ? null
    : gm[1].toUpperCase() === "MEN" ? "masculine" : gm[1].toUpperCase() === "WOMEN" ? "feminine" : "unisex";
  const rest = title.slice(by + 4, gm ? gm.index : undefined).trim();
  // TYPE + SIZE is the trailing run of words with no lower-case letters.
  const words = rest.split(" ");
  let i = words.length;
  while (i > 0 && !/[a-z]/.test(words[i - 1])) i--;
  const typeText = words.slice(i).join(" ");
  const oz = /(\d+(?:\.\d+)?)\s*OZ\b/i.exec(typeText);
  const ml = /(\d+(?:\.\d+)?)\s*ML\b/i.exec(typeText);
  const sizeOz = oz ? Number(oz[1]) : ml ? Number(ml[1]) / 29.57 : 0;
  const category = p[4] ?? "";
  const regularBottle =
    category === "Fragrances" &&
    !/\b(SET|GIFT|PC|PIECE|TESTER|MINI|VIAL|SAMPLE|SACHET|TRAVEL|REFILL|UNBOXED|DAMAGED|COFFRET|DUO|TRIO)\b/i.test(typeText) &&
    !/\b(set|gift)\b/i.test(title);
  const price = Number(p[13]);
  return {
    sku: p[2] ?? "",
    title,
    name: title.slice(0, by).trim(),
    house: (p[20] ?? "").trim(),
    typeText,
    strength: strengthOf(typeText),
    gender,
    category,
    url: p[5] ?? "",
    price: Number.isFinite(price) && price > 0 ? price : null,
    inStock: (p[22] ?? "").toLowerCase() === "in-stock",
    sizeOz,
    regularBottle,
  };
}

/** FragranceNet SKU at the end of a legacy murl path or a current page URL hash. */
export function skuOf(url: string): string | null {
  let u = url;
  try {
    const parsed = new URL(url);
    const murl = parsed.searchParams.get("murl");
    if (murl) u = murl;
  } catch {
    /* plain string */
  }
  const m = /\/(\d{5,7})(?:[/?#]|$)/.exec(u) ?? /#(\d{5,7})$/.exec(u);
  return m ? m[1] : null;
}

export type Action = "repoint" | "remove" | "keep" | "check_strength" | "not_in_feed";

// Flankers whose NAME is the strength: FragranceNet types them by their
// actual juice ("Libre Le Parfum" EAU DE PARFUM, "Sauvage Elixir" PARFUM), so a
// strength clash on these is labelling, not a wrong product.
const NAMED_STRENGTH = /\b(le parfum|elixir|absolu|absolu de parfum|extreme|nectar de parfum|fleur de parfum|parfum concentre|concentre|intense)\b/;

export interface Want {
  name: string;
  pageGone?: boolean;
  house: string;
  gender: FeedGender | null;
  strength: Strength | null;
}

export interface Plan {
  action: Action;
  why: string;
  pick: FeedRow | null;
}

// Short house names FragranceNet glues onto product names.
const HOUSE_ALIASES = ["ysl", "dior", "cd", "paco", "jpg", "pdm", "by"];

/** Name with the house stripped from both ends and strength words removed.
 *  FragranceNet writes "Dior Sauvage Elixir", "Libre Yves Saint Laurent",
 *  "Mon Paris Ysl"; the catalog writes "Sauvage Elixir", "Libre", "Mon Paris". */
export function cleanName(name: string, houses: string[]): string {
  const strip = new Set([...houses.flatMap(houseTokens), ...houses.flatMap((h) => key(h).split(" ")), ...HOUSE_ALIASES]);
  const t = baseName(name).split(" ").filter(Boolean);
  let a = 0;
  let b = t.length;
  while (a < b - 1 && strip.has(t[a])) a++;
  while (b > a + 1 && strip.has(t[b - 1])) b--;
  return t.slice(a, b).join(" ");
}

/** Decide what to do with one offer, given every feed row for its house. */
export function planFor(want: Want, feed: FeedRow[], otherRowCoversPage: boolean, currentSku: string | null): Plan {
  const sameFragrance = feed.filter((r) => {
    if (!sameHouse(r.house, want.house)) return false;
    const houses = [r.house, want.house];
    return cleanName(r.name, houses) === cleanName(want.name, houses);
  });
  if (sameFragrance.length === 0) {
    return want.pageGone
      ? { action: "remove", why: "page gone and the fragrance is not in the FragranceNet feed", pick: null }
      : { action: "not_in_feed", why: "fragrance not in the FragranceNet feed", pick: null };
  }

  const genderOk = (r: FeedRow) =>
    !want.gender || want.gender === "unisex" || !r.gender || r.gender === "unisex" || r.gender === want.gender;
  const bottles = sameFragrance.filter((r) => r.regularBottle && genderOk(r));
  const right = bottles.filter((r) => !want.strength || r.strength === want.strength || (!r.strength && want.strength === "edc"));

  if (right.length > 0) {
    // In stock first, then a spray, then the size nearest the standard 3.4 oz.
    const spray = (r: FeedRow) => /\bSPRAY\b/.test(r.typeText);
    right.sort(
      (a, b) =>
        Number(b.inStock) - Number(a.inStock) ||
        Number(spray(b)) - Number(spray(a)) ||
        Math.abs(a.sizeOz - 3.4) - Math.abs(b.sizeOz - 3.4),
    );
    const pick = right[0];
    if (currentSku && right.some((r) => r.sku === currentSku)) {
      return { action: "not_in_feed", why: "offer already points at a matching SKU; the page title disagrees", pick: null };
    }
    return { action: "repoint", why: `feed has ${right.length} matching bottle(s)`, pick };
  }

  const strengthsSold = [...new Set(bottles.map((r) => r.strength ?? "?"))];
  if (bottles.length > 0 && NAMED_STRENGTH.test(key(want.name)) && !want.pageGone) {
    return {
      action: "keep",
      why: `name carries the strength; FragranceNet types it as ${strengthsSold.join(", ")}, the offer is the right product`,
      pick: null,
    };
  }
  if (want.strength && bottles.length > 0 && !otherRowCoversPage && strengthsSold.length === 1) {
    return {
      action: "check_strength",
      why: `FragranceNet sells it only as ${strengthsSold[0]}; catalog says ${want.strength} and no other row covers ${strengthsSold[0]}`,
      pick: null,
    };
  }
  return {
    action: "remove",
    why:
      bottles.length === 0
        ? "FragranceNet sells no regular bottle of this version (sets, minis or other gender only)"
        : `FragranceNet sells it as ${strengthsSold.join(", ")}, not ${want.strength ?? "this version"}`,
    pick: null,
  };
}

/** Minimal RFC 4180 CSV reader. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.length > 1 || r[0]);
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

async function latest(dir: string, re: RegExp): Promise<string | null> {
  const names = (await fs.readdir(dir)).filter((n) => re.test(n)).sort();
  return names.length ? path.join(dir, names[names.length - 1]) : null;
}

interface Item {
  fragrance_id: string;
  house: string;
  name: string;
  gender: FeedGender | null;
  concentration: string | null;
  popularity_rank: number | null;
  reason: string;
  page_title: string;
  fragrancenet_url: string;
  offer_url: string;
}

async function main() {
  const dataDir = path.resolve("data");
  const mismatchFile = opt("mismatches") ?? (await latest(dataDir, /^fragrancenet-offer-mismatches-.*\.csv$/));
  const reportFile = opt("report") ?? (await latest(dataDir, /^fragrancenet-(dry|write)-.*\.json$/));
  if (!mismatchFile || !reportFile) {
    console.error("[fix:fragrancenet-offers] run `pnpm scrape:fragrancenet` first: no mismatch CSV or report in data/");
    process.exit(1);
  }

  let supabase: SupabaseClient<any, "public", any> | null = null;
  if (WRITE) {
    for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
      if (!process.env[k]) {
        console.error(`[fix:fragrancenet-offers] missing ${k} in scraper/.env`);
        process.exit(1);
      }
    }
    supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
  }

  console.log("--- Spritz: fix FragranceNet Buy links ---");
  console.log(`  mode:       ${WRITE ? "WRITE (repoint + remove)" : "dry run (no DB writes)"}`);
  console.log(`  mismatches: ${path.relative(process.cwd(), mismatchFile)}`);
  console.log(`  report:     ${path.relative(process.cwd(), reportFile)}`);

  const feed: FeedRow[] = [];
  for (const line of (await fs.readFile(FEED, "utf8")).split(/\r?\n/)) {
    const r = parseFeedLine(line);
    if (r) feed.push(r);
  }
  console.log(`  feed:       ${feed.length} SKUs`);

  const report = JSON.parse(await fs.readFile(reportFile, "utf8")) as {
    report: { fragrance_id: string; house: string; name: string; popularity_rank: number | null; verdict: string; fragrancenet_url: string | null; error: string | null }[];
  };
  const BAD = new Set(["wrong_page", "wrong_gender", "wrong_strength", "gift_set", "fetch_error"]);
  // Pages a correct catalog row already uses.
  const goodPages = new Map<string, string>();
  for (const r of report.report) {
    if (!BAD.has(r.verdict) && r.fragrancenet_url) goodPages.set(r.fragrancenet_url, r.fragrance_id);
  }

  const items: Item[] = parseCsv(await fs.readFile(mismatchFile, "utf8")).map((m) => ({
    fragrance_id: m.fragrance_id,
    house: m.house,
    name: m.name,
    gender: (m.gender || null) as FeedGender | null,
    concentration: m.concentration || null,
    popularity_rank: m.popularity_rank ? Number(m.popularity_rank) : null,
    reason: m.reason,
    page_title: m.page_title,
    fragrancenet_url: m.fragrancenet_url,
    offer_url: m.offer_url,
  }));
  const inCsv = new Set(items.map((i) => i.fragrance_id));
  for (const r of report.report) {
    if (r.verdict === "fetch_error" && !inCsv.has(r.fragrance_id)) {
      items.push({
        fragrance_id: r.fragrance_id, house: r.house, name: r.name, gender: null, concentration: null,
        popularity_rank: r.popularity_rank, reason: `page gone (${r.error ?? "fetch error"})`, page_title: "",
        fragrancenet_url: r.fragrancenet_url ?? "", offer_url: "",
      });
    }
  }
  console.log(`  offers:     ${items.length} to triage\n`);

  // fetch_error rows have no offer_url in the report; read it from the DB on --write.
  const byHouse = new Map<string, FeedRow[]>();
  for (const r of feed) {
    const k = houseTokens(r.house).join(" ") || key(r.house);
    if (!byHouse.has(k)) byHouse.set(k, []);
    byHouse.get(k)!.push(r);
  }
  const feedFor = (house: string) => {
    const out: FeedRow[] = [];
    for (const [, rows] of byHouse) if (sameHouse(rows[0].house, house)) out.push(...rows);
    return out;
  };

  const now = new Date().toISOString();
  const out: Record<string, unknown>[] = [];
  const counts: Record<Action | "written" | "write_error", number> = {
    repoint: 0, remove: 0, keep: 0, check_strength: 0, not_in_feed: 0, written: 0, write_error: 0,
  };
  const repointedIds: string[] = [];

  items.sort((a, b) => (a.popularity_rank ?? Infinity) - (b.popularity_rank ?? Infinity));
  for (const it of items) {
    const strength = (strengthOf(it.concentration ?? "") ?? strengthOf(it.name)) as Strength | null;
    const other = goodPages.get(it.fragrancenet_url);
    const plan = planFor(
      { name: it.name, house: it.house, gender: it.gender, strength, pageGone: it.reason.startsWith("page gone") },
      feedFor(it.house),
      Boolean(other && other !== it.fragrance_id),
      skuOf(it.offer_url) ?? skuOf(it.fragrancenet_url),
    );
    counts[plan.action]++;

    let writeError = "";
    if (WRITE && supabase && (plan.action === "repoint" || plan.action === "remove")) {
      const q = supabase.from("fragrance_offers");
      const { error } =
        plan.action === "repoint"
          ? await q
              .update({ product_url: plan.pick!.url, price: plan.pick!.price, in_stock: plan.pick!.inStock, updated_at: now })
              .eq("fragrance_id", it.fragrance_id)
              .ilike("retailer", "fragrancenet")
          : await q.delete().eq("fragrance_id", it.fragrance_id).ilike("retailer", "fragrancenet");
      if (error) {
        writeError = error.message;
        counts.write_error++;
      } else {
        counts.written++;
        if (plan.action === "repoint") repointedIds.push(it.fragrance_id);
      }
    }

    out.push({
      popularity_rank: it.popularity_rank ?? "",
      house: it.house,
      name: it.name,
      gender: it.gender ?? "",
      strength: strength ?? "",
      problem: it.reason,
      action: plan.action,
      why: plan.why,
      current_page: it.page_title || it.fragrancenet_url,
      new_product: plan.pick?.title ?? "",
      new_price: plan.pick?.price ?? "",
      new_in_stock: plan.pick ? plan.pick.inStock : "",
      new_url: plan.pick?.url ?? "",
      old_url: it.offer_url,
      fragrance_id: it.fragrance_id,
      write_error: writeError,
    });
  }

  const stamp = now.replace(/[:.]/g, "-");
  const planFile = path.resolve(`data/fragrancenet-offer-fixes-${WRITE ? "write" : "dry"}-${stamp}.csv`);
  const cols = Object.keys(out[0] ?? { action: "" });
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  await fs.writeFile(planFile, [cols.join(","), ...out.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n");

  console.log("--- plan ---");
  console.log(`  repoint         ${counts.repoint}  (feed has the right bottle)`);
  console.log(`  remove          ${counts.remove}  (FragranceNet doesn't sell this version)`);
  console.log(`  keep            ${counts.keep}  (offer is right; strength is in the name, labelled differently)`);
  console.log(`  check_strength  ${counts.check_strength}  (catalog strength may be wrong; not written)`);
  console.log(`  not_in_feed     ${counts.not_in_feed}  (review by hand; not written)`);
  if (WRITE) console.log(`  written ${counts.written}, errors ${counts.write_error}`);
  console.log(`\n  plan: ${path.relative(process.cwd(), planFile)}`);
  if (WRITE && repointedIds.length) {
    const idsFile = path.resolve(`data/fragrancenet-repointed-${stamp}.txt`);
    await fs.writeFile(idsFile, repointedIds.join("\n") + "\n");
    console.log(`\n  Recheck the repointed pages and their notes:`);
    console.log(`    pnpm scrape:fragrancenet --only=${path.relative(process.cwd(), idsFile)} --refresh`);
  }
  if (!WRITE) console.log(`\n  Apply with: pnpm fix:fragrancenet-offers --write`);
}

if (process.argv[1] && /fix-fragrancenet-offers\.(ts|js|mjs)$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

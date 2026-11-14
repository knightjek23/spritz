// Collect FragranceNet's product profile for every catalog fragrance that has
// a FragranceNet offer, and use it to verify the catalog's notes.
//
// WHAT A FRAGRANCENET PAGE ACTUALLY HAS (checked live 12 Nov 2026 on Creed
// Aventus and Dior Sauvage)
//   * FragranceNet's own data, in the page's __NEXT_DATA__ under
//     props.pageProps.pageData.tabs.brandInfo:
//       notes            flat list of ~5 "key notes", no top/heart/base split
//       recommendedUse   e.g. "casual", often ""
//       yearIntroduced   e.g. 2010
//       designHouse
//   * NO accords and NO fragrance family, anywhere on the page.
//   * A top/heart/base pyramid that is NOT FragranceNet's: it is injected by
//     the SkinMatch widget (fragrancenotes.skinmatchapp.com, keyed by EAN).
//
// HOW EACH IS USED (Josh, 12 Nov 2026: "do both A and B")
//   A  FragranceNet's key notes verify the catalog row. FragranceNet lists a
//      handful of headline notes, so the test is "every key note is in the
//      stored row", not "same set". On a pass the row is marked
//      notes_status = 'match' against the FragranceNet page, tiers NOT
//      verified, notes untouched. A row where FragranceNet lists a note the
//      row lacks is reported for review and never written.
//   B  The SkinMatch pyramid is captured into the local cache only, for
//      internal comparison. It is never written to the database, never shown
//      in the app and never credited. Do not build a write path for it
//      without clearing it with SkinMatch / FragranceNet first.
//
// INPUT
//   fragrance_offers rows with retailer FragranceNet (Josh's matched
//   FragranceNet catalogue), joined to their fragrance. The offer's Rakuten
//   link is unwrapped to the FragranceNet page (murl); the legacy path 301s
//   to the current product page.
//
// OFFER CHECK
//   Every run also lists offers whose FragranceNet page is not the catalog
//   fragrance (different fragrance, men's vs women's version, different
//   strength, gift set) in data/fragrancenet-offer-mismatches-<time>.csv, so
//   wrong Buy links can be fixed. fragrance_offers itself is never changed.
//
// SAFE BY DEFAULT
//   * Dry run unless --write. Writes only 'match' rows, only on rows still
//     'unverified' (a brand, retailer or Scento result is never overwritten),
//     only when the page is the same fragrance and strength, and only when
//     the row has a snapshot in fragrance_provenance.
//   * Fetches are cached per fragrance in data/fragrancenet/pages/, so a
//     stopped run resumes where it left off.
//
// Usage (run from scraper/):
//   pnpm scrape:fragrancenet --limit=20            # pilot: fetch 20, dry report
//   pnpm scrape:fragrancenet                       # fetch all, dry report
//   pnpm scrape:fragrancenet --no-fetch            # report from cache only
//   pnpm scrape:fragrancenet --no-fetch --write    # apply the matches
//   flags: --offset=N  --refresh (refetch cached)  --retry-errors
//          --only=<file of ids, one per line>  (e.g. offers repointed by fix:fragrancenet-offers)
//          --skip=<id>,<id>  (fragrance ids never written, e.g. reviewed ambiguous matches)
//   env:   HEADLESS=true|false (default false)  FN_DELAY_MIN / FN_DELAY_MAX (s, default 3 / 6)

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeNote, noteOverlap, type StoredNote } from "./notes-compare";
import { checkVariant, nameMatches } from "./notes-source";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];

const WRITE = flag("write");
const NO_FETCH = flag("no-fetch");
const REFRESH = flag("refresh");
const RETRY_ERRORS = flag("retry-errors");
const LIMIT = opt("limit") ? Number(opt("limit")) : Infinity;
const OFFSET = Number(opt("offset") ?? 0);
// Fragrance ids to leave out of --write (hand-reviewed ambiguous matches).
const ONLY_FILE = opt("only"); // file of fragrance ids, one per line
const WRITE_CONCURRENCY = 8;
const SKIP = new Set((opt("skip") ?? "").split(",").map((x) => x.trim()).filter(Boolean));
const HEADLESS = (process.env.HEADLESS ?? "false").toLowerCase() === "true";
const DELAY_MIN = Number(process.env.FN_DELAY_MIN ?? 3);
const DELAY_MAX = Number(process.env.FN_DELAY_MAX ?? 6);

const CACHE_DIR = path.resolve("data/fragrancenet/pages");
const MIN_KEY_NOTES = 3; // fewer than this is too thin to call a verification

// Created in main(), so the pure helpers can be imported without a .env.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabase: SupabaseClient<any, "public", any>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Fragrance {
  id: string;
  name: string;
  house: string;
  concentration: string | null;
  concentrations: string[] | null;
  gender: "masculine" | "feminine" | "unisex" | null;
  popularity_rank: number | null;
  notes_status: string;
  top_notes: StoredNote[] | null;
  mid_notes: StoredNote[] | null;
  base_notes: StoredNote[] | null;
}

interface Target {
  fragrance: Fragrance;
  offerUrl: string;
  pageUrl: string | null;
}

/** One cache file per fragrance. */
export interface CachedPage {
  fragrance_id: string;
  fetched_at: string;
  requested_url: string;
  final_url: string | null;
  http_status: number | null;
  page_title: string | null;
  error: string | null;
  /** FragranceNet's own data (option A). */
  fragrancenet: {
    key_notes: string[];
    recommended_use: string | null;
    year_introduced: number | null;
    design_house: string | null;
  } | null;
  /** Third-party SkinMatch widget data (option B). INTERNAL ONLY: never
   *  written to the database, shown in the app, or credited. */
  skinmatch_internal_only: { top: string[]; heart: string[]; base: string[] } | null;
}

type Verdict =
  | "match"            // every key note is in the stored row -> writable
  | "differs"          // FragranceNet lists notes the row lacks -> review
  | "too_few_notes"    // fewer than MIN_KEY_NOTES key notes
  | "no_profile"       // page had no brandInfo notes
  | "wrong_page"       // page is a different fragrance
  | "wrong_strength"   // page is a different concentration
  | "wrong_gender"     // page is the men's / women's version the row is not
  | "gift_set"         // page is a set or sampler, not the fragrance itself
  | "already_verified" // row is not 'unverified'; never touched
  | "fetch_error"
  | "not_fetched";

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Rakuten link -> FragranceNet page. Plain FragranceNet URLs pass through. */
export function unwrapOfferUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (/(^|\.)linksynergy\.com$/i.test(u.hostname)) {
    const murl = u.searchParams.get("murl");
    if (!murl) return null;
    try {
      u = new URL(murl);
    } catch {
      return null;
    }
  }
  if (!/(^|\.)fragrancenet\.com$/i.test(u.hostname)) return null;
  u.searchParams.delete("mv_pc");
  u.hash = "";
  return u.toString();
}

/** Pull FragranceNet's own profile out of the __NEXT_DATA__ JSON text. */
export function parseNextData(json: string | null): CachedPage["fragrancenet"] {
  if (!json) return null;
  let data: any;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  const bi = data?.props?.pageProps?.pageData?.tabs?.brandInfo;
  if (!bi) return null;
  const notes = Array.isArray(bi.notes)
    ? bi.notes.filter((n: unknown): n is string => typeof n === "string" && n.trim() !== "").map((n: string) => n.trim())
    : [];
  const year = Number(bi.yearIntroduced);
  return {
    key_notes: notes,
    recommended_use: typeof bi.recommendedUse === "string" && bi.recommendedUse.trim() ? bi.recommendedUse.trim() : null,
    year_introduced: Number.isFinite(year) && year > 1000 ? year : null,
    design_house: typeof bi.designHouse === "string" ? bi.designHouse : null,
  };
}

/** SkinMatch sections as read off the DOM: [{label, notes}] -> tiers. */
export function parseSkinmatch(sections: { label: string; notes: string[] }[] | null): CachedPage["skinmatch_internal_only"] {
  if (!sections || sections.length === 0) return null;
  const out = { top: [] as string[], heart: [] as string[], base: [] as string[] };
  for (const s of sections) {
    const l = s.label.toLowerCase();
    const notes = s.notes.map((n) => n.trim()).filter(Boolean);
    if (/top|head/.test(l)) out.top.push(...notes);
    else if (/heart|middle|mid/.test(l)) out.heart.push(...notes);
    else if (/base/.test(l)) out.base.push(...notes);
  }
  return out.top.length + out.heart.length + out.base.length > 0 ? out : null;
}

/** Gender the FragranceNet title states: "... for Women", "... for Men",
 *  "... for Men and Women" / "Unisex". null when the title says nothing. */
export function pageGender(title: string): "masculine" | "feminine" | "unisex" | null {
  const t = title.toLowerCase();
  if (/\bunisex\b|\bfor (men and women|women and men)\b/.test(t)) return "unisex";
  if (/\bfor women\b|\bwomen'?s\b/.test(t)) return "feminine";
  if (/\bfor men\b|\bmen'?s\b/.test(t)) return "masculine";
  return null;
}

/** Only a direct men's vs women's clash counts. A unisex row on a gendered
 *  page (or the reverse) is common labelling noise and passes. */
export function genderConflicts(row: Fragrance["gender"], title: string): boolean {
  const page = pageGender(title);
  return (row === "masculine" && page === "feminine") || (row === "feminine" && page === "masculine");
}

/** Last path segment of a FragranceNet product URL: the strength slug
 *  ("eau-de-parfum", "edt") or, for sets, a description of the contents
 *  ("edt-spray-3.4-oz-and-shower-gel-3.4-oz"). */
function urlSlug(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/+$/, "").split("/").pop()?.toLowerCase() ?? "";
  } catch {
    return "";
  }
}

/** Gift sets, samplers, duos and multi-piece kits rather than the bottle
 *  itself. Read from the title and from the URL slug, which spells out set
 *  contents ("...-and-shower-gel-3.4-oz", "...-refills-3-x-0.25-oz"). */
export function isGiftSet(title: string, url = ""): boolean {
  const t = title.replace(/\|.*$/, "");
  if (/\b(gift set|set|coffret|sampler|discovery|duo|trio|kit|\d+\s*-?\s*pc|\d+\s*piece)\b/i.test(t)) return true;
  const slug = urlSlug(url);
  return /-and-|refills?-|sachet|sample|vial|-x-\d/.test(slug);
}

/** FragranceNet's strength, as text checkVariant can parse. The URL slug is
 *  the reliable signal: titles say "Parfum" loosely for niche Eau de Parfums
 *  (Pegasus, Herod, Tobacco Vanille) while the slug says "eau-de-parfum".
 *  Falls back to the title when the slug names no strength ("cologne"). */
export function pageStrengthText(title: string, url: string): string {
  const slug = urlSlug(url);
  if (/^eau-de-parfum/.test(slug)) return "eau de parfum";
  if (/^edt\b|^eau-de-toilette/.test(slug)) return "eau de toilette";
  if (/^extrait/.test(slug)) return "extrait";
  if (/^parfum\b/.test(slug)) return "parfum";
  if (/^(edc|eau-de-cologne)\b/.test(slug)) return "eau de cologne";
  return title;
}

const squash = (s: string) => s.replace(/[\s-]+/g, "");

/** Key notes not present in the stored row (exact after normalizeNote, or
 *  equal once spaces and hyphens are dropped: "blackcurrant"). */
export function missingKeyNotes(keyNotes: string[], stored: StoredNote[]): string[] {
  const have = new Set<string>();
  for (const n of stored) {
    const k = normalizeNote(n.name);
    if (k) {
      have.add(k);
      have.add(squash(k));
    }
  }
  const missing: string[] = [];
  for (const raw of keyNotes) {
    const k = normalizeNote(raw);
    if (!k) continue;
    if (!have.has(k) && !have.has(squash(k))) missing.push(raw);
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

async function loadTargets(): Promise<Target[]> {
  const rows: { product_url: string; fragrance: Fragrance | null }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("fragrance_offers")
      .select(
        "product_url, fragrance:fragrances(id, name, house, concentration, concentrations, gender, popularity_rank, notes_status, top_notes, mid_notes, base_notes)",
      )
      .ilike("retailer", "fragrancenet")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`[scrape:fragrancenet] offers query failed: ${error.message}`);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as any));
    if (data.length < PAGE) break;
  }
  const targets: Target[] = rows
    .filter((r) => r.fragrance)
    .map((r) => ({ fragrance: r.fragrance!, offerUrl: r.product_url, pageUrl: unwrapOfferUrl(r.product_url) }));
  // Most popular first, so a partial run covers the rows that matter.
  targets.sort(
    (a, b) => (a.fragrance.popularity_rank ?? Infinity) - (b.fragrance.popularity_rank ?? Infinity),
  );
  return targets;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const cachePath = (id: string) => path.join(CACHE_DIR, `${id}.json`);

async function readCache(id: string): Promise<CachedPage | null> {
  try {
    return JSON.parse(await fs.readFile(cachePath(id), "utf8")) as CachedPage;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------
// NOTE: page.evaluate callbacks below are inline arrows on purpose. Named
// inner functions break under tsx (esbuild keepNames emits __name, which does
// not exist in the page). See reference_tsx_playwright_evaluate.

async function fetchOne(page: Page, t: Target): Promise<CachedPage> {
  const base: CachedPage = {
    fragrance_id: t.fragrance.id,
    fetched_at: new Date().toISOString(),
    requested_url: t.pageUrl ?? t.offerUrl,
    final_url: null,
    http_status: null,
    page_title: null,
    error: null,
    fragrancenet: null,
    skinmatch_internal_only: null,
  };
  if (!t.pageUrl) return { ...base, error: "offer URL is not a FragranceNet page" };

  try {
    const resp = await page.goto(t.pageUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    base.http_status = resp?.status() ?? null;
    base.final_url = page.url();
    base.page_title = await page.title();
    if (base.http_status && base.http_status >= 400) return { ...base, error: `HTTP ${base.http_status}` };

    const nextJson = await page.evaluate(() => document.getElementById("__NEXT_DATA__")?.textContent ?? null);
    base.fragrancenet = parseNextData(nextJson);

    // The SkinMatch widget loads after the page; nudge it with a scroll.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 3));
    const loaded = await page
      .waitForSelector(".smt-fragrancenotes-holder", { timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (loaded) {
      const sections = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".smt-fragrancenotes-holder .smt-fragrance-notes")).map((sec) => ({
          label: sec.querySelector("label")?.textContent ?? "",
          notes: Array.from(sec.querySelectorAll(".smt-fragrance-note")).map((n) => (n.textContent ?? "").trim()),
        })),
      );
      base.skinmatch_internal_only = parseSkinmatch(sections);
    }
    if (!base.fragrancenet) base.error = "no __NEXT_DATA__ brandInfo on page";
    return base;
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message.split("\n")[0] : String(e) };
  }
}

async function fetchAll(targets: Target[]): Promise<{ fetched: number; errors: number }> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const todo: Target[] = [];
  for (const t of targets) {
    const c = await readCache(t.fragrance.id);
    if (!c || REFRESH || (RETRY_ERRORS && c.error)) todo.push(t);
  }
  console.log(`  fetch:   ${todo.length} to fetch, ${targets.length - todo.length} already cached`);
  if (todo.length === 0) return { fetched: 0, errors: 0 };

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });
  // A string, not a function: tsx would wrap the getter in __name(), which
  // does not exist in the page, and the init script would throw silently.
  await ctx.addInitScript('Object.defineProperty(navigator, "webdriver", { get: function () { return false; } });');
  // Images, fonts and media are not needed; the SkinMatch script still loads.
  await ctx.route("**/*", (route) => {
    const type = route.request().resourceType();
    return type === "image" || type === "font" || type === "media" ? route.abort() : route.continue();
  });
  const page = await ctx.newPage();

  let fetched = 0;
  let errors = 0;
  let consecutiveErrors = 0;
  try {
    for (const [i, t] of todo.entries()) {
      const rec = await fetchOne(page, t);
      await fs.writeFile(cachePath(t.fragrance.id), JSON.stringify(rec, null, 2));
      fetched++;
      if (rec.error) {
        errors++;
        consecutiveErrors++;
      } else consecutiveErrors = 0;
      const notes = rec.fragrancenet?.key_notes.length ?? 0;
      const sm = rec.skinmatch_internal_only ? "pyramid" : "no pyramid";
      console.log(
        `  [${i + 1}/${todo.length}] ${t.fragrance.house} - ${t.fragrance.name}: ` +
          (rec.error ? `ERROR ${rec.error}` : `${notes} key notes, ${sm}`),
      );
      if (consecutiveErrors >= 5) {
        console.error("\n  ⚠ 5 errors in a row; stopping so a block is not hammered. Resume with --retry-errors.");
        break;
      }
      const wait = (DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN)) * 1000;
      await new Promise((r) => setTimeout(r, wait));
    }
  } finally {
    await browser.close();
  }
  return { fetched, errors };
}

// ---------------------------------------------------------------------------
// Judge + write
// ---------------------------------------------------------------------------

function judge(t: Target, c: CachedPage | null): { verdict: Verdict; missing: string[] } {
  if (!c) return { verdict: "not_fetched", missing: [] };
  if (c.error && !c.fragrancenet) return { verdict: "fetch_error", missing: [] };
  const f = t.fragrance;
  const title = c.page_title ?? "";
  const url = c.final_url ?? c.requested_url;
  if (!nameMatches(f.name, title, url)) return { verdict: "wrong_page", missing: [] };
  if (isGiftSet(title, url)) return { verdict: "gift_set", missing: [] };
  if (genderConflicts(f.gender, title)) return { verdict: "wrong_gender", missing: [] };
  if (checkVariant(f, pageStrengthText(title, url), "") === "mismatch") return { verdict: "wrong_strength", missing: [] };
  const key = c.fragrancenet?.key_notes ?? [];
  if (key.length === 0) return { verdict: "no_profile", missing: [] };
  if (f.notes_status !== "unverified") return { verdict: "already_verified", missing: [] };
  if (key.length < MIN_KEY_NOTES) return { verdict: "too_few_notes", missing: [] };
  const stored = [...(f.top_notes ?? []), ...(f.mid_notes ?? []), ...(f.base_notes ?? [])];
  const missing = missingKeyNotes(key, stored);
  return { verdict: missing.length === 0 ? "match" : "differs", missing };
}

async function writeMatch(f: Fragrance, sourceUrl: string): Promise<string | null> {
  const { data: prov, error: provErr } = await supabase
    .from("fragrance_provenance")
    .select("fragrance_id, legacy_saved_at")
    .eq("fragrance_id", f.id)
    .maybeSingle();
  if (provErr) return `provenance lookup failed: ${provErr.message}`;
  if (!prov || !prov.legacy_saved_at) return "no snapshot in fragrance_provenance; row skipped";
  const { error } = await supabase
    .from("fragrances")
    .update({
      notes_status: "match",
      notes_source_url: sourceUrl,
      notes_verified_at: new Date().toISOString(),
      notes_tiers_verified: false,
    })
    .eq("id", f.id)
    .eq("notes_status", "unverified"); // never overwrite a newer verification
  return error ? error.message : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[k]) {
      console.error(`[scrape:fragrancenet] missing ${k} in scraper/.env`);
      process.exit(1);
    }
  }
  supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  console.log("--- Spritz: FragranceNet profiles ---");
  console.log(`  mode:    ${WRITE ? "WRITE (matches only)" : "dry run (no DB writes)"}${NO_FETCH ? ", cache only" : ""}`);

  const all = await loadTargets();
  let pool = all;
  if (ONLY_FILE) {
    const ids = new Set((await fs.readFile(ONLY_FILE, "utf8")).split(/\r?\n/).map((x) => x.trim()).filter(Boolean));
    pool = all.filter((t) => ids.has(t.fragrance.id));
    console.log(`  only:    ${pool.length} of ${ids.size} id(s) from ${ONLY_FILE} still have a FragranceNet offer`);
  }
  const selected = pool.slice(OFFSET, Number.isFinite(LIMIT) ? OFFSET + LIMIT : undefined);
  const unwrapFailures = all.filter((t) => !t.pageUrl).length;
  console.log(`  offers:  ${all.length} fragrances with a FragranceNet offer (${unwrapFailures} with no usable page URL)`);
  console.log(`  run:     ${selected.length} selected (offset ${OFFSET}${Number.isFinite(LIMIT) ? `, limit ${LIMIT}` : ""}), most popular first\n`);

  if (!NO_FETCH) {
    const { fetched, errors } = await fetchAll(selected);
    console.log(`\n  fetched ${fetched} page(s), ${errors} error(s)\n`);
  }

  const counts: Record<Verdict | "written" | "write_error", number> = {
    match: 0, differs: 0, too_few_notes: 0, no_profile: 0, wrong_page: 0, wrong_strength: 0,
    wrong_gender: 0, gift_set: 0,
    already_verified: 0, fetch_error: 0, not_fetched: 0, written: 0, write_error: 0,
  };
  let withPyramid = 0;
  let withYear = 0;
  let withUse = 0;
  const report: unknown[] = [];
  const writeJobs: { f: Fragrance; sourceUrl: string; entry: Record<string, unknown> }[] = [];
  // Offers whose FragranceNet page is a different product than the catalog
  // row: the Buy button on that fragrance page sends shoppers to the wrong
  // item. Reported only; fragrance_offers is never changed by this script.
  const OFFER_MISMATCH: Partial<Record<Verdict, string>> = {
    wrong_page: "different fragrance",
    wrong_gender: "men's / women's version",
    wrong_strength: "different strength",
    gift_set: "gift set or sampler",
  };
  const offerMismatches: {
    fragrance_id: string; house: string; name: string; gender: string | null; concentration: string | null;
    popularity_rank: number | null; reason: string; page_title: string; fragrancenet_url: string; offer_url: string;
  }[] = [];

  console.log(`  checking ${selected.length} cached page(s)...`);
  for (const t of selected) {
    const c = await readCache(t.fragrance.id);
    const { verdict, missing } = judge(t, c);
    counts[verdict]++;
    if (c?.skinmatch_internal_only) withPyramid++;
    if (c?.fragrancenet?.year_introduced) withYear++;
    if (c?.fragrancenet?.recommended_use) withUse++;

    const f = t.fragrance;
    const stored = { top: f.top_notes ?? [], mid: f.mid_notes ?? [], base: f.base_notes ?? [] };
    const sm = c?.skinmatch_internal_only;
    const sourceUrl = c?.final_url?.split("#")[0] ?? t.pageUrl ?? "";

    const why = OFFER_MISMATCH[verdict];
    if (why) {
      offerMismatches.push({
        fragrance_id: f.id, house: f.house, name: f.name, gender: f.gender, concentration: f.concentration,
        popularity_rank: f.popularity_rank, reason: why, page_title: c?.page_title ?? "",
        fragrancenet_url: sourceUrl, offer_url: t.offerUrl,
      });
    }

    const entry: Record<string, unknown> = {
      fragrance_id: f.id,
      house: f.house,
      name: f.name,
      popularity_rank: f.popularity_rank,
      notes_status_before: f.notes_status,
      verdict,
      fragrancenet_url: sourceUrl || null,
      page_title: c?.page_title ?? null,
      key_notes: c?.fragrancenet?.key_notes ?? [],
      missing_from_row: missing,
      recommended_use: c?.fragrancenet?.recommended_use ?? null,
      year_introduced: c?.fragrancenet?.year_introduced ?? null,
      // INTERNAL ONLY (option B): comparison against SkinMatch, never written.
      skinmatch_overlap_with_row: sm
        ? Number(noteOverlap(stored, { top: sm.top, mid: sm.heart, base: sm.base, flat: [] }).toFixed(2))
        : null,
      error: c?.error ?? null,
    };
    report.push(entry);
    if (WRITE && verdict === "match" && !SKIP.has(f.id)) writeJobs.push({ f, sourceUrl, entry });
  }

  // Writes run after judging, a few at a time, with progress. Each match is
  // two round trips (snapshot check + update); one at a time with no output
  // took long enough to look hung (13 Nov 2026).
  if (WRITE && writeJobs.length > 0) {
    console.log(`  writing ${writeJobs.length} match(es), ${WRITE_CONCURRENCY} at a time...`);
    const started = Date.now();
    let done = 0;
    for (let i = 0; i < writeJobs.length; i += WRITE_CONCURRENCY) {
      const batch = writeJobs.slice(i, i + WRITE_CONCURRENCY);
      const results = await Promise.all(batch.map((j) => writeMatch(j.f, j.sourceUrl)));
      results.forEach((err, k) => {
        if (err) {
          counts.write_error++;
          batch[k].entry.error = err;
        } else counts.written++;
      });
      done += batch.length;
      if (done % 100 < WRITE_CONCURRENCY || done === writeJobs.length) {
        const secs = Math.round((Date.now() - started) / 1000);
        console.log(`    ${done}/${writeJobs.length} (${counts.write_error} error(s), ${secs}s)`);
      }
    }
    console.log("");
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.resolve(`data/fragrancenet-${WRITE ? "write" : "dry"}-${stamp}.json`);
  await fs.writeFile(outFile, JSON.stringify({ counts, offer_mismatches: offerMismatches, report }, null, 2));
  const csvFile = path.resolve(`data/fragrancenet-offer-mismatches-${stamp}.csv`);
  const cols = [
    "popularity_rank", "house", "name", "gender", "concentration", "reason", "page_title", "fragrancenet_url",
    "offer_url", "fragrance_id",
  ] as const;
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  await fs.writeFile(
    csvFile,
    [cols.join(","), ...offerMismatches.map((m) => cols.map((k) => cell(m[k])).join(","))].join("\n") + "\n",
  );

  const have = selected.length - counts.not_fetched;
  console.log("--- results ---");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(17)} ${v}`);
  console.log(`  year introduced   ${withYear}`);
  console.log(`  recommended use   ${withUse}`);
  console.log(`  SkinMatch pyramid ${withPyramid}  (internal comparison only; not written)`);
  console.log(`  offer mismatches  ${offerMismatches.length}  (wrong Buy links; not changed by this script)`);
  console.log(`\n  report: ${path.relative(process.cwd(), outFile)}`);
  console.log(`  offers: ${path.relative(process.cwd(), csvFile)}`);
  if (have < selected.length) {
    console.log(
      `\n  ⚠ COVERAGE: ${have}/${selected.length} fetched; ${selected.length - have} MISSING. ` +
        `Re-run without --no-fetch to resume.`,
    );
  }
  if (counts.fetch_error > 0) {
    console.log(`  ⚠ ${counts.fetch_error} fetch error(s). Retry with --retry-errors.`);
  }
  if (!WRITE && counts.match > 0) {
    console.log(`\n  ${counts.match} row(s) would be marked verified against FragranceNet. Apply with --no-fetch --write.`);
  }
}

// Only run when executed directly, so the pure helpers can be imported in tests.
if (process.argv[1] && /scrape-fragrancenet\.(ts|js|mjs)$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

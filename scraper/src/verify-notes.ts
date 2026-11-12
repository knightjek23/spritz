// Verify stored notes against a real, fetched source page, most popular
// fragrances first.
//
// Spec: "Spritz data provenance spec", section 4 (v2, after the first pilot).
// Requires migration 0043.
//
// What changed from v1, and why: in the first pilot the model both found the
// page and reported its notes, so a note read off the page could not be told
// from one recalled from memory. Now:
//
//   1. FIND     A search-capable model proposes product-page URLs. That is
//               all it does. Its opinion of what the page says is not used.
//   2. FETCH    This script fetches each URL itself, with a plain request
//               and an honest user agent, after checking robots.txt. A page
//               that refuses is recorded as blocked. Nothing is bypassed.
//   3. EXTRACT  A model lists the notes written in the fetched text.
//   4. GROUND   Every note must appear, word for word, in the fetched text
//               or it is dropped. Tiers count only if the page states them.
//   5. CHECK    The page must be about this fragrance, at this strength,
//               on an accepted retailer or the brand's own site.
//   6. COMPARE  notes-compare.ts decides match / replaced / needs_review.
//
// Source preference (decision B): a retailer page with stated top / heart /
// base tiers first, then a tiered brand page, then a flat brand list, then a
// flat retailer list.
//
// SAFE BY DEFAULT
//   * Dry run unless --write is passed. A dry run reads only.
//   * Only the rows it processes can change. Every other row is untouched.
//   * --write refuses any row with no snapshot in fragrance_provenance.
//
// Usage (run from scraper/):
//   pnpm verify:notes                       # dry run, 20 most popular unverified
//   pnpm verify:notes --limit=50 --offset=20
//   pnpm verify:notes --limit=20 --write    # only after the dry report is checked
//
// Env (scraper/.env):
//   OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   VERIFY_MODEL          search step, default gpt-4o-mini (needs web_search)
//   VERIFY_EXTRACT_MODEL  extraction step, default gpt-4o-mini
//   VERIFY_SEARCH_TOOL    default web_search
//   VERIFY_USER_AGENT     sent with every page fetch
//
// After a --write run that replaced rows, their note vectors and similarity
// pairs are stale until recomputed. That is a separate, deliberate step.

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import {
  buildReplacement,
  compareNotes,
  hostOf,
  isBlockedSource,
  isDescriptor,
  type CompareResult,
  type SourceNotes,
  type StoredNote,
} from "./notes-compare";
import {
  checkVariant,
  classifySource,
  excerptAroundNotes,
  groundNotes,
  htmlToText,
  looksBlocked,
  nameMatches,
  pageStatesTiers,
  robotsAllows,
  type SourceType,
  type VariantCheck,
} from "./notes-source";

const args = process.argv.slice(2);
const num = (flag: string, fallback: number) =>
  Number(args.find((a) => a.startsWith(`--${flag}=`))?.split("=")[1] ?? fallback);
const LIMIT = num("limit", 20);
const OFFSET = num("offset", 0);
const WRITE = args.includes("--write");

const SEARCH_MODEL = process.env.VERIFY_MODEL ?? "gpt-4o-mini";
const EXTRACT_MODEL = process.env.VERIFY_EXTRACT_MODEL ?? "gpt-4o-mini";
const SEARCH_TOOL = process.env.VERIFY_SEARCH_TOOL ?? "web_search";
const USER_AGENT =
  process.env.VERIFY_USER_AGENT ?? "SpritzNotesVerifier/1.0 (catalog notes verification; low volume)";
const MAX_CANDIDATES = 5;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

interface Row {
  id: string;
  name: string;
  house: string;
  year: number | null;
  concentration: string | null;
  concentrations: string[] | null;
  popularity_rank: number | null;
  top_notes: StoredNote[] | null;
  mid_notes: StoredNote[] | null;
  base_notes: StoredNote[] | null;
}

interface Candidate {
  url: string;
  sourceType: SourceType | null;
  /** "ok" or the reason this page was not used. */
  status: string;
  variant: VariantCheck | null;
  tiered: boolean;
  notes: SourceNotes;
  /** Notes the model reported that are not written on the page. */
  ungrounded: string[];
  /** Marketing phrases the model reported as notes. */
  descriptors: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.replace(/\s+/g, " ").trim());
}

// ---------- 1. FIND ----------

const FIND_INSTRUCTIONS = `You find product pages. Use web search.

Return the product-page URLs for the exact fragrance and strength named by the user:
- first, department stores and beauty retailers that sell it and list its notes as top / heart / base (for example Sephora, Nordstrom, Ulta, Macy's, Bloomingdale's, Saks, Neiman Marcus, Selfridges, Harrods, John Lewis, Boots, Space NK, FragranceNet)
- then the brand's own official website

Do not return fragrance databases, review sites, forums, wikis, blogs, marketplaces, or discounters other than FragranceNet. Do not return search or category pages. Do not describe the pages.

Return STRICT JSON only: {"urls": ["https://...", "..."]} with at most ${MAX_CANDIDATES} URLs, best first. If you find none, return {"urls": []}.`;

async function findCandidates(f: Row): Promise<{ urls: string[]; searched: boolean }> {
  const strength = f.concentration ? ` (${f.concentration.toUpperCase()})` : "";
  const res = (await openai.responses.create({
    model: SEARCH_MODEL,
    instructions: FIND_INSTRUCTIONS,
    tools: [{ type: SEARCH_TOOL }],
    input: `Fragrance: ${f.name}${strength}\nBrand: ${f.house}\nYear: ${f.year ?? "unknown"}`,
  } as never)) as unknown as { output_text?: string; output?: Array<{ type?: string }> };

  const searched = (res.output ?? []).some((o) => o.type === "web_search_call");
  const j = parseJson(res.output_text ?? "");
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const u of strList(j?.urls)) {
    if (!/^https?:\/\//i.test(u) || seen.has(u)) continue;
    seen.add(u);
    urls.push(u);
  }
  return { urls: urls.slice(0, MAX_CANDIDATES), searched };
}

// ---------- 2. FETCH ----------

const robotsCache = new Map<string, string | null>();

async function httpGet(url: string): Promise<{ status: number; body: string } | { error: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    return { status: res.status, body: await res.text() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function allowedByRobots(url: string): Promise<boolean> {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    const r = await httpGet(`${u.origin}/robots.txt`);
    robotsCache.set(u.origin, "error" in r || r.status !== 200 ? null : r.body);
  }
  const robots = robotsCache.get(u.origin);
  return robots ? robotsAllows(robots, u.pathname + u.search) : true;
}

// ---------- 3. EXTRACT ----------

const EXTRACT_INSTRUCTIONS = `You copy fragrance notes out of product-page text.

List ONLY notes that are written in the text, using the text's own words. Do not add, infer or translate anything. A note is an ingredient or accord name such as "bergamot" or "pink pepper". Phrases that describe a mood or an impression are not notes.

If the text assigns notes to top / heart (middle) / base, set "tiered" to true and fill those three lists. If it gives notes without tiers, set "tiered" to false, put them all in "flat" and leave the tier lists empty. If the text lists no notes, return every list empty.

Return STRICT JSON only: {"tiered": true|false, "top": [], "heart": [], "base": [], "flat": []}`;

async function extractNotes(excerpt: string): Promise<{ tiered: boolean; notes: SourceNotes } | null> {
  const res = await openai.chat.completions.create({
    model: EXTRACT_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: EXTRACT_INSTRUCTIONS },
      { role: "user", content: excerpt },
    ],
    max_tokens: 500,
  });
  const j = parseJson(res.choices[0]?.message?.content ?? "");
  if (!j) return null;
  return {
    tiered: j.tiered === true,
    notes: { top: strList(j.top), mid: strList(j.heart), base: strList(j.base), flat: strList(j.flat) },
  };
}

// ---------- 2-5 for one URL ----------

async function evaluate(f: Row, url: string): Promise<Candidate> {
  const empty: SourceNotes = { top: [], mid: [], base: [], flat: [] };
  const c: Candidate = {
    url, sourceType: null, status: "ok", variant: null, tiered: false,
    notes: empty, ungrounded: [], descriptors: [],
  };
  const stop = (status: string): Candidate => ({ ...c, status });

  if (isBlockedSource(url)) return stop(`not an acceptable source: ${hostOf(url) ?? url}`);
  c.sourceType = classifySource(url, f.house);
  if (!c.sourceType) return stop(`not a listed retailer or the brand's site: ${hostOf(url) ?? url}`);

  if (!(await allowedByRobots(url))) return stop("robots.txt disallows this page");
  const got = await httpGet(url);
  if ("error" in got) return stop(`fetch failed: ${got.error}`);
  if (looksBlocked(got.status, got.body)) return stop(`page not readable (HTTP ${got.status})`);

  const page = htmlToText(got.body);
  if (!nameMatches(f.name, page.title, url)) return stop(`page is not about this fragrance: "${page.title}"`);
  c.variant = checkVariant(f, page.title, url);
  if (c.variant === "mismatch") return stop(`different strength: "${page.title}"`);

  const excerpt = excerptAroundNotes(page.text);
  if (!excerpt) return stop("page text does not mention notes");
  const ex = await extractNotes(excerpt);
  if (!ex) return stop("extraction returned no usable JSON");

  // Descriptors out, then every remaining note must be on the page.
  const clean = (names: string[]) => {
    const real = names.filter((n) => {
      if (isDescriptor(n)) { c.descriptors.push(n); return false; }
      return true;
    });
    const g = groundNotes(real, page.text);
    c.ungrounded.push(...g.dropped);
    return g.kept;
  };
  const top = clean(ex.notes.top);
  const mid = clean(ex.notes.mid);
  const base = clean(ex.notes.base);
  const flat = clean(ex.notes.flat);
  const total = top.length + mid.length + base.length + flat.length;
  if (total === 0) return stop("no notes written on the page");
  if (c.ungrounded.length * 4 > total + c.ungrounded.length) {
    return stop(`extraction not grounded: ${c.ungrounded.length} of ${total + c.ungrounded.length} notes are not on the page`);
  }

  // Tiers only when the page states them and the model found all three.
  const tiered = ex.tiered && pageStatesTiers(page.text) && top.length + mid.length + base.length > 0;
  c.tiered = tiered;
  c.notes = tiered
    ? { top, mid, base, flat: [] }
    : { top: [], mid: [], base: [], flat: [...top, ...mid, ...base, ...flat] };
  return c;
}

/** Decision B ranking. */
function rank(c: Candidate): number {
  const count = c.notes.top.length + c.notes.mid.length + c.notes.base.length + c.notes.flat.length;
  const cls =
    c.tiered && c.sourceType === "retailer" ? 4
    : c.tiered && c.sourceType === "brand" ? 3
    : c.sourceType === "brand" ? 2
    : 1;
  return cls * 1000 + count;
}

// ---------- 6. COMPARE + write ----------

interface Decision {
  result: CompareResult;
  best: Candidate | null;
  candidates: Candidate[];
  searched: boolean;
}

function decide(f: Row, candidates: Candidate[], searched: boolean): Decision {
  const out = (outcome: "not_found" | "needs_review", reason: string, best: Candidate | null): Decision => ({
    result: { outcome, tiersVerified: false, reason, added: [], removed: [] },
    best, candidates, searched,
  });
  if (!searched) return out("needs_review", "search step did not run a web search", null);
  if (candidates.length === 0) return out("not_found", "search returned no product pages", null);

  const usable = candidates.filter((c) => c.status === "ok").sort((a, b) => rank(b) - rank(a));
  if (usable.length === 0) {
    return out("not_found", `none of ${candidates.length} page(s) usable: ${candidates.map((c) => c.status).join("; ")}`, null);
  }
  const best = usable[0];
  if (best.variant === "unconfirmed") {
    return out("needs_review", "page states a strength but the catalog row has none on record", best);
  }
  const stored = { top: f.top_notes ?? [], mid: f.mid_notes ?? [], base: f.base_notes ?? [] };
  return { result: compareNotes(stored, best.notes), best, candidates, searched };
}

async function apply(f: Row, d: Decision): Promise<string | null> {
  const { result, best } = d;
  const now = new Date().toISOString();

  // Never write to a row that has no snapshot to roll back to.
  const { data: prov, error: provErr } = await supabase
    .from("fragrance_provenance")
    .select("fragrance_id, legacy_saved_at")
    .eq("fragrance_id", f.id)
    .maybeSingle();
  if (provErr) return `provenance lookup failed: ${provErr.message}`;
  if (!prov || !prov.legacy_saved_at) return "no snapshot in fragrance_provenance; row skipped";

  if (result.outcome === "not_found" || result.outcome === "needs_review" || !best) {
    const { error } = await supabase.from("fragrances").update({ notes_status: result.outcome }).eq("id", f.id);
    return error ? error.message : null;
  }

  if (result.outcome === "match") {
    const { error } = await supabase
      .from("fragrances")
      .update({
        notes_status: "match",
        notes_source_url: best.url,
        notes_verified_at: now,
        notes_tiers_verified: result.tiersVerified,
      })
      .eq("id", f.id);
    return error ? error.message : null;
  }

  // replaced: the source's notes become the row, and the origin record
  // changes with them. compareNotes only returns this for a tiered source.
  const rep = buildReplacement(best.notes);
  const { error } = await supabase
    .from("fragrances")
    .update({
      top_notes: rep.top,
      mid_notes: rep.mid,
      base_notes: rep.base,
      notes_status: "replaced",
      notes_source_url: best.url,
      notes_verified_at: now,
      notes_tiers_verified: true,
    })
    .eq("id", f.id);
  if (error) return error.message;
  const { error: pErr } = await supabase
    .from("fragrance_provenance")
    .update({ notes_origin: best.sourceType, updated_at: now })
    .eq("fragrance_id", f.id);
  return pErr ? `notes written but origin not updated: ${pErr.message}` : null;
}

async function main() {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"]) {
    if (!process.env[k]) {
      console.error(`[verify:notes] missing ${k} in scraper/.env`);
      process.exit(1);
    }
  }

  console.log("--- Spritz notes verification (v2: fetched and grounded) ---");
  console.log(`  mode:    ${WRITE ? "WRITE" : "dry run (no DB writes)"}`);
  console.log(`  search:  ${SEARCH_MODEL} + ${SEARCH_TOOL}   extract: ${EXTRACT_MODEL}`);
  console.log(`  rows:    ${LIMIT} from offset ${OFFSET}, most popular first\n`);

  const { data: rows, error } = await supabase
    .from("fragrances")
    .select("id, name, house, year, concentration, concentrations, popularity_rank, top_notes, mid_notes, base_notes")
    .eq("notes_status", "unverified")
    .order("popularity_rank", { ascending: true, nullsFirst: false })
    .range(OFFSET, OFFSET + LIMIT - 1)
    .returns<Row[]>();
  if (error) {
    console.error(`[verify:notes] query failed: ${error.message}`);
    console.error("  If the error names notes_status, migration 0043 has not been pushed yet.");
    process.exit(1);
  }
  if (!rows || rows.length === 0) {
    console.log("No unverified rows in that range. Done.");
    return;
  }

  const counts: Record<string, number> = { match: 0, replaced: 0, not_found: 0, needs_review: 0, error: 0 };
  const pages = { proposed: 0, usable: 0, unreadable: 0 };
  const report: unknown[] = [];

  for (const f of rows) {
    const label = `#${f.popularity_rank ?? "?"} ${f.house} - ${f.name}`;
    let d: Decision;
    try {
      const found = await findCandidates(f);
      const candidates: Candidate[] = [];
      for (const url of found.urls) {
        candidates.push(await evaluate(f, url));
        await sleep(1000);
      }
      d = decide(f, candidates, found.searched);
    } catch (err) {
      counts.error++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  !  ${label}: failed: ${msg}`);
      report.push({ id: f.id, label, error: msg });
      continue;
    }

    const { result, best, candidates } = d;
    counts[result.outcome]++;
    pages.proposed += candidates.length;
    pages.usable += candidates.filter((c) => c.status === "ok").length;
    pages.unreadable += candidates.filter((c) => /not readable|fetch failed|robots/.test(c.status)).length;

    console.log(`  ${result.outcome.padEnd(12)} ${label}`);
    console.log(`               ${result.reason}`);
    if (best) console.log(`               ${best.sourceType}, ${best.tiered ? "tiered" : "flat list"}: ${best.url}`);
    if (result.added.length) console.log(`               + ${result.added.join(", ")}`);
    if (result.removed.length) console.log(`               - ${result.removed.join(", ")}`);

    let writeError: string | null = null;
    if (WRITE) {
      writeError = await apply(f, d);
      if (writeError) {
        counts.error++;
        console.log(`               ! write failed: ${writeError}`);
      }
    }

    report.push({
      id: f.id,
      label,
      outcome: result.outcome,
      reason: result.reason,
      tiers_verified: result.tiersVerified,
      source_type: best?.sourceType ?? null,
      source_url: best?.url ?? null,
      added: result.added,
      removed: result.removed,
      stored: {
        concentration: f.concentration,
        concentrations: f.concentrations,
        top: (f.top_notes ?? []).map((n) => n.name),
        heart: (f.mid_notes ?? []).map((n) => n.name),
        base: (f.base_notes ?? []).map((n) => n.name),
      },
      source: best ? best.notes : null,
      candidates: candidates.map((c) => ({
        url: c.url,
        source_type: c.sourceType,
        status: c.status,
        variant: c.variant,
        tiered: c.tiered,
        notes: c.notes,
        ungrounded: c.ungrounded,
        descriptors: c.descriptors,
      })),
      written: WRITE && !writeError,
      write_error: writeError,
    });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.resolve("data", `verify-notes-${WRITE ? "write" : "dry"}-${stamp}.json`);
  await fs.writeFile(outFile, JSON.stringify(report, null, 2), "utf8");

  console.log("\n--- Coverage ---");
  console.log(`  processed     ${rows.length} of ${LIMIT} requested`);
  for (const k of ["match", "replaced", "not_found", "needs_review", "error"]) {
    console.log(`  ${k.padEnd(13)} ${counts[k]}`);
  }
  console.log(`  pages         ${pages.proposed} proposed, ${pages.usable} usable, ${pages.unreadable} refused or unreadable`);
  console.log(`\nReport: ${outFile}`);
  if (!WRITE) console.log("Dry run: nothing was written. Check the report, then re-run with --write.");
  if (WRITE && counts.replaced > 0) {
    console.log("Replaced rows have stale note vectors and similarity pairs until those are recomputed.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

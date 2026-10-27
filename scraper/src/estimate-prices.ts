// Estimate a list price (MSRP) for every fragrance, with a language model.
//
// ---------------------------------------------------------------------------
// READ THIS BEFORE TRUSTING THE OUTPUT
// ---------------------------------------------------------------------------
// This does not scrape anything. A model cannot visit a store; it answers
// from what it remembers, which is months to years old and includes numbers
// it has never actually seen. Josh chose this route knowingly, over a
// shopping API, on cost. Three things limit the damage:
//
//   1. We ask for LIST PRICE (MSRP) for a named standard size, not a street
//      price. MSRP changes rarely, so a stale memory is still roughly right.
//   2. The model rates its own confidence and we only write at >= 0.6. For
//      a fragrance it does not know, "unknown" is the correct answer and we
//      store nothing. A blank is better than an invented number.
//   3. Every row is tagged source = 'gpt_estimate'. The API prefers a real
//      retailer offer when one exists, the UI shows "est." on these, and
//      one DELETE removes them all if they turn out to be bad.
//
// A self-test runs first against fragrances whose MSRP is well known. If the
// model is off by more than 35% on those, the run aborts: no point paying
// to fill the table with numbers that are wrong on the easy cases.
//
// Usage:
//   cd scraper && pnpm prices:estimate --dry --limit=40   # see what it would do
//   cd scraper && pnpm prices:estimate --limit=100        # pilot
//   cd scraper && pnpm prices:estimate                    # everything missing
//   cd scraper && pnpm prices:estimate --new-only         # after a catalog upload
//   cd scraper && pnpm prices:estimate --fill             # then cover the rest with
//                                                         # rougher house-level tiers
//
// --new-only and the default are the same thing: both skip fragrances that
// already have a gpt_estimate row. The alias exists so the upload runbook
// reads naturally. --refresh re-estimates everything.
//
// Cost: ~25 fragrances per call on gpt-4o-mini, roughly $0.002 per
// fragrance, so the whole catalog is in the $20-30 range.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const REFRESH = args.includes("--refresh");
/** After pass 1, cover everything still empty with rougher tiers. */
const FILL = args.includes("--fill");
const LIMIT = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0");
const MIN_CONFIDENCE = 0.6;
const BATCH = 25;
const MODEL = "gpt-4o-mini";
const SOURCE = "gpt_estimate";

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
}

interface Estimate {
  id: string;
  price: number | null;
  currency: string;
  size_ml: number | null;
  confidence: number;
}

const SYSTEM = `You estimate the manufacturer's list price (MSRP) of perfumes in the United States.

For each fragrance you are given, answer with the MSRP of its most common full-size bottle (usually 100 ml, sometimes 50 ml or 75 ml), in USD, as sold by the brand or a department store at full price. Not a discount or grey-market price. Not a travel size.

Rate your confidence 0 to 1:
- 0.9+: a well-known fragrance whose price you know (Chanel No. 5, Dior Sauvage, Creed Aventus)
- 0.6-0.9: a known house with a consistent price range (most designer and major niche lines)
- below 0.6: you are guessing. Set price to null instead of guessing.

Return STRICT JSON: {"items":[{"id":"...","price":145,"currency":"USD","size_ml":100,"confidence":0.9}, ...]}
Use price:null and size_ml:null when unsure. Never invent a price for a fragrance you do not recognise.`;

async function estimateBatch(rows: Row[]): Promise<Estimate[]> {
  const list = rows
    .map((r) => {
      const bits = [r.name, "by", r.house];
      if (r.year) bits.push(`(${r.year})`);
      if (r.concentration) bits.push(r.concentration.toUpperCase());
      return `${r.id} | ${bits.join(" ")}`;
    })
    .join("\n");

  const res = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Fragrances (id | name by house):\n${list}` },
    ],
  });

  const raw = res.choices[0]?.message?.content ?? "{}";
  let parsed: { items?: unknown } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed.items)) return [];

  const ids = new Set(rows.map((r) => r.id));
  const out: Estimate[] = [];
  for (const it of parsed.items as Array<Record<string, unknown>>) {
    const id = String(it.id ?? "");
    if (!ids.has(id)) continue;
    const price = typeof it.price === "number" && it.price > 0 ? it.price : null;
    const size = typeof it.size_ml === "number" && it.size_ml > 0 ? it.size_ml : null;
    const conf = typeof it.confidence === "number" ? Math.max(0, Math.min(1, it.confidence)) : 0;
    out.push({
      id,
      price,
      size_ml: size,
      currency: typeof it.currency === "string" && it.currency ? it.currency : "USD",
      confidence: conf,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Self-test. Approximate US MSRPs for 100 ml as of 2025-26; the point is
// not the exact number but whether the model is in the right range. If it
// says Aventus is $60 or Sauvage is $400, nothing else it says is usable.
// ---------------------------------------------------------------------------
const KNOWN: Array<{ name: string; house: string; approx100ml: number }> = [
  { name: "Aventus", house: "Creed", approx100ml: 485 },
  { name: "Sauvage", house: "Dior", approx100ml: 165 },
  { name: "Bleu de Chanel", house: "Chanel", approx100ml: 165 },
  { name: "Baccarat Rouge 540", house: "Maison Francis Kurkdjian", approx100ml: 325 },
  { name: "Acqua di Gio", house: "Giorgio Armani", approx100ml: 130 },
  { name: "Black Opium", house: "Yves Saint Laurent", approx100ml: 150 },
  { name: "Layton", house: "Parfums de Marly", approx100ml: 335 },
  { name: "Club de Nuit Intense Man", house: "Armaf", approx100ml: 60 },
];

async function selfTest(): Promise<void> {
  console.log("--- self-test: well-known MSRPs ---");
  const rows: Row[] = KNOWN.map((k, i) => ({
    id: `test-${i}`,
    name: k.name,
    house: k.house,
    year: null,
    concentration: null,
  }));
  const est = await estimateBatch(rows);
  let bad = 0;
  for (let i = 0; i < KNOWN.length; i++) {
    const e = est.find((x) => x.id === `test-${i}`);
    const k = KNOWN[i];
    if (!e || e.price == null || e.size_ml == null) {
      console.log(`  ?  ${k.house} ${k.name}: no estimate`);
      bad++;
      continue;
    }
    const per100 = (e.price / e.size_ml) * 100;
    const err = Math.abs(per100 - k.approx100ml) / k.approx100ml;
    const ok = err <= 0.35;
    if (!ok) bad++;
    console.log(
      `  ${ok ? "ok" : "!!"} ${k.house} ${k.name}: $${per100.toFixed(0)}/100ml (expected ~$${k.approx100ml}, ${(err * 100).toFixed(0)}% off, conf ${e.confidence})`,
    );
  }
  if (bad > 2) {
    console.error(`\nSelf-test failed on ${bad}/${KNOWN.length}. The model's price memory is not`);
    console.error("good enough to trust on the rest of the catalog. Aborting before any writes.");
    process.exit(1);
  }
  console.log(`  passed (${KNOWN.length - bad}/${KNOWN.length} within 35%)\n`);
}

async function main() {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"]) {
    if (!process.env[k]) {
      console.error(`Missing ${k} in scraper/.env`);
      process.exit(1);
    }
  }

  console.log("=== Spritz price estimates (model recall, list price) ===");
  if (DRY) console.log("  (dry run: no writes)");
  await selfTest();

  // Everything, minus what already has an estimate (unless --refresh).
  const have = new Set<string>();
  if (!REFRESH) {
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase
        .from("fragrance_prices")
        .select("fragrance_id")
        .eq("source", SOURCE)
        .range(from, from + 999);
      for (const r of data ?? []) have.add(r.fragrance_id);
      if (!data || data.length < 1000) break;
    }
  }

  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("fragrances")
      .select("id, name, house, year, concentration")
      .order("popularity_rank", { ascending: true, nullsFirst: false })
      .range(from, from + 999);
    if (error) {
      console.error("query failed:", error.message);
      process.exit(1);
    }
    for (const r of data ?? []) if (!have.has(r.id)) rows.push(r as Row);
    if (!data || data.length < 1000) break;
  }
  const todo = LIMIT ? rows.slice(0, LIMIT) : rows;
  console.log(`  fragrances to estimate: ${todo.length} (${have.size} already done)`);

  let written = 0;
  let skippedLow = 0;
  let skippedNull = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    let est: Estimate[] = [];
    try {
      est = await estimateBatch(batch);
    } catch (err) {
      console.warn(`  ! batch at ${i} failed: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    const upserts = [];
    for (const e of est) {
      if (e.price == null || e.size_ml == null) {
        skippedNull++;
        continue;
      }
      if (e.confidence < MIN_CONFIDENCE) {
        skippedLow++;
        continue;
      }
      upserts.push({
        fragrance_id: e.id,
        source: SOURCE,
        price: e.price,
        currency: e.currency,
        size_ml: e.size_ml,
        confidence: e.confidence,
        fetched_at: new Date().toISOString(),
      });
    }

    if (DRY) {
      for (const u of upserts.slice(0, 5)) {
        const r = batch.find((b) => b.id === u.fragrance_id);
        console.log(`  [dry] ${r?.house} — ${r?.name}: $${u.price} / ${u.size_ml}ml (conf ${u.confidence})`);
      }
      written += upserts.length;
    } else if (upserts.length) {
      const { error } = await supabase
        .from("fragrance_prices")
        .upsert(upserts, { onConflict: "fragrance_id,source" });
      if (error) console.warn(`  ! upsert failed: ${error.message}`);
      else written += upserts.length;
    }
    process.stdout.write(`\r  ${Math.min(i + BATCH, todo.length)}/${todo.length} processed, ${written} ${DRY ? "would write" : "written"}`);
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\n\nPass 1 done. ${DRY ? "would write" : "written"}=${written} unknown=${skippedNull} low_confidence=${skippedLow}`);

  if (!FILL) {
    console.log("These are estimates of list price from model memory, not observed listings.");
    console.log("Remove them all with: delete from fragrance_prices where source = 'gpt_estimate';");
    console.log("Run with --fill to cover the rest with rougher house-level estimates.");
    return;
  }
  await fillRemaining();
}

// ===========================================================================
// --fill: cover every fragrance that pass 1 left empty.
//
// Pass 1 refuses to guess, which is right for a number shown as a saving,
// but it leaves most of the catalog blank. The fill passes accept rougher
// numbers, in order of how grounded they are, and tag each tier so the UI
// can show "rough est." on them and one DELETE can remove a tier:
//
//   house_median    the median per-ml price of the house's CONFIDENT pass-1
//                   estimates (3+ needed). Derived from numbers the model was
//                   sure about; no new model call.
//   house_estimate  the model's estimate of the HOUSE's typical 100 ml list
//                   price. Houses are far better known than individual
//                   releases, and there are ~500 of them, not 11,000.
//   gpt_guess       a forced per-fragrance guess for whatever is still left,
//                   so coverage reaches 100%. The least trustworthy tier.
//
// Concentration scales each tier: an extrait of a line costs more than its
// EDT. The multipliers are rough industry norms, not measured.
// ===========================================================================

const CONC_MULT: Record<string, number> = { edt: 0.85, edp: 1.0, parfum: 1.3, extrait: 1.5 };
const TIER_CONF = { house_median: 0.5, house_estimate: 0.4, gpt_guess: 0.2 } as const;

interface PriceRow {
  fragrance_id: string;
  source: string;
  price_per_ml: number;
}

async function allPriceRows(): Promise<PriceRow[]> {
  const out: PriceRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("fragrance_prices")
      .select("fragrance_id, source, price_per_ml")
      .range(from, from + 999);
    for (const r of data ?? []) out.push(r as PriceRow);
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function allFragrances(): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("fragrances")
      .select("id, name, house, year, concentration")
      .range(from, from + 999);
    for (const r of data ?? []) out.push(r as Row);
    if (!data || data.length < 1000) break;
  }
  return out;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function concMult(c: string | null): number {
  return CONC_MULT[(c ?? "").toLowerCase()] ?? 1.0;
}

async function write(upserts: Array<Record<string, unknown>>, label: string): Promise<number> {
  if (upserts.length === 0) return 0;
  if (DRY) return upserts.length;
  let n = 0;
  for (let i = 0; i < upserts.length; i += 500) {
    const chunk = upserts.slice(i, i + 500);
    const { error } = await supabase
      .from("fragrance_prices")
      .upsert(chunk, { onConflict: "fragrance_id,source" });
    if (error) console.warn(`  ! ${label} upsert failed: ${error.message}`);
    else n += chunk.length;
  }
  return n;
}

/** Ask the model for a house's typical 100 ml list price. Any confidence
 *  is accepted (this tier is rough by definition), but null is respected. */
async function estimateHouses(houses: string[]): Promise<Map<string, { per100: number; confidence: number }>> {
  const out = new Map<string, { per100: number; confidence: number }>();
  const SYS = `You estimate the typical US list price (MSRP) of a 100 ml Eau de Parfum from a perfume house. Answer for the house's mainline, not its cheapest flanker or its most expensive extrait. Rate confidence 0-1. If you have genuinely never heard of the house, use price null.
Return STRICT JSON: {"items":[{"house":"...","price_100ml_usd":165,"confidence":0.8}, ...]}`;
  for (let i = 0; i < houses.length; i += 40) {
    const batch = houses.slice(i, i + 40);
    try {
      const res = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYS },
          { role: "user", content: `Houses:\n${batch.join("\n")}` },
        ],
      });
      const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { items?: unknown };
      if (Array.isArray(parsed.items)) {
        for (const it of parsed.items as Array<Record<string, unknown>>) {
          const h = String(it.house ?? "");
          const p = typeof it.price_100ml_usd === "number" && it.price_100ml_usd > 0 ? it.price_100ml_usd : null;
          const c = typeof it.confidence === "number" ? it.confidence : 0;
          if (h && p != null) out.set(h, { per100: p, confidence: c });
        }
      }
    } catch (err) {
      console.warn(`  ! house batch at ${i} failed: ${err instanceof Error ? err.message : err}`);
    }
    process.stdout.write(`\r  houses asked: ${Math.min(i + 40, houses.length)}/${houses.length}`);
    await new Promise((r) => setTimeout(r, 200));
  }
  process.stdout.write("\n");
  return out;
}

async function fillRemaining(): Promise<void> {
  console.log("\n=== --fill: rough tiers for everything still empty ===");
  const [prices, frags] = await Promise.all([allPriceRows(), allFragrances()]);
  const covered = new Set(prices.map((p) => p.fragrance_id));
  let missing = frags.filter((f) => !covered.has(f.id));
  console.log(`  catalog ${frags.length}, priced ${covered.size}, missing ${missing.length}`);
  const now = new Date().toISOString();

  // ---- Tier A: house median from confident estimates -----------------------
  const confident = new Map<string, number[]>(); // house -> per-ml, normalised to EDP
  const fragById = new Map(frags.map((f) => [f.id, f]));
  for (const p of prices) {
    if (p.source !== SOURCE) continue;
    const f = fragById.get(p.fragrance_id);
    if (!f) continue;
    const key = f.house.trim().toLowerCase();
    const list = confident.get(key) ?? [];
    list.push(Number(p.price_per_ml) / concMult(f.concentration));
    confident.set(key, list);
  }
  const houseMedian = new Map<string, number>();
  for (const [h, xs] of confident) if (xs.length >= 3) houseMedian.set(h, median(xs));

  const tierA = missing
    .filter((f) => houseMedian.has(f.house.trim().toLowerCase()))
    .map((f) => {
      const perMl = houseMedian.get(f.house.trim().toLowerCase())! * concMult(f.concentration);
      return {
        fragrance_id: f.id,
        source: "house_median",
        price: Math.round(perMl * 100),
        currency: "USD",
        size_ml: 100,
        confidence: TIER_CONF.house_median,
        fetched_at: now,
      };
    });
  const wroteA = await write(tierA, "house_median");
  console.log(`  tier A house_median: ${houseMedian.size} houses with 3+ confident estimates -> ${wroteA} fragrances`);
  const doneA = new Set(tierA.map((t) => t.fragrance_id));
  missing = missing.filter((f) => !doneA.has(f.id));

  // ---- Tier B: ask the model about each remaining house --------------------
  const houses = [...new Set(missing.map((f) => f.house.trim()))].filter(Boolean);
  console.log(`  tier B house_estimate: asking about ${houses.length} houses`);
  const houseEst = await estimateHouses(houses);
  const tierB = missing
    .filter((f) => houseEst.has(f.house.trim()))
    .map((f) => {
      const h = houseEst.get(f.house.trim())!;
      return {
        fragrance_id: f.id,
        source: "house_estimate",
        price: Math.round(h.per100 * concMult(f.concentration)),
        currency: "USD",
        size_ml: 100,
        confidence: Math.min(TIER_CONF.house_estimate, h.confidence || TIER_CONF.house_estimate),
        fetched_at: now,
      };
    });
  const wroteB = await write(tierB, "house_estimate");
  console.log(`  tier B house_estimate: ${houseEst.size} houses answered -> ${wroteB} fragrances`);
  const doneB = new Set(tierB.map((t) => t.fragrance_id));
  missing = missing.filter((f) => !doneB.has(f.id));

  // ---- Tier C: forced per-fragrance guess for the remainder ----------------
  console.log(`  tier C gpt_guess: ${missing.length} left, forcing a number`);
  const SYS_FORCE = `You estimate the US list price (MSRP) of a 100 ml bottle of each fragrance. You MUST give a number for every item even if unsure; use the house's market segment (budget / designer / niche / luxury) to pick a plausible figure. Rate confidence 0-1 honestly; low is fine.
Return STRICT JSON: {"items":[{"id":"...","price_100ml_usd":60,"confidence":0.2}, ...]}`;
  const tierC: Array<Record<string, unknown>> = [];
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    try {
      const res = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYS_FORCE },
          { role: "user", content: batch.map((r) => `${r.id} | ${r.name} by ${r.house}${r.concentration ? ` (${r.concentration})` : ""}`).join("\n") },
        ],
      });
      const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { items?: unknown };
      const ids = new Set(batch.map((b) => b.id));
      if (Array.isArray(parsed.items)) {
        for (const it of parsed.items as Array<Record<string, unknown>>) {
          const id = String(it.id ?? "");
          const p = typeof it.price_100ml_usd === "number" && it.price_100ml_usd > 0 ? it.price_100ml_usd : null;
          if (!ids.has(id) || p == null) continue;
          tierC.push({
            fragrance_id: id,
            source: "gpt_guess",
            price: Math.round(p),
            currency: "USD",
            size_ml: 100,
            confidence: Math.min(TIER_CONF.gpt_guess, typeof it.confidence === "number" ? it.confidence : 0.2),
            fetched_at: now,
          });
        }
      }
    } catch (err) {
      console.warn(`  ! guess batch at ${i} failed: ${err instanceof Error ? err.message : err}`);
    }
    process.stdout.write(`\r  guessed: ${Math.min(i + BATCH, missing.length)}/${missing.length}`);
    await new Promise((r) => setTimeout(r, 200));
  }
  process.stdout.write("\n");
  const wroteC = await write(tierC, "gpt_guess");
  const stillMissing = missing.length - tierC.length;

  console.log(`\nFill done${DRY ? " (dry run, nothing written)" : ""}.`);
  console.log(`  house_median=${wroteA}  house_estimate=${wroteB}  gpt_guess=${wroteC}  still missing=${stillMissing}`);
  console.log("Each tier is removable on its own, e.g.");
  console.log("  delete from fragrance_prices where source = 'gpt_guess';");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

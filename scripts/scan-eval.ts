// scripts/scan-eval.ts — the accuracy/latency/cost harness for scan v2.
//
// Runs on YOUR machine (the sandbox can't reach OpenAI, Voyage, or the
// Supabase project). Decides two things the design doc refuses to guess:
//   1. which OCR model replaces gpt-4o (§2.6) — fastest config within
//      2 points of gpt-4o's top-1 accuracy wins
//   2. the visual-layer thresholds (§4.4) — prints the cosine distribution
//      for correct vs wrong visual top-1 so you can set SCAN_VISUAL_*
//
// Setup:
//   eval/scans/labels.csv           file,house,name      (or file,fragrance_id)
//   eval/scans/*.jpg                the photos (any size; the harness
//                                   downsizes to 1024 px like the client)
// Aim for ~30 photos: mixed lighting, a few flankers (EDT vs EDP vs Elixir),
// at least 5 with the label turned away or too dark to read.
//
// Run:
//   npx tsx scripts/scan-eval.ts                          # default models
//   npx tsx scripts/scan-eval.ts --models=gpt-4o,gpt-4.1-mini,gpt-5.4-mini,gpt-5-nano
//   npx tsx scripts/scan-eval.ts --skip-visual            # OCR only
//   npx tsx scripts/scan-eval.ts --dir=eval/scans --json=eval/scan-eval.json
//
// Reads .env.local for OPENAI_API_KEY, VOYAGE_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY. Needs `sharp` for the resize (npm i -D sharp).
//
// Coverage is reported explicitly: photos whose label couldn't be resolved
// to a catalog row are counted and EXCLUDED from accuracy, never silently
// scored as misses.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// ---- env (.env.local, no dotenv dep) --------------------------------------
for (const file of [".env.local", ".env"]) {
  const p = path.resolve(file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

type Database = import("../lib/supabase/database.types").Database;

// ---- args -----------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const DIR = flag("dir") ?? "eval/scans";
const MODELS = (flag("models") ?? "gpt-4o,gpt-4.1-mini,gpt-5.4-mini,gpt-5-nano").split(",");
const SKIP_VISUAL = args.includes("--skip-visual");
const JSON_OUT = flag("json");
const TEXT_AUTOMATCH = parseFloat(process.env.SCAN_TEXT_AUTOMATCH ?? "0.85");
const TEXT_WEIGHT = parseFloat(process.env.SCAN_FUSE_TEXT_WEIGHT ?? "0.75");

// $ per 1M tokens, Aug 2026 list prices. Update when OpenAI does.
const PRICE: Record<string, { in: number; out: number }> = {
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "gpt-5-mini": { in: 0.25, out: 2 },
  "gpt-5-nano": { in: 0.05, out: 0.4 },
  "gpt-5.4-mini": { in: 0.75, out: 4.5 },
  "gpt-5.4-nano": { in: 0.2, out: 1.25 },
};

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

// ---- labels ---------------------------------------------------------------
interface Sample {
  file: string;
  expectedId: string;
  expectedLabel: string;
  base64: string;
}
const UUID = /^[0-9a-f-]{36}$/i;

async function loadSamples(): Promise<{ samples: Sample[]; unresolved: string[] }> {
  const csv = fs.readFileSync(path.join(DIR, "labels.csv"), "utf8").trim().split("\n");
  const header = csv[0].toLowerCase();
  const rows = csv.slice(1).map((l) => l.split(",").map((c) => c.trim()));
  const sharp = (await import("sharp")).default;
  const samples: Sample[] = [];
  const unresolved: string[] = [];

  for (const cols of rows) {
    const file = cols[0];
    let expectedId: string | null = null;
    let label = "";
    if (header.includes("fragrance_id") && UUID.test(cols[1] ?? "")) {
      expectedId = cols[1];
      label = cols[1];
    } else {
      const [, house, name] = cols;
      label = `${house} ${name}`;
      const { data } = await supabase
        .rpc("search_fragrances", { p_brand: house, p_name: name, p_limit: 1 })
        .returns<Array<{ id: string; match_score: number; name: string; house: string }>>();
      const top = data?.[0];
      if (top && top.match_score >= 0.9) {
        expectedId = top.id;
        label = `${top.house} ${top.name}`;
      }
    }
    if (!expectedId) {
      unresolved.push(file);
      continue;
    }
    const buf = await sharp(path.join(DIR, file))
      .rotate()
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    samples.push({ file, expectedId, expectedLabel: label, base64: buf.toString("base64") });
  }
  return { samples, unresolved };
}

// ---- helpers --------------------------------------------------------------
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "n/a");
function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

async function textMatch(brand: string, name: string) {
  const { data } = await supabase
    .rpc("search_fragrances", { p_brand: brand, p_name: name, p_limit: 5 })
    .returns<Array<{ id: string; match_score: number }>>();
  return data ?? [];
}

// ---- main -----------------------------------------------------------------
async function main() {
// Imported AFTER env so lib/vision.ts sees the keys at module load.
const { readBottle } = await import("../lib/vision");
const { embedImage, normalizeVisual } = await import("../lib/image-embed");

const { samples, unresolved } = await loadSamples();
console.log(`\n[eval] ${samples.length} photos resolved to catalog rows; ${unresolved.length} unresolved`);
if (unresolved.length) console.log(`[eval]   unresolved (excluded): ${unresolved.join(", ")}`);
if (samples.length === 0) process.exit(1);

const report: Record<string, unknown> = { photos: samples.length, unresolved };

// OCR + text match, per model
const ocrReads: Record<string, Map<string, { brand: string | null; name: string | null }>> = {};
for (const model of MODELS) {
  const lat: number[] = [];
  let top1 = 0,
    auto = 0,
    autoWrong = 0,
    nullRead = 0,
    tokIn = 0,
    tokOut = 0,
    errors = 0;
  ocrReads[model] = new Map();
  for (const s of samples) {
    const t0 = Date.now();
    try {
      const r = await readBottle(s.base64, "gpt4o", { model });
      lat.push(Date.now() - t0);
      tokIn += r.usage?.input ?? 0;
      tokOut += r.usage?.output ?? 0;
      ocrReads[model].set(s.file, { brand: r.brand, name: r.name });
      if (!r.brand || !r.name) {
        nullRead++;
        continue;
      }
      const rows = await textMatch(r.brand, r.name);
      const top = rows[0];
      if (top?.id === s.expectedId) top1++;
      if (top && top.match_score >= TEXT_AUTOMATCH) {
        auto++;
        if (top.id !== s.expectedId) autoWrong++;
      }
    } catch (err) {
      errors++;
      lat.push(Date.now() - t0);
      console.log(`[eval]   ${model} ${s.file}: ${err instanceof Error ? err.message : err}`);
    }
  }
  const price = PRICE[model];
  const cost = price
    ? ((tokIn * price.in + tokOut * price.out) / 1e6 / samples.length).toFixed(4)
    : "?";
  console.log(
    `\n[ocr] ${model.padEnd(14)} top-1 ${pct(top1, samples.length).padStart(4)}  ` +
      `auto-match ${pct(auto, samples.length).padStart(4)} (wrong: ${autoWrong})  ` +
      `null-read ${nullRead}  errors ${errors}  ` +
      `p50 ${quantile(lat, 0.5)}ms  p95 ${quantile(lat, 0.95)}ms  ~$${cost}/scan`,
  );
  report[`ocr:${model}`] = { top1, auto, autoWrong, nullRead, errors, p50: quantile(lat, 0.5), p95: quantile(lat, 0.95), cost };
}

// Visual layer: embed each photo, kNN, and report cosine distributions.
if (!SKIP_VISUAL && process.env.VOYAGE_API_KEY) {
  const lat: number[] = [];
  let top1 = 0,
    top5 = 0,
    empty = 0;
  const correctSims: number[] = [];
  const wrongSims: number[] = [];
  const margins: number[] = [];
  let fusedTop1 = 0;
  const baseline = ocrReads[MODELS[0]];

  for (const s of samples) {
    const t0 = Date.now();
    const emb = await embedImage(s.base64);
    lat.push(Date.now() - t0);
    if (!emb) {
      empty++;
      continue;
    }
    const { data: rows, error } = await supabase.rpc("match_bottle_images", {
      p_embedding: emb.vector,
      p_limit: 5,
      p_house: null,
    });
    if (error) {
      console.log(`[visual] match_bottle_images failed: ${error.message} (migration 0023 pushed? embed:images run?)`);
      break;
    }
    const list = rows ?? [];
    if (!list.length) {
      empty++;
      continue;
    }
    const top = list[0];
    const margin = top.similarity - (list[1]?.similarity ?? 0);
    margins.push(margin);
    if (top.fragrance_id === s.expectedId) {
      top1++;
      correctSims.push(top.similarity);
    } else {
      wrongSims.push(top.similarity);
    }
    if (list.some((r) => r.fragrance_id === s.expectedId)) top5++;

    // Fused, using the baseline model's read: same math as the route.
    const read = baseline?.get(s.file);
    if (read?.brand && read?.name) {
      const text = await textMatch(read.brand, read.name);
      // Same math as the route: missing side counts as 0.
      const scores = new Map<string, number>();
      for (const t of text) scores.set(t.id, TEXT_WEIGHT * t.match_score);
      for (const v of list) {
        const t = text.find((x) => x.id === v.fragrance_id);
        const vn = normalizeVisual(v.similarity);
        scores.set(v.fragrance_id, TEXT_WEIGHT * (t?.match_score ?? 0) + (1 - TEXT_WEIGHT) * vn);
      }
      const best = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
      if (best?.[0] === s.expectedId) fusedTop1++;
    } else if (top.fragrance_id === s.expectedId) {
      fusedTop1++;
    }
  }

  const n = samples.length - empty;
  console.log(
    `\n[visual] voyage  top-1 ${pct(top1, n)}  top-5 ${pct(top5, n)}  no-result ${empty}  ` +
      `p50 ${quantile(lat, 0.5)}ms  p95 ${quantile(lat, 0.95)}ms`,
  );
  console.log(
    `[visual] cosine when top-1 CORRECT: p10 ${quantile(correctSims, 0.1).toFixed(3)}  p50 ${quantile(correctSims, 0.5).toFixed(3)}` +
      `   when WRONG: p50 ${quantile(wrongSims, 0.5).toFixed(3)}  p90 ${quantile(wrongSims, 0.9).toFixed(3)}`,
  );
  console.log(
    `[visual] margin over #2: p50 ${quantile(margins, 0.5).toFixed(3)}  p10 ${quantile(margins, 0.1).toFixed(3)}`,
  );
  console.log(
    `[visual] → set SCAN_VISUAL_AUTOMATCH just above the WRONG p90 and SCAN_VISUAL_CEIL near the CORRECT p50; ` +
      `SCAN_VISUAL_FLOOR near the WRONG p50.`,
  );
  console.log(`[fused]  text(${MODELS[0]}) + visual, weight ${TEXT_WEIGHT}: top-1 ${pct(fusedTop1, n)}`);
  report.visual = { top1, top5, empty, correctSims, wrongSims, margins, fusedTop1 };
} else if (!SKIP_VISUAL) {
  console.log("\n[visual] skipped: VOYAGE_API_KEY not set");
}

if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
  console.log(`\n[eval] wrote ${JSON_OUT}`);
}
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

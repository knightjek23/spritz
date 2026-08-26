// Suggest Fragrantica slugs for shortlist names that didn't resolve.
//
//   npm run find:slugs              suggest for every unmatched shortlist row
//   npm run find:slugs -- "Heeley"  suggest for one ad-hoc name
//
// Pure local string matching against data/houses.json. Makes NO network
// requests, so it's safe to run while rate-limited.
//
// Fragrantica names brands in ways no normaliser will guess:
//   "Frederic Malle"  is listed as  Editions-de-Parfums-Frederic-Malle
//   "Heeley"          is listed as  James-Heeley
//   "Cire Trudon"     is listed as  Trudon
// Rather than guessing, this ranks real slugs by similarity so you can copy the
// right one into ALIASES in src/match-shortlist.ts.

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve("data");
const HOUSES_FILE = path.join(DATA_DIR, "houses.json");
const SHORTLIST_FILE = path.join(DATA_DIR, "house-shortlist.json");

const TOP_N = Number(process.env.FIND_TOP_N ?? 6);

interface FragHouse {
  slug: string;
  count: number;
}
interface ShortlistRow {
  tier: number;
  name: string;
  slug: string | null;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/** Significant word tokens, minus filler that appears in hundreds of brands. */
const STOP = new Set([
  "the", "of", "de", "du", "des", "la", "le", "les", "et", "and", "by",
  "parfums", "parfum", "perfume", "perfumes", "perfumery", "fragrances",
  "fragrance", "co", "inc", "ltd", "paris", "london", "milano", "roma",
]);

function tokens(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Dice coefficient over character trigrams — robust to word order and noise. */
function trigrams(s: string): Set<string> {
  const p = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  return out;
}
function dice(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let hits = 0;
  for (const t of A) if (B.has(t)) hits++;
  return (2 * hits) / (A.size + B.size);
}

function score(name: string, slug: string): number {
  const nk = norm(name);
  const sk = norm(slug);
  if (nk === sk) return 1;

  let s = dice(nk, sk);

  // Containment is a strong signal: "Frederic Malle" inside
  // "Editions de Parfums Frederic Malle" should beat a fuzzy near-miss.
  if (sk.includes(nk) || nk.includes(sk)) s += 0.45;

  // Every significant token present, in any order.
  const nt = tokens(name);
  const st = new Set(tokens(slug));
  if (nt.length > 0) {
    const hit = nt.filter((t) => st.has(t)).length;
    s += 0.35 * (hit / nt.length);
    // A rare, long token matching exactly (e.g. "fazzolari") is near-proof.
    if (hit > 0 && nt.some((t) => t.length >= 7 && st.has(t))) s += 0.2;
  }
  return s;
}

async function main() {
  const houses: FragHouse[] = JSON.parse(await fs.readFile(HOUSES_FILE, "utf8"));

  const argName = process.argv.slice(2).join(" ").trim();
  let targets: { tier: number; name: string }[];

  if (argName) {
    targets = [{ tier: 0, name: argName }];
  } else {
    let rows: ShortlistRow[];
    try {
      rows = JSON.parse(await fs.readFile(SHORTLIST_FILE, "utf8"));
    } catch {
      console.error(
        `[find] ${SHORTLIST_FILE} not found. Run \`npm run match:shortlist\` first.`,
      );
      process.exit(1);
    }
    targets = rows.filter((r) => !r.slug).map((r) => ({ tier: r.tier, name: r.name }));
    if (targets.length === 0) {
      console.log(`[find] nothing unmatched — every shortlist name already resolved.`);
      return;
    }
  }

  console.log(
    `[find] ${targets.length} name(s) against ${houses.length} Fragrantica brands\n` +
      `[find] copy good hits into ALIASES in src/match-shortlist.ts, keyed by the\n` +
      `[find] LOWERCASED shortlist name, e.g.  "heeley": "James-Heeley",\n`,
  );

  for (const t of targets) {
    const ranked = houses
      .map((h) => ({ slug: h.slug, count: h.count, s: score(t.name, h.slug) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, TOP_N);

    console.log(`\n${t.tier ? `[t${t.tier}] ` : ""}${t.name}`);

    // Raw scores are unbounded (containment and token bonuses stack), so an
    // absolute threshold marks everything as certain. Confidence is relative:
    // how far clear the top hit is of the runner-up.
    const best = ranked[0]?.s ?? 0;
    const second = ranked[1]?.s ?? 0;
    const decisive = best > 0 && (second === 0 || best / second >= 1.15);

    if (best < 0.4) {
      console.log(`   (no plausible match — probably not listed on Fragrantica)`);
    }
    ranked.forEach((r, i) => {
      const mark = i === 0 && decisive ? "***" : i === 0 ? "** " : i < 3 ? "*  " : "   ";
      console.log(
        `   ${mark} ${r.slug}${" ".repeat(Math.max(1, 44 - r.slug.length))}${r.count} frags   (${(r.s / (best || 1)).toFixed(2)})`,
      );
    });
    if (best >= 0.4 && !decisive) {
      console.log(`       ↑ top hits are close — pick by eye, don't assume #1`);
    }
  }

  console.log(
    `\n[find] *** = clearly ahead of the runner-up. ** = top hit but close. * = also plausible.\n` +
      `[find] Scores are relative to the best hit for that name, not absolute.\n` +
      `[find] Where several candidates are close, only one of them actually exists in your\n` +
      `[find] houses.json — check the fragrance count, a real brand page won't have 0.\n` +
      `[find] Anything with no plausible hit is probably absent from Fragrantica; drop it\n` +
      `[find] from data/house-shortlist-input.json rather than forcing a match.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

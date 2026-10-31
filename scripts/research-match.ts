// Resolve data/scent-research.json entries to catalog ids:
//   npm run research:match
//
// Pass 1: the same name + house matcher as the trending feeds
// (lib/trending/join.ts: exact name/house first, fuzzy >= 0.85 second).
// Pass 2, for what pass 1 misses: look the entry up in the scraper's
// per-house Fragrantica URL lists (lib/discovery/research-resolve.ts) and
// find the catalog row by its Fragrantica id. This catches house-prefixed
// catalog names ("Emporio Armani Stronger With You"), concentration and
// year suffixes, and accents. Writes fragrance_id back into the file. Entries it cannot match stay in
// the file with fragrance_id null and are listed here, never dropped:
// a quiet drop would shrink the lists without anyone noticing.
//
// Needs .env.local with the Supabase URL and sb_secret_ service key, like
// scripts/push-test.ts. Writes only the JSON file; never the database.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!m) continue;
  const value = m[2].trim().replace(/^["']|["']$/g, "");
  if (value) process.env[m[1]] = value;
}

// lib/trending/join.ts imports "server-only", which throws outside Next.
const req = createRequire(process.cwd() + "/package.json");
try {
  const p = req.resolve("server-only");
  req.cache[p] = {
    id: p, filename: p, loaded: true, exports: {}, children: [], paths: [],
  } as unknown as ReturnType<typeof createRequire>["cache"][string];
} catch {
  /* not installed */
}

const FILE = "data/scent-research.json";
const HOUSE_LISTS = "scraper/data/house-fragrances";
const CHUNK = 20;

async function main() {
  const { joinTrendingToCatalog } = await import("../lib/trending/join");
  const { resolveResearchEntry } = await import("../lib/discovery/research-resolve");
  const { createAdminClient } = await import("../lib/supabase/admin");
  const research = JSON.parse(fs.readFileSync(FILE, "utf8")) as {
    generated_at: string;
    entries: Array<{ name: string; house: string; fragrance_id: string | null; lists: string[] }>;
  };

  // ---- Pass 1: name + house ----
  let pass1 = 0;
  for (let i = 0; i < research.entries.length; i += CHUNK) {
    const chunk = research.entries.slice(i, i + CHUNK);
    const joined = await joinTrendingToCatalog(
      chunk.map((e, k) => ({ rank: i + k + 1, name: e.name, house: e.house })),
    );
    joined.forEach((j, k) => {
      chunk[k].fragrance_id = j.fragranceId;
      if (j.fragranceId) pass1++;
    });
    process.stdout.write(`\r  pass 1: matched ${pass1} of ${Math.min(i + CHUNK, research.entries.length)}`);
  }
  console.log("");

  // ---- Pass 2: Fragrantica id via the scraper's house URL lists ----
  const lists: Record<string, Array<{ url: string; votes?: number | null }>> = {};
  for (const f of fs.readdirSync(HOUSE_LISTS)) {
    if (f.endsWith(".json")) lists[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(HOUSE_LISTS, f), "utf8"));
  }
  const supabase = createAdminClient();
  const pass2: string[] = [];
  let notInCatalog = 0;
  for (const e of research.entries) {
    if (e.fragrance_id) continue;
    const r = resolveResearchEntry(e, lists);
    if (!r) continue;
    const { data, error } = await supabase
      .from("fragrances")
      .select("id, name, house")
      .like("fragrantica_url", `%-${r.fragranticaId}.html`)
      .limit(1);
    if (error) {
      console.warn(`  pass 2 query failed for ${e.name}: ${error.message}`);
      continue;
    }
    const row = data?.[0];
    if (!row) {
      notInCatalog++;
      continue;
    }
    e.fragrance_id = row.id;
    pass2.push(`  T${r.tier}  ${e.name} (${e.house})  ->  ${row.name} (${row.house})`);
  }

  fs.writeFileSync(FILE, JSON.stringify(research, null, 2) + "\n");

  const matched = research.entries.filter((e) => e.fragrance_id).length;
  const per = (list: string) =>
    research.entries.filter((e) => e.fragrance_id && e.lists.includes(list)).length;
  console.log(`Matched ${matched} of ${research.entries.length} (pass 1: ${pass1}, pass 2: ${pass2.length})`);
  for (const l of ["men", "women", "seasonal-fall", "seasonal-winter", "seasonal-spring", "seasonal-summer"]) {
    console.log(`  ${l}: ${per(l)} matched`);
  }
  // Pass 2 pairs are printed so a wrong pairing is visible, not silent.
  console.log(`Pass 2 pairings (${pass2.length}), check these read right:`);
  for (const p of pass2) console.log(p);
  if (notInCatalog) console.log(`Resolved on Fragrantica but not in the catalog: ${notInCatalog}`);
  const unmatched = research.entries.filter((e) => !e.fragrance_id);
  console.log(`Unmatched (${unmatched.length}):`);
  for (const e of unmatched) console.log(`  ${e.name} (${e.house}) [${e.lists.join(", ")}]`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

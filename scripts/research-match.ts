// Resolve data/scent-research.json entries to catalog ids:
//   npm run research:match
//
// Uses the same name + house matcher as the trending feeds
// (lib/trending/join.ts: exact name/house first, fuzzy >= 0.85 second) and
// writes fragrance_id back into the file. Entries it cannot match stay in
// the file with fragrance_id null and are listed here, never dropped:
// a quiet drop would shrink the lists without anyone noticing.
//
// Needs .env.local with the Supabase URL and sb_secret_ service key, like
// scripts/push-test.ts. Writes only the JSON file; never the database.

import fs from "node:fs";
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
const CHUNK = 20;

async function main() {
  const { joinTrendingToCatalog } = await import("../lib/trending/join");
  const research = JSON.parse(fs.readFileSync(FILE, "utf8")) as {
    generated_at: string;
    entries: Array<{ name: string; house: string; fragrance_id: string | null; lists: string[] }>;
  };

  const unmatched: string[] = [];
  let matched = 0;
  for (let i = 0; i < research.entries.length; i += CHUNK) {
    const chunk = research.entries.slice(i, i + CHUNK);
    const joined = await joinTrendingToCatalog(
      chunk.map((e, k) => ({ rank: i + k + 1, name: e.name, house: e.house })),
    );
    joined.forEach((j, k) => {
      const e = chunk[k];
      e.fragrance_id = j.fragranceId;
      if (j.fragranceId) matched++;
      else unmatched.push(`${e.name} (${e.house}) [${e.lists.join(", ")}]`);
    });
    process.stdout.write(`\r  matched ${matched} of ${Math.min(i + CHUNK, research.entries.length)}`);
  }
  console.log("");

  fs.writeFileSync(FILE, JSON.stringify(research, null, 2) + "\n");

  const per = (list: string) =>
    research.entries.filter((e) => e.fragrance_id && e.lists.includes(list)).length;
  console.log(`Matched ${matched} of ${research.entries.length}`);
  for (const l of ["men", "women", "seasonal-fall", "seasonal-winter", "seasonal-spring", "seasonal-summer"]) {
    console.log(`  ${l}: ${per(l)} matched`);
  }
  console.log(`Unmatched (${unmatched.length}):`);
  for (const u of unmatched) console.log(`  ${u}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

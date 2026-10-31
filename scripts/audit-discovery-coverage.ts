// How much of the catalog can feed Seasonal Suggestions and Top Scents:
//   npm run audit:discovery
//
// Counts, among the 300 most popular fragrances, how many have gender and
// season_tags filled and pass the quality floor (bottle image + notes), and
// how many are eligible for each list. Decides whether the season-inference
// fallback (plan Task 4b) is needed: it is if fewer than 60% have season
// tags or any season x gender list has fewer than 30 eligible.
//
// Needs .env.local with NEXT_PUBLIC_SUPABASE_URL and the sb_secret_
// SUPABASE_SERVICE_ROLE_KEY, same as scripts/push-test.ts. Read-only.

import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!m) continue;
  const value = m[2].trim().replace(/^["']|["']$/g, "");
  if (value) process.env[m[1]] = value;
}

import { createClient } from "@supabase/supabase-js";

const SEASONS = ["spring", "summer", "fall", "winter"] as const;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from("fragrances")
    .select("id, gender, season_tags, bottle_image_url, top_notes, mid_notes, base_notes")
    .not("popularity_rank", "is", null)
    .order("popularity_rank", { ascending: true })
    .limit(300);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const n = rows.length;
  const pct = (x: number) => `${x} (${n ? Math.round((100 * x) / n) : 0}%)`;

  const genders = new Map<string, number>();
  for (const r of rows) genders.set(String(r.gender), (genders.get(String(r.gender)) ?? 0) + 1);
  const tagged = rows.filter((r) => (r.season_tags ?? []).length > 0);
  const hasNotes = (r: (typeof rows)[number]) =>
    [r.top_notes, r.mid_notes, r.base_notes].some((x) => Array.isArray(x) && x.length > 0);
  const quality = rows.filter((r) => r.bottle_image_url && hasNotes(r));

  console.log(`Top ${n} by popularity`);
  console.log(`  gender:`, Object.fromEntries(genders));
  console.log(`  season_tags filled: ${pct(tagged.length)}`);
  for (const s of SEASONS) {
    console.log(`    ${s}: ${rows.filter((r) => (r.season_tags ?? []).includes(s)).length}`);
  }
  console.log(`  quality floor (image + notes): ${pct(quality.length)}`);

  const forMen = (g: string | null) => g === "masculine" || g === "unisex";
  const forWomen = (g: string | null) => g === "feminine" || g === "unisex";
  console.log(`Eligible (quality floor applied)`);
  console.log(`  men: ${quality.filter((r) => forMen(r.gender)).length}`);
  console.log(`  women: ${quality.filter((r) => forWomen(r.gender)).length}`);
  let thin = false;
  for (const s of SEASONS) {
    const inSeason = quality.filter((r) => (r.season_tags ?? []).includes(s));
    const m = inSeason.filter((r) => forMen(r.gender)).length;
    const w = inSeason.filter((r) => forWomen(r.gender)).length;
    if (m < 30 || w < 30) thin = true;
    console.log(`  ${s}: men ${m}, women ${w}`);
  }
  const needInference = tagged.length < 0.6 * n || thin;
  console.log(`\nSeason inference fallback (plan Task 4b): ${needInference ? "NEEDED" : "not needed"}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

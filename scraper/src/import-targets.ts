// Surgical importer for a hand-picked set of already-scraped fragrances.
//
// Why this exists instead of `pnpm parse && pnpm upload`: the full upload
// re-writes popularity_rank for every row from queue order, which would
// destroy the AI popularity backfill. This script touches ONLY the target
// fragrances and never writes popularity_rank, so the backfill is safe.
//
// For each target raw HTML file:
//   1. Parse it (applies name-overrides from name-overrides.ts, so the
//      catalog stores the real on-bottle name — e.g. "Vanilla Sex", not
//      Fragrantica's censored "Vanilla").
//   2. If a row with the same fragrantica_url already exists, UPDATE it in
//      place (fixes a mis-named row, keeps its existing popularity_rank).
//   3. Otherwise INSERT a new row (popularity_rank left null — run
//      `pnpm popularity` afterward to rank just the new rows).
//
// Run:  cd scraper && pnpm import:targets
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in scraper/.env.

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseHtml } from "./parser";

const RAW_DIR = path.resolve("data/raw");

// The already-scraped raw HTML files to (re)import, with the canonical
// Fragrantica URL each was fetched from (drives the name-override id and
// the in-place-update lookup).
const TARGETS: Array<{ file: string; url: string }> = [
  { file: "kayali-fragrances--vanilla-28-52616.html", url: "https://www.fragrantica.com/perfume/Kayali-Fragrances/Vanilla-28-52616.html" },
  { file: "tom-ford--vanilla-88588.html", url: "https://www.fragrantica.com/perfume/Tom-Ford/Vanilla-88588.html" },
  { file: "yves-saint-laurent--myslf-eau-de-parfum-84094.html", url: "https://www.fragrantica.com/perfume/Yves-Saint-Laurent/MYSLF-Eau-de-Parfum-84094.html" },
  { file: "valentino--valentino-uomo-born-in-roma-55963.html", url: "https://www.fragrantica.com/perfume/Valentino/Valentino-Uomo-Born-in-Roma-55963.html" },
  { file: "valentino--valentino-donna-born-in-roma-55805.html", url: "https://www.fragrantica.com/perfume/Valentino/Valentino-Donna-Born-In-Roma-55805.html" },
];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

// Content columns only — never popularity_rank or popularity_score.
function contentRow(f: ReturnType<typeof parseHtml> & object) {
  return {
    name: f.name,
    house: f.house,
    family: f.family,
    gender: f.gender,
    year: f.year,
    top_notes: f.top_notes,
    mid_notes: f.mid_notes,
    base_notes: f.base_notes,
    longevity_score: f.longevity_score,
    longevity_confidence: f.longevity_confidence,
    sillage_score: f.sillage_score,
    sillage_confidence: f.sillage_confidence,
    season_tags: f.season_tags,
    time_tags: f.time_tags,
    bottle_image_url: f.bottle_image_url,
    editorial_notes: f.editorial_notes,
    fragrantica_url: f.fragrantica_url,
  };
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in scraper/.env.\n" +
        "Add them (URL is the same as the app; use your NEW sb_secret_ key) and re-run.",
    );
    process.exit(1);
  }

  console.log("--- Surgical target import (popularity_rank untouched) ---\n");
  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const t of TARGETS) {
    const full = path.join(RAW_DIR, t.file);
    let html: string;
    try {
      html = await fs.readFile(full, "utf8");
    } catch {
      console.warn(`  ! missing raw file: ${t.file}`);
      failed++;
      continue;
    }

    const parsed = parseHtml(html, t.url);
    if (!parsed) {
      console.warn(`  ! parse failed: ${t.file}`);
      failed++;
      continue;
    }
    const row = contentRow(parsed as never);

    // Does a row already exist for this Fragrantica URL? If so, update in
    // place (preserves popularity_rank); else insert fresh.
    const { data: existing, error: selErr } = await supabase
      .from("fragrances")
      .select("id, name")
      .eq("fragrantica_url", t.url)
      .maybeSingle();
    if (selErr) {
      console.warn(`  ! lookup failed for ${parsed.house} — ${parsed.name}: ${selErr.message}`);
      failed++;
      continue;
    }

    if (existing) {
      const { error } = await supabase.from("fragrances").update(row).eq("id", existing.id);
      if (error) {
        console.warn(`  ! update failed: ${parsed.house} — ${parsed.name}: ${error.message}`);
        failed++;
      } else {
        updated++;
        const renamed = existing.name !== parsed.name ? `  (renamed "${existing.name}" -> "${parsed.name}")` : "";
        console.log(`  ~ updated  ${parsed.house} — ${parsed.name}${renamed}`);
      }
    } else {
      const { error } = await supabase.from("fragrances").insert(row);
      if (error) {
        console.warn(`  ! insert failed: ${parsed.house} — ${parsed.name}: ${error.message}`);
        failed++;
      } else {
        inserted++;
        console.log(`  + inserted ${parsed.house} — ${parsed.name}`);
      }
    }
  }

  console.log(`\nDone. inserted=${inserted} updated=${updated} failed=${failed}`);
  if (inserted > 0) {
    console.log("New rows have no popularity_rank yet. Run `pnpm popularity` to rank just them (it only fills NULLs).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

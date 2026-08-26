// Resolve the curated house shortlist against Fragrantica's brand universe.
//
//   npm run match:shortlist
//
// Reads:
//   data/house-shortlist-input.json   curated names + tiers (edit this by hand)
//   data/houses.json                  all 8,041 Fragrantica brands + counts
//   data/houses-ranked.json           vote scores for whatever has been ranked
//   Supabase                          which houses are already in the catalogue
//
// Writes:
//   data/house-shortlist.json         machine-readable, slug-resolved
//   data/house-shortlist.md           human-readable review sheet
//
// Makes ZERO requests to Fragrantica. Slug matching is pure string work against
// houses.json, so this is safe to run while rate-limited.

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const DATA_DIR = path.resolve("data");
const INPUT_FILE = path.join(DATA_DIR, "house-shortlist-input.json");
const HOUSES_FILE = path.join(DATA_DIR, "houses.json");
const RANKED_FILE = path.join(DATA_DIR, "houses-ranked.json");
const OUT_JSON = path.join(DATA_DIR, "house-shortlist.json");
const OUT_MD = path.join(DATA_DIR, "house-shortlist.md");

interface InputHouse {
  tier: number;
  name: string;
}
interface FragHouse {
  slug: string;
  url: string;
  count: number;
}
interface RankedHouse {
  slug: string;
  score: number;
}

export interface ResolvedHouse {
  tier: number;
  name: string;
  slug: string | null;
  url: string | null;
  fragranceCount: number | null;
  voteScore: number | null; // null = not ranked yet
  inCatalogue: boolean;
  catalogueRows: number;
  matchKind: "exact" | "normalised" | "alias" | "fuzzy" | "none";
}

/**
 * Fragrantica slugs replace punctuation and spaces with hyphens and drop
 * accents inconsistently ("Dolce-Gabbana", "Victoria-s-Secret", "Penhaligon-s").
 * Normalising both sides to bare alphanumerics makes them comparable.
 *
 * Note: "&" is DROPPED, not expanded to "and". Fragrantica drops it too, so
 * "Bath & Body Works" -> "bathbodyworks" matches slug "Bath-Body-Works".
 * Expanding to "and" would break Bath & Body Works, Van Cleef & Arpels,
 * Zadig & Voltaire, Viktor&Rolf, Goldfield & Banks and Abercrombie & Fitch.
 */
function normalise(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Names where the obvious normalisation won't reach Fragrantica's slug. */
const ALIASES: Record<string, string> = {
  "hermes": "Hermes",
  "dolce&gabbana": "Dolce-Gabbana",
  "chloe": "Chloe",
  "lancome": "Lancome",
  "estee lauder": "Estee-Lauder",
  "frederic malle": "Frederic-Malle",
  "maison martin margiela": "Maison-Martin-Margiela",
  "comme des garcons": "Comme-des-Garcons",
  "ds&durga": "DS-Durga",
  "bond no 9": "Bond-No-9",
  "victoria's secret": "Victoria-s-Secret",
  "penhaligon's": "Penhaligon-s",
  "fine'ry.": "Fine-ry",
  "joop!": "Joop",
  "toskovat'": "Toskovat",
  "d'annam": "d-Annam",
  "etat libre d'orange": "Etat-Libre-d-Orange",
  "l'artisan parfumeur": "L-Artisan-Parfumeur",
  "l'occitane en provence": "L-Occitane-en-Provence",
  "o boticario": "O-Boticario",
  "stephane humbert lucas 777": "Stephane-Humbert-Lucas-777",
  "haute fragrance company hfc": "Haute-Fragrance-Company",
  "initio parfums prives": "Initio-Parfums-Prives",
  "borntostandout": "BORNTOSTANDOUT",
  "lacoste fragrances": "Lacoste-Fragrances",
  "dunhill": "Alfred-Dunhill",
  "widian": "Widian-AJ-Arabia",
  "nishane istanbul": "Nishane",
  "areej le dore": "Areej-Le-Dore",
  "regime des fleurs": "Regime-des-Fleurs",
  "floraiku": "Floraiku",
  "cire trudon": "Cire-Trudon",
  "m micallef": "M-Micallef",
  "the dua brand": "The-Dua-Brand",
};

async function main() {
  const input = JSON.parse(await fs.readFile(INPUT_FILE, "utf8")) as {
    houses: InputHouse[];
  };
  const houses = JSON.parse(await fs.readFile(HOUSES_FILE, "utf8")) as FragHouse[];
  const ranked = await fs
    .readFile(RANKED_FILE, "utf8")
    .then((r) => JSON.parse(r) as RankedHouse[])
    .catch(() => [] as RankedHouse[]);

  // Dedupe the curated list, keeping the first (best-tier) occurrence.
  const seen = new Set<string>();
  const dupes: string[] = [];
  const list: InputHouse[] = [];
  for (const h of input.houses) {
    const k = normalise(h.name);
    if (seen.has(k)) {
      dupes.push(h.name);
      continue;
    }
    seen.add(k);
    list.push(h);
  }

  // Index Fragrantica's 8,041 brands by normalised slug and by normalised
  // slug-with-hyphens-as-spaces, so "Al Haramain Perfumes" finds
  // "Al-Haramain-Perfumes".
  const bySlug = new Map<string, FragHouse>();
  for (const h of houses) {
    const k = normalise(h.slug);
    const prev = bySlug.get(k);
    // On collision prefer the bigger catalogue — it's the real brand page.
    if (!prev || h.count > prev.count) bySlug.set(k, h);
  }
  const scoreBySlug = new Map(ranked.map((r) => [r.slug, r.score]));

  // Which houses are already in the catalogue?
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const catalogue = new Map<string, number>();
  if (url && key) {
    const sb = createClient(url, key);
    let from = 0;
    for (;;) {
      const { data, error } = await sb
        .from("fragrances")
        .select("house")
        .range(from, from + 999);
      if (error) {
        console.warn(`[match] Supabase read failed (${error.message}) — continuing without catalogue flags`);
        break;
      }
      if (!data || data.length === 0) break;
      for (const row of data as { house: string | null }[]) {
        const h = (row.house ?? "").trim();
        if (!h) continue;
        const k = normalise(h);
        catalogue.set(k, (catalogue.get(k) ?? 0) + 1);
      }
      if (data.length < 1000) break;
      from += 1000;
    }
  } else {
    console.warn("[match] No Supabase creds in scraper/.env — catalogue flags will all read false");
  }

  const resolved: ResolvedHouse[] = list.map((h) => {
    const nk = normalise(h.name);
    let match: FragHouse | undefined;
    let kind: ResolvedHouse["matchKind"] = "none";

    const aliasSlug = ALIASES[h.name.toLowerCase()];
    if (aliasSlug) {
      match = bySlug.get(normalise(aliasSlug));
      if (match) kind = "alias";
    }
    if (!match) {
      match = bySlug.get(nk);
      if (match) kind = "exact";
    }
    if (!match) {
      // Try dropping common suffix words that Fragrantica sometimes omits.
      for (const suffix of [
        "perfumes",
        "parfums",
        "fragrances",
        "paris",
        "london",
        "perfume",
        "perfumery",
        "designs",
        "profumo",
      ]) {
        const trimmed = nk.endsWith(suffix) ? nk.slice(0, -suffix.length) : null;
        if (trimmed && bySlug.has(trimmed)) {
          match = bySlug.get(trimmed);
          kind = "normalised";
          break;
        }
        const added = nk + suffix;
        if (bySlug.has(added)) {
          match = bySlug.get(added);
          kind = "normalised";
          break;
        }
      }
    }
    if (!match) {
      // Last resort: unique prefix match, but only when unambiguous.
      const hits = [...bySlug.entries()].filter(
        ([k]) => k.startsWith(nk) || nk.startsWith(k),
      );
      if (hits.length === 1 && Math.abs(hits[0][0].length - nk.length) <= 6) {
        match = hits[0][1];
        kind = "fuzzy";
      }
    }

    const rows = catalogue.get(nk) ?? 0;
    return {
      tier: h.tier,
      name: h.name,
      slug: match?.slug ?? null,
      url: match?.url ?? null,
      fragranceCount: match?.count ?? null,
      voteScore: match ? scoreBySlug.get(match.slug) ?? null : null,
      inCatalogue: rows > 0,
      catalogueRows: rows,
      matchKind: match ? kind : "none",
    };
  });

  await fs.writeFile(OUT_JSON, JSON.stringify(resolved, null, 2));

  // ---- review sheet ----
  const unmatched = resolved.filter((r) => !r.slug);
  const fuzzy = resolved.filter((r) => r.matchKind === "fuzzy");
  const newHouses = resolved.filter((r) => r.slug && !r.inCatalogue);
  const haveHouses = resolved.filter((r) => r.inCatalogue);
  const alreadyRanked = resolved.filter((r) => r.voteScore != null);

  const rows = (arr: ResolvedHouse[]) =>
    arr
      .map(
        (r) =>
          `| ${r.tier} | ${r.name} | ${r.slug ?? "**UNMATCHED**"} | ${r.fragranceCount ?? "-"} | ${
            r.voteScore ?? "-"
          } | ${r.inCatalogue ? `yes (${r.catalogueRows})` : "no"} | ${r.matchKind} |`,
      )
      .join("\n");

  const md = `# House shortlist — ${resolved.length} houses

Generated by \`npm run match:shortlist\`. No Fragrantica requests were made.

- **${resolved.length}** houses after dedupe${dupes.length ? ` (${dupes.length} duplicate${dupes.length === 1 ? "" : "s"} dropped: ${dupes.join(", ")})` : ""}
- **${haveHouses.length}** already in the catalogue
- **${newHouses.length}** new houses to add
- **${alreadyRanked.length}** already have Fragrantica vote scores from \`rank:houses\`
- **${unmatched.length}** could not be matched to a Fragrantica slug${unmatched.length ? " — fix these by hand before scraping" : ""}

Columns: tier, name, resolved Fragrantica slug, that brand's fragrance count on
Fragrantica, vote score if already ranked, whether it's in your catalogue, and
how the name was matched. \`fuzzy\` matches are worth a glance.

${
  unmatched.length
    ? `## ⚠ Unmatched (${unmatched.length})

These names don't resolve to a Fragrantica brand page. Either the house is
listed under a different name, or it isn't on Fragrantica. Add the correct slug
to \`ALIASES\` in \`src/match-shortlist.ts\`, or drop the row from
\`data/house-shortlist-input.json\`.

| Tier | Name |
| --- | --- |
${unmatched.map((r) => `| ${r.tier} | ${r.name} |`).join("\n")}

`
    : ""
}${
    fuzzy.length
      ? `## Fuzzy matches to sanity-check (${fuzzy.length})

| Tier | Name | Matched slug | Count |
| --- | --- | --- | --- |
${fuzzy.map((r) => `| ${r.tier} | ${r.name} | ${r.slug} | ${r.fragranceCount} |`).join("\n")}

`
      : ""
  }## New houses to add (${newHouses.length})

| Tier | Name | Slug | Frags | Votes | In catalogue | Match |
| --- | --- | --- | --- | --- | --- | --- |
${rows(newHouses)}

## Already in the catalogue (${haveHouses.length})

| Tier | Name | Slug | Frags | Votes | In catalogue | Match |
| --- | --- | --- | --- | --- | --- | --- |
${rows(haveHouses)}
`;

  await fs.writeFile(OUT_MD, md);

  console.log(`[match] ${resolved.length} houses after dedupe`);
  if (dupes.length) console.log(`[match] dropped ${dupes.length} duplicates: ${dupes.join(", ")}`);
  console.log(`[match] ${haveHouses.length} already in catalogue, ${newHouses.length} new`);
  console.log(`[match] ${alreadyRanked.length} already vote-ranked`);
  if (unmatched.length) {
    console.log(`\n[match] ⚠ ${unmatched.length} UNMATCHED — fix before scraping:`);
    unmatched.forEach((r) => console.log(`   [t${r.tier}] ${r.name}`));
  } else {
    console.log(`[match] ✓ every name resolved to a Fragrantica slug`);
  }
  console.log(`\n[match] wrote ${OUT_JSON}`);
  console.log(`[match] wrote ${OUT_MD}  ← read this one`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

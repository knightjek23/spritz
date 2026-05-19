// Stage 2: parse raw HTML → structured ScrapedFragrance JSON.
//
// Reads:  data/raw/**/*.html
// Writes: data/parsed/**/*.json
//
// Selectors verified against actual Fragrantica DOM (April 2026):
//   - Schema.org microdata for name/brand/image/rating
//   - <pyramid-level-new notes="top|middle|base"> for notes
//   - /accords-search/?... query params for accord weights
//
// Vue-rendered fields (longevity, sillage, season tags, similar URLs) are
// NOT in static HTML — set to null/empty for v1, deferred to v1.5 when we'll
// teach the scraper to scroll + wait for Vue render.

import fs from "node:fs/promises";
import path from "node:path";
import { load, type CheerioAPI } from "cheerio";
import type { ScrapedFragrance, ScrapedNote } from "./types";

const RAW_DIR = path.resolve("data/raw");
const PARSED_DIR = path.resolve("data/parsed");

async function* walkHtml(dir: string): AsyncGenerator<string> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkHtml(full);
    else if (entry.name.endsWith(".html")) yield full;
  }
}

// ---------- field extractors ----------

function extractCanonicalUrl($: CheerioAPI): string | null {
  return $('link[rel="canonical"]').attr("href") ?? null;
}

function extractName($: CheerioAPI, house: string | null = null): string | null {
  // Schema.org Product → itemprop="name". The h1 is multi-line and contains both
  // the fragrance name and a trailing "Brand Name \n for women/men" suffix that
  // we need to strip.
  let raw = $('[itemtype*="Product"] [itemprop="name"]').first().text();
  if (!raw) {
    // Fallback: title tag
    const title = $("title").text();
    const m = title.match(/^(.+?)\s+(perfume|cologne|fragrance|aftershave)/i);
    raw = m ? m[1] : "";
  }
  if (!raw) return null;

  // Collapse whitespace including newlines
  let name = raw.replace(/\s+/g, " ").trim();
  // Strip "for women and men" / "for women" / "for men" suffix
  name = name.replace(/\s+for\s+(women\s+and\s+men|women|men).*$/i, "");
  // Strip trailing brand name if present (h1 often has format "Fragrance Brand")
  if (house) {
    const escaped = house.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    name = name.replace(new RegExp(`\\s+${escaped}\\s*$`, "i"), "");
  }
  return name.trim() || null;
}

function extractHouse($: CheerioAPI): string | null {
  // Schema.org Brand inside Product
  const fromBrand = $('[itemprop="brand"] [itemprop="name"]').first().text().trim();
  if (fromBrand) return fromBrand;
  // Fallback: derive from canonical URL: /perfume/<House>/<Name>-<id>.html
  const canonical = extractCanonicalUrl($);
  if (canonical) {
    const m = canonical.match(/\/perfume\/([^/]+)\//);
    if (m) return m[1].replace(/-/g, " ");
  }
  return null;
}

function extractYear($: CheerioAPI): number | null {
  // Year often in title: "Khamrah Lattafa Perfumes perfume - a fragrance for women and men 2022"
  const title = $("title").text();
  const m = title.match(/\b(19|20)\d{2}\b/);
  if (m) return parseInt(m[0], 10);
  const body = $("body").text().slice(0, 5000);
  const m2 = body.match(/(?:year of release|launched in|year)[:\s]+((?:19|20)\d{2})/i);
  return m2 ? parseInt(m2[1], 10) : null;
}

function extractGender($: CheerioAPI): "masculine" | "feminine" | "unisex" | null {
  const blob = ($("title").text() + " " + $("h1").first().text()).toLowerCase();
  if (/for\s+women\s+and\s+men/.test(blob)) return "unisex";
  if (/for\s+women/.test(blob)) return "feminine";
  if (/for\s+men/.test(blob)) return "masculine";
  return null;
}

function extractFamily($: CheerioAPI): string[] {
  // Cleanest source: the /accords-search/ URL contains a sorted weighted list
  // of all main accords as URL params. Format:
  //   /accords-search/?sweet=100&warm+spicy=75&vanilla=72&...&f_from_perfume_id=12345
  const accordHref = $('a[href*="/accords-search/?"][href*="f_from_perfume_id="]')
    .first()
    .attr("href");
  if (accordHref) {
    try {
      const url = new URL(accordHref, "https://www.fragrantica.com");
      const families: string[] = [];
      url.searchParams.forEach((_value, key) => {
        // Skip Fragrantica internal filter params (anything starting with f_)
        if (key.startsWith("f_")) return;
        // Decode "+" as space
        families.push(key.replace(/\+/g, " "));
      });
      return families;
    } catch {
      /* fall through */
    }
  }
  return [];
}

/**
 * Extract notes from a single anchor element (handles both Lattafa- and Tom-Ford-style pages).
 * - Note name: `.pyramid-note-label` text → fallback to `img[alt]`
 * - Weight: `opacity:` value in inline style (Fragrantica encodes vote weight as opacity 0..1)
 */
function noteFromAnchor($el: ReturnType<CheerioAPI>): ScrapedNote | null {
  const label =
    $el.find(".pyramid-note-label").text().trim() ||
    $el.find("img").attr("alt")?.trim() ||
    "";
  if (!label) return null;
  const style = $el.attr("style") || "";
  const m = style.match(/opacity:\s*([\d.]+)/);
  const weight = m ? Math.min(1, Math.max(0, parseFloat(m[1]))) : 0.5;
  return { name: label, weight };
}

function extractAllNotes($: CheerioAPI): {
  top: ScrapedNote[];
  mid: ScrapedNote[];
  base: ScrapedNote[];
} {
  const empty = { top: [], mid: [], base: [] } as ReturnType<typeof extractAllNotes>;

  // Strategy 1: Vue custom element wrapper (older Fragrantica template)
  //   <pyramid-level-new notes="top|middle|base">
  const vueResult = { ...empty };
  const tryVue = (layer: "top" | "middle" | "base", key: keyof typeof empty) => {
    const list: ScrapedNote[] = [];
    $(`pyramid-level-new[notes="${layer}"] a.pyramid-note-link`).each((_, el) => {
      const n = noteFromAnchor($(el));
      if (n) list.push(n);
    });
    vueResult[key] = list;
  };
  tryVue("top", "top");
  tryVue("middle", "mid");
  tryVue("base", "base");
  if (vueResult.top.length || vueResult.mid.length || vueResult.base.length) {
    return vueResult;
  }

  // Strategy 2: H4-anchored pattern (newer Fragrantica template)
  //   <h4>...Top Notes...</h4> ... <div class="pyramid-level-container"> ... </div>
  // Find every .pyramid-level-container, walk back through DOM to find the
  // nearest preceding h4 to determine which layer it belongs to.
  const result = { ...empty };
  $(".pyramid-level-container").each((_, container) => {
    const $container = $(container);
    let layerKey: "top" | "mid" | "base" | null = null;
    let probe = $container.parent();
    for (let depth = 0; depth < 6 && probe.length; depth++) {
      const headingText = probe.find("h3, h4, h5").first().text().toLowerCase();
      if (/top\s*notes?/.test(headingText)) {
        layerKey = "top";
        break;
      }
      if (/(middle|heart)\s*notes?/.test(headingText)) {
        layerKey = "mid";
        break;
      }
      if (/base\s*notes?/.test(headingText)) {
        layerKey = "base";
        break;
      }
      probe = probe.parent();
    }
    if (!layerKey) return;

    $container.find("a.pyramid-note-link").each((_, anchor) => {
      const n = noteFromAnchor($(anchor));
      if (n) result[layerKey!].push(n);
    });
  });

  // Strategy 3: positional fallback — if we still have nothing, take the first
  // three .pyramid-level-container divs in document order as top / mid / base.
  if (!result.top.length && !result.mid.length && !result.base.length) {
    const containers = $(".pyramid-level-container").toArray();
    const slots: Array<keyof typeof empty> = ["top", "mid", "base"];
    containers.slice(0, 3).forEach((container, i) => {
      const slot = slots[i];
      $(container)
        .find("a.pyramid-note-link")
        .each((_, anchor) => {
          const n = noteFromAnchor($(anchor));
          if (n) result[slot].push(n);
        });
    });
  }

  return result;
}

function extractPerfumer($: CheerioAPI): string | null {
  // Credit appears as a link to /noses/<Name>.html when present.
  // Many budget brands don't credit perfumers — null is fine.
  let result: string | null = null;
  $('a[href*="/noses/"]').each((_, el) => {
    if (result) return;
    const href = $(el).attr("href") || "";
    // Skip nav links to /noses/ index page
    if (/\/noses\/?($|#|\?)/.test(href)) return;
    const name = $(el).text().trim();
    if (name && name.toLowerCase() !== "perfumers" && name.length < 60) {
      result = name;
    }
  });
  return result;
}

function extractBottleImage($: CheerioAPI): string | null {
  const itemprop = $('[itemtype*="Product"] img[itemprop="image"]').first().attr("src");
  if (itemprop) return itemprop;
  return $('meta[property="og:image"]').attr("content") ?? null;
}

// ---------- main parse ----------

function parseHtml(html: string, sourceUrlFallback: string): ScrapedFragrance | null {
  const $ = load(html);

  // Extract house first so extractName can strip the brand suffix from the h1.
  const house = extractHouse($);
  const name = extractName($, house);
  if (!name || !house) {
    return null; // both required
  }

  const canonical = extractCanonicalUrl($);
  const notes = extractAllNotes($);

  return {
    name,
    house,
    family: extractFamily($),
    gender: extractGender($),
    year: extractYear($),
    top_notes: notes.top,
    mid_notes: notes.mid,
    base_notes: notes.base,
    // Vue-rendered fields — not in static HTML. v1.5 work to capture these.
    longevity_score: null,
    longevity_confidence: null,
    sillage_score: null,
    sillage_confidence: null,
    season_tags: [],
    time_tags: [],
    similar_urls: [],
    // Encyclopedia content — Fragrantica gives us perfumer + bottle image at scrape time.
    perfumer: extractPerfumer($),
    house_history: null,           // from /editorial/ instead
    wear_guidance: {},             // from /editorial/ instead
    notes_descriptions: {},        // from /editorial/ instead
    bottle_image_url: extractBottleImage($),
    editorial_notes: null,         // from /editorial/ instead
    fragrantica_url: canonical ?? sourceUrlFallback,
    popularity_rank: null,         // assigned at upload time based on queue order
  };
}

async function main() {
  await fs.mkdir(PARSED_DIR, { recursive: true });

  // --one mode: parse the LARGEST raw HTML file and dump JSON to stdout.
  if (process.argv.includes("--one")) {
    const files: Array<{ path: string; size: number }> = [];
    for await (const f of walkHtml(RAW_DIR)) {
      const stat = await fs.stat(f);
      files.push({ path: f, size: stat.size });
    }
    if (files.length === 0) {
      console.error(`No raw HTML in ${RAW_DIR}. Run \`npm run scrape:dry\` first.`);
      process.exit(1);
    }
    files.sort((a, b) => b.size - a.size);
    const target = files[0];
    console.error(
      `[parse:one] picking largest of ${files.length} files: ` +
        `${path.basename(target.path)} (${(target.size / 1024).toFixed(0)}KB)`,
    );
    if (target.size < 50_000) {
      console.error(
        `[parse:one] ⚠ largest file is only ${(target.size / 1024).toFixed(0)}KB — ` +
          `likely all pages were Cloudflare-blocked.`,
      );
    }
    const html = await fs.readFile(target.path, "utf8");
    const sourceUrl = `https://www.fragrantica.com/perfume/${path.basename(target.path, ".html")}.html`;
    const out = parseHtml(html, sourceUrl);
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  let parsed = 0;
  let failed = 0;
  let skippedSmall = 0;
  let retries = 0;

  // Retry helper for Windows EBUSY/EPERM (OneDrive sync collisions)
  async function readWithRetry(file: string, attempts = 5): Promise<string | null> {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fs.readFile(file, "utf8");
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "EBUSY" || code === "EPERM" || code === "EACCES") {
          retries++;
          // Exponential backoff: 200ms, 400ms, 800ms, 1600ms, 3200ms
          await new Promise((r) => setTimeout(r, 200 * Math.pow(2, i)));
          continue;
        }
        throw err;
      }
    }
    return null;
  }
  async function writeWithRetry(file: string, content: string, attempts = 5): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
      try {
        await fs.writeFile(file, content, "utf8");
        return true;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "EBUSY" || code === "EPERM" || code === "EACCES") {
          retries++;
          await new Promise((r) => setTimeout(r, 200 * Math.pow(2, i)));
          continue;
        }
        throw err;
      }
    }
    return false;
  }

  for await (const file of walkHtml(RAW_DIR)) {
    const html = await readWithRetry(file);
    if (!html) {
      failed++;
      console.log(`[parser] ! could not read ${path.basename(file)} after retries`);
      continue;
    }
    if (html.length < 50_000) {
      skippedSmall++;
      continue;
    }
    const slug = path.basename(file, ".html");
    const sourceUrl = `https://www.fragrantica.com/perfume/${slug}.html`;
    const out = parseHtml(html, sourceUrl);
    if (!out) {
      failed++;
      continue;
    }
    const outFile = file
      .replace(RAW_DIR, PARSED_DIR)
      .replace(/\.html$/, ".json");
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    const wrote = await writeWithRetry(outFile, JSON.stringify(out, null, 2));
    if (!wrote) {
      failed++;
      console.log(`[parser] ! could not write ${path.basename(outFile)} after retries`);
      continue;
    }
    parsed++;
    if (parsed % 100 === 0) console.log(`[parser] ${parsed} parsed (${retries} retries so far)`);
  }

  console.log(
    `[parser] DONE parsed=${parsed} failed=${failed} skipped_too_small=${skippedSmall} retries=${retries}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export { parseHtml };
export type { ScrapedFragrance, ScrapedNote };

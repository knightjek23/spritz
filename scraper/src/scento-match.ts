// Pair rows of the Scento perfume dataset with catalog fragrances.
// Pure, no I/O. Tests: node src/scento-match.test.mjs
//
// A pair needs the same house, the same name once strength words are set
// aside, and a compatible strength. Anything ambiguous is skipped and
// reported, never guessed: a wrong pair would put one fragrance's notes on
// another's page.

// searchKey and parseConcentration are copies of the ones in notes-source.ts.
// This file stays import-free so it runs under plain `node` for its tests
// (Node needs a file extension on imports, tsc rejects one). The test file
// checks that both copies give the same answers.

function searchKey(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseConcentration(s: string): string | null {
  const k = ` ${searchKey(s)} `;
  if (k.includes(" eau de parfum ") || k.includes(" edp ")) return "edp";
  if (k.includes(" eau de toilette ") || k.includes(" edt ")) return "edt";
  if (k.includes(" extrait ")) return "extrait";
  if (k.includes(" elixir ")) return "elixir";
  if (k.includes(" eau de cologne ") || k.includes(" edc ")) return "edc";
  if (k.includes(" parfum ") || k.includes(" pure perfume ")) return "parfum";
  return null;
}

export const _internals = { searchKey, parseConcentration };

export interface CatalogRow {
  id: string;
  name: string;
  house: string;
  concentration: string | null;
  concentrations: string[] | null;
}

export interface ScentoRow {
  id: string;
  name: string;
  house: string;
  concentration: string;
  top_notes: string[];
  heart_notes: string[];
  base_notes: string[];
  url: string;
}

// The same house under the two catalogs' different names.
const HOUSE_ALIAS: Record<string, string> = {
  "christian dior": "dior",
  "rabanne": "paco rabanne",
  "maison margiela": "maison martin margiela",
  "kilian paris": "by kilian",
  "kilian": "by kilian",
  "armani": "giorgio armani",
  "ysl": "yves saint laurent",
  "mfk": "maison francis kurkdjian",
  "jpg": "jean paul gaultier",
};

export function houseKey(house: string): string {
  const k = searchKey(house)
    .replace(/(^| )(parfums|perfumes|fragrances|parfum|perfume|beauty)(?= |$)/g, " ")
    .replace(/ +/g, " ")
    .trim();
  return HOUSE_ALIAS[k] ?? k;
}

/** Name with strength words and bracketed asides removed. */
export function nameKey(name: string): string {
  return searchKey(name.replace(/\([^)]*\)/g, " "))
    .replace(/(^| )(eau de parfum|eau de toilette|eau de cologne|extrait de parfum|extrait|parfum|edp|edt)(?= |$)/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

const SCENTO_STRENGTH: Record<string, string> = {
  "eau-de-parfum": "edp",
  "eau-de-toilette": "edt",
  "eau-de-cologne": "edc",
  parfum: "parfum",
  extrait: "extrait",
  elixir: "elixir",
};

export function scentoStrength(row: ScentoRow): string | null {
  return SCENTO_STRENGTH[row.concentration] ?? null;
}

function catalogStrengths(row: CatalogRow): Set<string> {
  const fromName = parseConcentration(row.name);
  return new Set<string>([
    ...(row.concentrations ?? []),
    ...(row.concentration ? [row.concentration] : []),
    ...(fromName ? [fromName] : []),
  ]);
}

type Fit = "yes" | "no" | "unknown";

function strengthFit(s: ScentoRow, c: CatalogRow): Fit {
  // The full names are the same and the name itself states the strength.
  if (searchKey(s.name) === searchKey(c.name) && parseConcentration(c.name)) return "yes";
  const want = scentoStrength(s) ?? parseConcentration(s.name);
  const have = catalogStrengths(c);
  if (!want || have.size === 0) return "unknown";
  return have.has(want) ? "yes" : "no";
}

export interface Pair<C extends CatalogRow> {
  scento: ScentoRow;
  catalog: C;
  /** false when neither side records a strength and the name is the only evidence. */
  strengthConfirmed: boolean;
}

export interface Skip {
  scento: ScentoRow;
  reason: string;
}

export function pairRows<C extends CatalogRow>(
  scento: ScentoRow[],
  catalog: C[],
): { pairs: Pair<C>[]; skipped: Skip[] } {
  const key = (house: string, name: string) => `${houseKey(house)}|${nameKey(name)}`;
  const index = new Map<string, C[]>();
  for (const c of catalog) {
    if (!c.name || !c.house) continue;
    const k = key(c.house, c.name);
    const list = index.get(k);
    if (list) list.push(c);
    else index.set(k, [c]);
  }
  const scentoPerKey = new Map<string, number>();
  for (const s of scento) {
    const k = key(s.house, s.name);
    scentoPerKey.set(k, (scentoPerKey.get(k) ?? 0) + 1);
  }

  const proposed: Pair<C>[] = [];
  const skipped: Skip[] = [];
  for (const s of scento) {
    const k = key(s.house, s.name);
    if (!nameKey(s.name)) { skipped.push({ scento: s, reason: "name is only a strength word" }); continue; }
    const cands = index.get(k);
    if (!cands) { skipped.push({ scento: s, reason: "not in catalog" }); continue; }

    const yes = cands.filter((c) => strengthFit(s, c) === "yes");
    if (yes.length === 1) { proposed.push({ scento: s, catalog: yes[0], strengthConfirmed: true }); continue; }
    if (yes.length > 1) { skipped.push({ scento: s, reason: `ambiguous: ${yes.length} catalog rows fit` }); continue; }

    const unknown = cands.filter((c) => strengthFit(s, c) === "unknown");
    if (unknown.length === 0) { skipped.push({ scento: s, reason: "catalog has this name only at a different strength" }); continue; }
    if (cands.length === 1 && scentoPerKey.get(k) === 1) {
      proposed.push({ scento: s, catalog: unknown[0], strengthConfirmed: false });
      continue;
    }
    skipped.push({ scento: s, reason: "ambiguous: strength not recorded and several versions exist" });
  }

  // A catalog row can take notes from one Scento row only.
  const claims = new Map<string, number>();
  for (const p of proposed) claims.set(p.catalog.id, (claims.get(p.catalog.id) ?? 0) + 1);
  const pairs: Pair<C>[] = [];
  for (const p of proposed) {
    if ((claims.get(p.catalog.id) ?? 0) > 1) {
      skipped.push({ scento: p.scento, reason: "ambiguous: several Scento rows fit one catalog row" });
    } else pairs.push(p);
  }
  return { pairs, skipped };
}

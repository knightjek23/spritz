// Pure helpers for the notes verification pipeline: reading a fetched page,
// deciding whether it is an acceptable source for THIS fragrance, and
// checking that every extracted note is really written on the page.
// No I/O and no imports. Tests: node src/notes-source.test.mjs
//
// Why this exists: in the first pilot the model both found the page and
// reported its notes, and there was no way to tell a note read off the page
// from one recalled from memory. Now the model only proposes URLs and
// extracts from text the script fetched itself; everything below is a
// deterministic check on that text.

export type SourceType = "retailer" | "brand";
export type Concentration = "edt" | "edp" | "parfum" | "extrait" | "edc" | "elixir";

/** Lowercase, accents stripped, anything but a-z 0-9 turned into a single
 *  space. Used for every "does this appear on the page" comparison. */
export function searchKey(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const ENTITIES: Record<string, string> = {
  amp: "&", nbsp: " ", quot: '"', apos: "'", lt: "<", gt: ">",
  eacute: "e", egrave: "e", ecirc: "e", agrave: "a", ocirc: "o", ccedil: "c",
  rsquo: "'", lsquo: "'", ndash: "-", mdash: "-", reg: "", trade: "",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#([0-9]+);/g, (_m, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

export interface PageText {
  title: string;
  /** Visible text plus the contents of embedded JSON blocks (many shop
   *  pages keep the product description only there). */
  text: string;
}

export function htmlToText(html: string): PageText {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeEntities((titleMatch?.[1] ?? "").replace(/\s+/g, " ").trim());

  const jsonBlocks: string[] = [];
  const jsonRe = /<script[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = jsonRe.exec(html)) !== null) jsonBlocks.push(m[1]);

  const visible = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");

  const embedded = jsonBlocks
    .join(" ")
    .replace(/\\[nrt]/g, " ")
    .replace(/\\"/g, '"')
    .replace(/<[^>]+>/g, " ");

  const text = decodeEntities(`${visible} ${embedded}`).replace(/\s+/g, " ").trim();
  return { title, text: text.slice(0, 600_000) };
}

/** Bot walls and empty shells are not pages. */
export function looksBlocked(status: number, html: string): boolean {
  if (status !== 200) return true;
  if (html.length < 2_000) return true;
  return /just a moment|access denied|attention required|are you a robot|captcha|pardon our interruption|request unsuccessful/i.test(
    html.slice(0, 6_000),
  );
}

/** The parts of the page that talk about notes, for the extraction prompt. */
export function excerptAroundNotes(text: string, maxChars = 7_000): string {
  const re = /notes?(?![a-z])/gi;
  const spans: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = Math.max(0, m.index - 500);
    const end = Math.min(text.length, m.index + 900);
    const last = spans[spans.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else spans.push([start, end]);
  }
  let out = "";
  for (const [s, e] of spans) {
    if (out.length >= maxChars) break;
    out += (out ? " [...] " : "") + text.slice(s, e);
  }
  return out.slice(0, maxChars);
}

/** Keep only notes whose words are written on the page. */
export function groundNotes(names: string[], pageText: string): { kept: string[]; dropped: string[] } {
  const page = ` ${searchKey(pageText)} `;
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const name of names) {
    const key = searchKey(name);
    if (key && page.includes(` ${key} `)) kept.push(name);
    else dropped.push(name);
  }
  return { kept, dropped };
}

/** True when the page itself names top, heart and base tiers close to the
 *  word "note". Without that, any tier split would be the model's own. */
export function pageStatesTiers(pageText: string): boolean {
  const key = ` ${searchKey(pageText)} `;
  let from = 0;
  for (;;) {
    const i = key.indexOf(" note", from);
    if (i === -1) return false;
    const win = key.slice(Math.max(0, i - 400), i + 600);
    if (/ (top|head) /.test(win) && / (heart|middle|mid) /.test(win) && / (base|dry down|drydown) /.test(win)) {
      return true;
    }
    from = i + 5;
  }
}

export function parseConcentration(s: string): Concentration | null {
  const k = ` ${searchKey(s)} `;
  if (k.includes(" eau de parfum ") || k.includes(" edp ")) return "edp";
  if (k.includes(" eau de toilette ") || k.includes(" edt ")) return "edt";
  if (k.includes(" extrait ")) return "extrait";
  if (k.includes(" elixir ")) return "elixir";
  if (k.includes(" eau de cologne ") || k.includes(" edc ")) return "edc";
  if (k.includes(" parfum ") || k.includes(" pure perfume ")) return "parfum";
  return null;
}

export type VariantCheck = "ok" | "mismatch" | "unconfirmed";

/** Does the page describe the same strength as the catalog row?
 *  ok           they agree, or the page does not state a strength
 *  mismatch     the page states one the row does not have
 *  unconfirmed  the page states one and the row has none on record */
export function checkVariant(
  row: { name: string; concentration: string | null; concentrations: string[] | null },
  pageTitle: string,
  url: string,
): VariantCheck {
  const page = parseConcentration(pageTitle) ?? parseConcentration(url);
  if (!page) return "ok";
  const fromName = parseConcentration(row.name);
  const allowed = new Set<string>([
    ...(row.concentrations ?? []),
    ...(row.concentration ? [row.concentration] : []),
    ...(fromName ? [fromName] : []),
  ]);
  if (allowed.size === 0) return "unconfirmed";
  return allowed.has(page) ? "ok" : "mismatch";
}

const NAME_STOP = new Set([
  "eau", "de", "parfum", "toilette", "cologne", "extrait", "edp", "edt", "the", "for", "men",
  "women", "pour", "homme", "femme", "vintage", "and",
]);

/** The page must be about this fragrance: most of the name's words appear
 *  in the page title or URL. */
export function nameMatches(name: string, pageTitle: string, url: string): boolean {
  const hay = ` ${searchKey(`${pageTitle} ${url}`)} `;
  const tokens = searchKey(name.replace(/\([^)]*\)/g, " "))
    .split(" ")
    .filter((t) => t.length >= 3 && !NAME_STOP.has(t));
  if (tokens.length === 0) return true;
  const hits = tokens.filter((t) => hay.includes(` ${t} `) || hay.includes(t)).length;
  return hits / tokens.length >= 0.7;
}

// Retailers accepted as a source. Department stores and beauty retailers
// that sell direct from the brand, plus FragranceNet, added at Josh's
// direction (12 Nov 2026) as a retailer Spritz is an affiliate of. Other
// discounters and marketplaces are left out on purpose. Extend deliberately.
const RETAILER_HOSTS = [
  "fragrancenet.com",
  "sephora.com", "sephora.co.uk", "sephora.fr", "nordstrom.com", "ulta.com", "macys.com",
  "bloomingdales.com", "saksfifthavenue.com", "neimanmarcus.com", "bergdorfgoodman.com",
  "dillards.com", "selfridges.com", "harrods.com", "johnlewis.com", "boots.com",
  "theperfumeshop.com", "spacenk.com", "libertylondon.com", "douglas.de", "flaconi.de",
  "harveynichols.com", "fenwick.co.uk", "debenhams.com", "davidjones.com", "mecca.com",
];

const HOUSE_STOP = new Set([
  "maison", "parfums", "parfum", "perfumes", "perfume", "paris", "the", "house", "fragrances",
  "beauty", "london", "milano", "new", "york",
]);

function hostOfUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Decided by the script from the URL, never taken from the model. */
export function classifySource(url: string, house: string): SourceType | null {
  const host = hostOfUrl(url);
  if (!host) return null;
  if (RETAILER_HOSTS.some((r) => host === r || host.endsWith(`.${r}`))) return "retailer";
  const hostKey = host.replace(/[^a-z0-9]/g, "");
  const tokens = searchKey(house).split(" ").filter((t) => t.length >= 4 && !HOUSE_STOP.has(t));
  if (tokens.length > 0 && tokens.every((t) => hostKey.includes(t))) return "brand";
  // Short house names ("Dior", "Creed" are >= 4; "MFK"-style abbreviations are not).
  const joined = searchKey(house).replace(/ /g, "");
  if (joined.length >= 4 && hostKey.includes(joined)) return "brand";
  return null;
}

/** robots.txt check for the generic user agent. Unknown or unparsable
 *  rules mean allowed; an explicit Disallow that covers the path means no. */
export function robotsAllows(robotsTxt: string, path: string): boolean {
  const lines = robotsTxt.split(/[\r\n]+/).map((l) => l.replace(/#.*$/, "").trim());
  let inStar = false;
  let sawAgent = false;
  const rules: Array<{ allow: boolean; pattern: string }> = [];
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === "user-agent") {
      if (!sawAgent) inStar = false;
      sawAgent = true;
      if (value === "*") inStar = true;
      continue;
    }
    sawAgent = false;
    if (!inStar) continue;
    if (field === "disallow" && value) rules.push({ allow: false, pattern: value });
    if (field === "allow" && value) rules.push({ allow: true, pattern: value });
  }
  const matches = (pattern: string): boolean => {
    const anchored = pattern.endsWith("$");
    const body = anchored ? pattern.slice(0, -1) : pattern;
    const re = new RegExp(
      "^" + body.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : ""),
    );
    return re.test(path);
  };
  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) {
    if (!matches(r.pattern)) continue;
    const len = r.pattern.length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
  }
  return best ? best.allow : true;
}

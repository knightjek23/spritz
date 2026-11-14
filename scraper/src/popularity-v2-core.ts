// Pure helpers for popularity v2: FragranceNet Top Sellers parsing and
// matching, and the v2 scoring. Import-free on purpose so the tests run under
// plain `node` (see scento-match.ts). Tests: node src/popularity-v2.test.mjs

export const PER_PAGE = 24;
// 25 / 25 / 50 (Josh, 13 Nov 2026; was 50 / 25 / 25).
export const WEIGHTS = { position: 0.25, reviews: 0.25, ai: 0.5 } as const;
// Share of the final score taken by house popularity (0-100 research score,
// data/house-popularity.json), the same for every row (14 Nov 2026):
//   final = 0.90 x (25/25/50 blend) + 0.10 x house  = 22.5 / 22.5 / 45 / 10
// (A larger share for rows missing FragranceNet data lifted every Chanel and
// Dior flanker into the top 100; retired.)
export const HOUSE_WEIGHT = 0.1;
// Sold rows used to impute FragranceNet percentiles for one unsold row.
export const IMPUTE_NEIGHBOURS = 50;

export interface ListedProduct {
  position: number;
  sku: string;
  product_path: string | null;
  name: string | null;
  description: string | null;
  designer: string | null;
  section: string | null;
  review_count: number | null;
  rating: number | null;
  is_top_seller: boolean;
  is_trending: boolean;
  price: string | null;
}

/** One cached listing page (data/fragrancenet/bestsellers/<snapshot>/page-NNNN.json). */
export interface CachedListingPage {
  page: number;
  fetched_at: string;
  sort: string | null;
  num_of_pages: number | null;
  num_of_results: number | null;
  error: string | null;
  products: ListedProduct[];
}

export interface Match {
  fragrance_id: string;
  product: ListedProduct;
  method: "sku" | "path";
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Extract __NEXT_DATA__ JSON text from raw page HTML. */
export function nextDataFromHtml(html: string): string | null {
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  return m ? m[1] : null;
}

/** Parse one listing page's __NEXT_DATA__ into products with global positions. */
export function parseListing(json: string | null, page: number): Omit<CachedListingPage, "fetched_at" | "error"> {
  const empty = { page, sort: null, num_of_pages: null, num_of_results: null, products: [] as ListedProduct[] };
  if (!json) return empty;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;
  try {
    data = JSON.parse(json);
  } catch {
    return empty;
  }
  const pd = data?.props?.pageProps?.pageData ?? data?.props?.pageProps;
  if (!pd || !Array.isArray(pd.results)) return empty;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const active = Array.isArray(pd.sortOptions) ? pd.sortOptions.find((s: any) => s?.isActive) : null;
  const perPage = Number(pd.pagination?.numOfResultsPerPage) || PER_PAGE;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const products: ListedProduct[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pd.results.forEach((r: any, i: number) => {
    const sku = str(r?.sku) ?? (typeof r?.sku === "number" ? String(r.sku) : null);
    if (!sku) return;
    products.push({
      position: (page - 1) * perPage + i + 1,
      sku,
      product_path: normalizePath(str(r.productPath)),
      name: str(r.brand),
      description: str(r.description),
      designer: str(r.designer),
      section: str(r.section),
      review_count: num(r.rating?.count),
      rating: num(r.rating?.score),
      is_top_seller: r.isTopSeller === true,
      is_trending: r.isTrending === true,
      price: str(r.price),
    });
  });
  return {
    page,
    sort: str(active?.sortParam),
    num_of_pages: num(pd.pagination?.numOfPages),
    num_of_results: num(pd.pagination?.numOfResults),
    products,
  };
}

/** "cologne/burberry/burberry-touch/edt" from a URL or a bare path. */
export function normalizePath(p: string | null): string | null {
  if (!p) return null;
  let s = p;
  try {
    if (/^https?:/i.test(s)) s = new URL(s).pathname;
  } catch {
    return null;
  }
  s = s.split("#")[0].split("?")[0].replace(/^\/+|\/+$/g, "").toLowerCase();
  return s || null;
}

/** FragranceNet product number from a product URL: "#347460" or a trailing "/347460". */
export function skuFromUrl(url: string | null): string | null {
  if (!url) return null;
  const hash = url.match(/#(\d{4,8})$/);
  if (hash) return hash[1];
  const clean = url.split("#")[0].split("?")[0].replace(/\/+$/, "");
  const tail = clean.match(/\/(\d{4,8})$/);
  return tail ? tail[1] : null;
}

/** Unwrap a Rakuten (linksynergy) offer link to the FragranceNet URL. */
export function unwrapOfferUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (/(^|\.)linksynergy\.com$/i.test(u.hostname)) {
    const murl = u.searchParams.get("murl");
    if (!murl) return null;
    try {
      u = new URL(murl);
    } catch {
      return null;
    }
  }
  if (!/(^|\.)fragrancenet\.com$/i.test(u.hostname)) return null;
  return u.toString();
}

/**
 * Match each fragrance to its best-positioned listed product.
 * keys: per fragrance, the skus and paths its offer / cached product page give.
 */
export function matchProducts(
  keys: { fragrance_id: string; skus: string[]; paths: string[] }[],
  products: ListedProduct[],
): Match[] {
  const bySku = new Map<string, ListedProduct>();
  const byPath = new Map<string, ListedProduct>();
  for (const p of products) {
    // Keep the best position if a product somehow appears twice (reshuffle mid-crawl).
    const s = bySku.get(p.sku);
    if (!s || p.position < s.position) bySku.set(p.sku, p);
    if (p.product_path) {
      const q = byPath.get(p.product_path);
      if (!q || p.position < q.position) byPath.set(p.product_path, p);
    }
  }
  const out: Match[] = [];
  for (const k of keys) {
    let best: Match | null = null;
    for (const sku of k.skus) {
      const p = bySku.get(sku);
      if (p && (!best || p.position < best.product.position)) best = { fragrance_id: k.fragrance_id, product: p, method: "sku" };
    }
    for (const pth of k.paths) {
      const p = byPath.get(pth);
      if (p && (!best || p.position < best.product.position)) best = { fragrance_id: k.fragrance_id, product: p, method: "path" };
    }
    if (best) out.push(best);
  }
  return out;
}


// ---------------------------------------------------------------------------
// v2 scoring
// ---------------------------------------------------------------------------

export interface Row {
  id: string;
  name: string;
  house: string;
  popularity_score: number | null;
  popularity_rank: number | null;
  position: number | null;
  review_count: number | null;
  tier_a: boolean;
  /** budget | mid | designer | niche. FragranceNet position and reviews are
   *  compared within the tier, so niche is measured against niche. */
  price_tier?: string | null;
  /** House popularity, 0-100 (deep research, 14 Nov 2026). null = house not scored. */
  house_score?: number | null;
}

export interface Ranked extends Row {
  score: number;
  inputs: string;
  rank_v2: number;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Mid-rank percentile of each value within `values` (higher value -> higher pct). */
export function percentiles(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [1];
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && order[j + 1][0] === order[i][0]) j++;
    const mid = (i + j) / 2; // 0-based mid rank of the tie group
    for (let k = i; k <= j; k++) out[order[k][1]] = mid / (n - 1);
    i = j + 1;
  }
  return out;
}

// One-off and non-perfume entries the AI score over-rates (14 Nov 2026).
// Matched on the name only; tier A rows are never down-ranked.
export type VariantKind = "vintage" | "limited" | "collector" | "anniversary" | "body";
export const VARIANT_FACTOR: Record<VariantKind, number> = {
  vintage: 0.85,
  limited: 0.85,
  collector: 0.85,
  anniversary: 0.85,
  body: 0.8, // body/hair formats are a different product from the perfume
};

/** Which down-rank, if any, a fragrance name falls under. Deliberately NOT
 *  matched: "edition" alone (Allure Homme Edition Blanche, Amber Oud editions
 *  are permanent lines), a year in the name (Opium 1977, Dior Homme 2020 mark
 *  versions), and "vintage" mid-name (Vintage Radio, Royal Vintage). */
export function variantKind(name: string): VariantKind | null {
  const k = ` ${name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  if (/ (body mist|body spray|all over spray|all over body spray|hair perfume|hair mist|hair fragrance) /.test(k)) return "body";
  if (/ anniversary /.test(k)) return "anniversary";
  if (/ (collector s|collectors|collector) (edition|bottle) | collector $| baccarat grand extrait /.test(k)) return "collector";
  if (/ (limited edition|special edition|edizione speciale|swarovski) /.test(k)) return "limited";
  if (/ vintage $| vintage edition /.test(k)) return "vintage";
  return null;
}

// Smallest FragranceNet group a price tier needs to be ranked on its own;
// smaller tiers (and rows with no tier) are ranked against all FragranceNet rows.
export const MIN_TIER_GROUP = 30;

/**
 * Popularity v2 score (revised 14 Nov 2026):
 *
 * 1. Weights 25 / 25 / 50: FragranceNet Top Sellers position percentile,
 *    FragranceNet review count percentile (log), AI popularity_score
 *    percentile. A sold row with no AI score blends position and reviews only.
 * 2. Position and reviews are percentiles WITHIN the price tier (the rank
 *    script fills a missing price_tier from price per ml), because
 *    FragranceNet's discount best-seller list buries niche under budget
 *    designer. Tiers under MIN_TIER_GROUP rank against all sold rows.
 * 3. House popularity (0-100) takes HOUSE_WEIGHT of the final score.
 * 4. Rows FragranceNet doesn't sell get IMPUTED position and review
 *    percentiles: the median of the IMPUTE_NEIGHBOURS sold rows nearest them
 *    by AI percentile. They then go through the same 25/25/50 blend with their
 *    OWN AI percentile at full weight. Without this an unsold row had no
 *    FragranceNet downside and beat any sold row with a similar AI score
 *    (14 Nov dry run: ~70 Chanel/Dior rows in the top 100, Aventus #110).
 *    The 13 Nov version averaged neighbours' whole scores, AI included,
 *    which pulled every top unsold row to the same middling score.
 * Tier A sales-verified rows still lift above everything.
 */
export function rankRows(rows: Row[]): Ranked[] {
  const withFn = rows.filter((r) => r.position != null);
  const withAi = rows.filter((r) => r.popularity_score != null);

  const tierKey = (r: Row) => r.price_tier ?? "";
  const tierCount = new Map<string, number>();
  for (const r of withFn) tierCount.set(tierKey(r), (tierCount.get(tierKey(r)) ?? 0) + 1);
  // Every sold row first gets its percentile among ALL sold rows; rows in a
  // tier big enough to rank on its own are then re-ranked within the tier.
  const groups = new Map<string, Row[]>([["*all*", withFn]]);
  for (const r of withFn) {
    const k = tierKey(r);
    if (!k || (tierCount.get(k) ?? 0) < MIN_TIER_GROUP) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  const posPct = new Map<string, number>();
  const revPct = new Map<string, number>();
  for (const members of groups.values()) {
    // Lower position = better, so negate.
    percentiles(members.map((r) => -(r.position as number))).forEach((p, i) => posPct.set(members[i].id, p));
    percentiles(members.map((r) => Math.log1p(Math.max(0, r.review_count ?? 0)))).forEach((p, i) => revPct.set(members[i].id, p));
  }
  const aiPct = new Map<string, number>();
  percentiles(withAi.map((r) => r.popularity_score as number)).forEach((p, i) => aiPct.set(withAi[i].id, p));

  // Imputation curve: sold rows with an AI score, sorted by AI percentile.
  const curve = withFn
    .filter((r) => aiPct.has(r.id))
    .map((r) => ({ ai: aiPct.get(r.id)!, pos: posPct.get(r.id)!, rev: revPct.get(r.id)! }))
    .sort((a, b) => a.ai - b.ai);
  const median = (v: number[]) => {
    const s2 = [...v].sort((a, b) => a - b);
    const m = s2.length >> 1;
    return s2.length % 2 ? s2[m] : (s2[m - 1] + s2[m]) / 2;
  };
  const impute = (p: number): { pos: number; rev: number } | null => {
    if (curve.length === 0) return null;
    const k = Math.min(IMPUTE_NEIGHBOURS, curve.length);
    let lo = 0;
    let hi = curve.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (curve[mid].ai < p) lo = mid + 1;
      else hi = mid;
    }
    let a = lo;
    let b = lo; // window [a, b) of the k sold rows nearest p by AI pct
    while (b - a < k) {
      const left = a > 0 ? p - curve[a - 1].ai : Infinity;
      const right = b < curve.length ? curve[b].ai - p : Infinity;
      if (left <= right) a--;
      else b++;
    }
    const win = curve.slice(a, b);
    return { pos: median(win.map((w) => w.pos)), rev: median(win.map((w) => w.rev)) };
  };

  const scored = rows.map((r) => {
    const ai = aiPct.get(r.id);
    const house = r.house_score != null ? Math.max(0, Math.min(100, r.house_score)) / 100 : null;
    let base: number;
    let inputs: string;
    if (r.position != null) {
      const pos = posPct.get(r.id)!;
      const rev = revPct.get(r.id)!;
      if (ai != null) {
        base = WEIGHTS.position * pos + WEIGHTS.reviews * rev + WEIGHTS.ai * ai;
        inputs = "fn+reviews+ai";
      } else {
        base = (WEIGHTS.position * pos + WEIGHTS.reviews * rev) / (WEIGHTS.position + WEIGHTS.reviews);
        inputs = "fn+reviews";
      }
    } else if (ai != null) {
      const imp = impute(ai);
      if (imp) {
        base = WEIGHTS.position * imp.pos + WEIGHTS.reviews * imp.rev + WEIGHTS.ai * ai;
        inputs = "ai+fn-imputed";
      } else {
        base = ai;
        inputs = "ai";
      }
    } else {
      base = 0;
      inputs = "none";
    }
    let score = house != null ? (1 - HOUSE_WEIGHT) * base + HOUSE_WEIGHT * house : base;
    const variant = r.tier_a ? null : variantKind(r.name);
    if (variant) {
      score *= VARIANT_FACTOR[variant];
      inputs += `+variant:${variant}`;
    }
    if (house != null) inputs += "+house";
    if (r.tier_a) {
      score += 1; // above every unverified row (max unverified score is 1)
      inputs += "+tierA";
    }
    return { ...r, score: Number(score.toFixed(6)), inputs, rank_v2: 0 };
  });
  scored.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  scored.forEach((r, i) => (r.rank_v2 = i + 1));
  return scored;
}

/** House name -> match key: accents stripped, lower case, letters and digits only. */
export function houseKey(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Price tier from price per ml (USD), used when fragrances.price_tier is empty. */
export function tierFromPricePerMl(ppm: number | null | undefined): string | null {
  if (ppm == null || !Number.isFinite(ppm) || ppm <= 0) return null;
  // Raised 14 Nov 2026: at $1.50/ml, Chanel and Dior EDPs landed in "niche".
  if (ppm < 0.4) return "budget";
  if (ppm < 1.0) return "mid";
  if (ppm < 2.5) return "designer";
  return "niche";
}


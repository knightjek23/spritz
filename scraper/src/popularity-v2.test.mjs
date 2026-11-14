// Run: node src/popularity-v2.test.mjs   (Node 22+ strips TS types)
import assert from "node:assert/strict";
import { parseListing, nextDataFromHtml, skuFromUrl, normalizePath, unwrapOfferUrl, matchProducts, percentiles, rankRows, tierFromPricePerMl, houseKey, variantKind } from "./popularity-v2-core.ts";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log("  ok  " + name); };

const listing = (page, results, sort = "pop") => JSON.stringify({ props: { pageProps: { pageData: {
  sortOptions: [{ isActive: sort === "pop", sortParam: "pop" }, { isActive: sort !== "pop", sortParam: "new" }],
  pagination: { currentPageNum: page, numOfPages: 797, numOfResults: 19119, numOfResultsPerPage: 24 },
  results,
} } } });
const prod = (sku, p, count) => ({ sku, brand: "X", description: "Eau De Toilette", designer: "D", productPath: p, rating: { count, score: 4.5 }, isTopSeller: true, isTrending: false, price: "9.99" });

t("parseListing: global positions from page number", () => {
  const r = parseListing(listing(2, [prod("283046", "cologne/christian-dior/sauvage/edt", 343), prod("1", "a/b", null)]), 2);
  assert.equal(r.sort, "pop");
  assert.equal(r.num_of_pages, 797);
  assert.equal(r.products[0].position, 25);
  assert.equal(r.products[1].position, 26);
  assert.equal(r.products[0].review_count, 343);
  assert.equal(r.products[1].review_count, null);
});
t("parseListing: reports the active sort", () => {
  assert.equal(parseListing(listing(1, [prod("1", "a", 1)], "new"), 1).sort, "new");
});
t("parseListing: bad JSON -> empty", () => {
  assert.equal(parseListing("{nope", 3).products.length, 0);
  assert.equal(parseListing(null, 3).products.length, 0);
});
t("nextDataFromHtml", () => {
  assert.equal(nextDataFromHtml('<html><script id="__NEXT_DATA__" type="application/json">{"a":1}</script></html>'), '{"a":1}');
  assert.equal(nextDataFromHtml("<html></html>"), null);
});
t("skuFromUrl: fragment and legacy tail", () => {
  assert.equal(skuFromUrl("https://www.fragrancenet.com/perfume/yves-saint-laurent/cinema/eau-de-parfum#347460"), "347460");
  assert.equal(skuFromUrl("https://www.fragrancenet.com/cinema-perfume/Yves-Saint-Laurent/womens-Fragrances/wf/en_US/05291/347460"), "347460");
  assert.equal(skuFromUrl("https://www.fragrancenet.com/cologne/dior/sauvage/edt"), null);
});
t("normalizePath", () => {
  assert.equal(normalizePath("https://www.fragrancenet.com/Cologne/christian-dior/eau-sauvage/edt#115801"), "cologne/christian-dior/eau-sauvage/edt");
  assert.equal(normalizePath("cologne/burberry/burberry-touch/edt"), "cologne/burberry/burberry-touch/edt");
});
t("unwrapOfferUrl: Rakuten murl", () => {
  const raw = "https://click.linksynergy.com/deeplink?id=x&mid=1&murl=" + encodeURIComponent("https://www.fragrancenet.com/a/b/05291/347460");
  assert.equal(skuFromUrl(unwrapOfferUrl(raw)), "347460");
});
t("matchProducts: sku, path fallback, best position", () => {
  const products = [
    { position: 10, sku: "1", product_path: "x/a" },
    { position: 3, sku: "2", product_path: "x/b" },
    { position: 50, sku: "3", product_path: "x/c" },
  ];
  const m = matchProducts([
    { fragrance_id: "f1", skus: ["1"], paths: [] },
    { fragrance_id: "f2", skus: ["999"], paths: ["x/c"] },
    { fragrance_id: "f3", skus: ["1", "2"], paths: [] },
    { fragrance_id: "f4", skus: [], paths: [] },
  ], products);
  const by = Object.fromEntries(m.map((x) => [x.fragrance_id, x]));
  assert.equal(by.f1.product.position, 10);
  assert.equal(by.f1.method, "sku");
  assert.equal(by.f2.method, "path");
  assert.equal(by.f3.product.position, 3);
  assert.equal(by.f4, undefined);
});
t("percentiles: mid-rank ties, 0..1", () => {
  assert.deepEqual(percentiles([10, 20, 30]), [0, 0.5, 1]);
  assert.deepEqual(percentiles([5, 5, 9]), [0.25, 0.25, 1]);
  assert.deepEqual(percentiles([7]), [1]);
});
const row = (id, o) => ({ id, name: id, house: "H", popularity_score: null, popularity_rank: null, position: null, review_count: null, tier_a: false, ...o });
t("rankRows: 25/25/50 blend, extremes", () => {
  const r = rankRows([
    row("a", { position: 1, review_count: 1000, popularity_score: 9 }),
    row("b", { position: 100, review_count: 10, popularity_score: 5 }),
  ]);
  assert.equal(r[0].id, "a");
  assert.equal(r[0].score, 1);
  assert.equal(r[1].score, 0);
  assert.equal(r[0].inputs, "fn+reviews+ai");
});
t("rankRows: AI-only fallback and none", () => {
  const r = rankRows([row("c", { popularity_score: 8 }), row("d", {})]);
  assert.equal(r.find((x) => x.id === "c").inputs, "ai"); // no sold rows to impute from
  assert.equal(r.find((x) => x.id === "d").inputs, "none");
});
t("rankRows: tier A lifted above everything", () => {
  const r = rankRows([
    row("top", { position: 1, review_count: 999, popularity_score: 10 }),
    row("mid", { position: 2, review_count: 1, popularity_score: 1 }),
    row("verified", { position: 500, review_count: 0, popularity_score: 2, tier_a: true }),
  ]);
  assert.equal(r[0].id, "verified");
  assert.equal(r[0].inputs, "fn+reviews+ai+tierA");
  assert.deepEqual(r.map((x) => x.rank_v2), [1, 2, 3]);
});
t("rankRows: 25/25/50 weights", () => {
  // b: worst position, worst reviews, best AI -> 0.5
  const r = rankRows([
    row("a", { position: 1, review_count: 1000, popularity_score: 1 }),
    row("b", { position: 2, review_count: 1, popularity_score: 9 }),
  ]);
  assert.equal(r.find((x) => x.id === "a").score, 0.5);
  assert.equal(r.find((x) => x.id === "b").score, 0.5);
});
t("rankRows: house takes 10% when every signal is present", () => {
  const r = rankRows([
    row("a", { position: 1, review_count: 10, popularity_score: 5, house_score: 0 }),
    row("b", { position: 2, review_count: 1, popularity_score: 1, house_score: 100 }),
  ]);
  assert.equal(r.find((x) => x.id === "a").score, 0.9);
  assert.equal(r.find((x) => x.id === "b").score, 0.1);
  assert.equal(r.find((x) => x.id === "a").inputs, "fn+reviews+ai+house");
});
t("rankRows: unsold row gets imputed FN percentiles, keeps its own AI", () => {
  // Sold rows: higher AI sells better, so FN pct tracks AI pct.
  const rows = [];
  // 600 sold rows, so the 50-row neighbourhood is the top ~8%, as in real data.
  for (let i = 0; i < 600; i++) rows.push(row("s" + i, { position: 600 - i, review_count: i * 10, popularity_score: i }));
  rows.push(row("unsold", { popularity_score: 1000 })); // best AI of all, not sold
  const r = rankRows(rows);
  const u = r.find((x) => x.id === "unsold");
  const top = r.find((x) => x.id === "s599");
  assert.equal(u.inputs, "ai+fn-imputed");
  assert.ok(u.score < 1, "no free FragranceNet upside");
  assert.ok(Math.abs(u.score - top.score) < 0.15, "lands near the best comparable sold row");
});
t("rankRows: house share is the same 10% for unsold rows", () => {
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push(row("s" + i, { position: i + 1, review_count: 5, popularity_score: i }));
  rows.push(row("u0", { popularity_score: 5, house_score: 0 }), row("u1", { popularity_score: 5, house_score: 100 }));
  const r = rankRows(rows);
  const d = r.find((x) => x.id === "u1").score - r.find((x) => x.id === "u0").score;
  assert.ok(Math.abs(d - 0.1) < 1e-6);
});
t("rankRows: sold row without AI is 0.9 FN + 0.1 house", () => {
  const r = rankRows([row("x", { position: 1, review_count: 50, house_score: 0 }), row("y", { position: 2, review_count: 10, popularity_score: 3 })]);
  assert.equal(r.find((z) => z.id === "x").score, 0.9);
});
t("tierFromPricePerMl bands", () => {
  assert.equal(tierFromPricePerMl(0.3), "budget");
  assert.equal(tierFromPricePerMl(0.7), "mid");
  assert.equal(tierFromPricePerMl(1.6), "designer");
  assert.equal(tierFromPricePerMl(4), "niche");
  assert.equal(tierFromPricePerMl(null), null);
});
t("houseKey ignores accents and punctuation", () => {
  assert.equal(houseKey("Hermès"), houseKey("Hermes"));
  assert.equal(houseKey("Dolce&Gabbana"), houseKey("Dolce Gabbana"));
});
t("rankRows: position compared within price tier", () => {
  const rows = [];
  // 40 budget rows outsell every niche row at FragranceNet.
  for (let i = 0; i < 40; i++) rows.push(row("b" + i, { position: i + 1, review_count: 100, popularity_score: 1, price_tier: "budget" }));
  for (let i = 0; i < 40; i++) rows.push(row("n" + i, { position: 1000 + i, review_count: 100, popularity_score: 1, price_tier: "niche" }));
  const r = rankRows(rows);
  const n0 = r.find((x) => x.id === "n0");
  const b0 = r.find((x) => x.id === "b0");
  assert.equal(n0.score, b0.score, "best niche seller scores like best budget seller");
});
t("rankRows: small tier falls back to all FragranceNet rows", () => {
  const rows = [];
  for (let i = 0; i < 40; i++) rows.push(row("d" + i, { position: i + 1, review_count: 1, popularity_score: 1, price_tier: "designer" }));
  rows.push(row("lonely", { position: 5000, review_count: 1, popularity_score: 1, price_tier: "niche" }));
  const r = rankRows(rows);
  assert.equal(r[r.length - 1].id, "lonely");
});
t("rankRows: sold row without AI is not penalised for the missing AI", () => {
  const r = rankRows([row("x", { position: 1, review_count: 50 }), row("y", { position: 2, review_count: 10, popularity_score: 3 })]);
  assert.equal(r.find((z) => z.id === "x").score, 1);
});
t("variantKind matches one-offs and formats, not permanent lines", () => {
  assert.equal(variantKind("Chanel No 5 Eau de Toilette - Vintage"), "vintage");
  assert.equal(variantKind("Chanel N°5 (Vintage)"), "vintage");
  assert.equal(variantKind("Vintage Radio"), null);
  assert.equal(variantKind("Chanel No 5 Eau de Parfum 100th Anniversary – Ask For The Moon Limited Edition"), "anniversary");
  assert.equal(variantKind("Good Girl Glitter Collector"), "collector");
  assert.equal(variantKind("CK One Collector's Bottle"), "collector");
  assert.equal(variantKind("Chanel No 5 Parfum Baccarat Grand Extrait"), "collector");
  assert.equal(variantKind("Azzaro Chrome Limited Edition 2014"), "limited");
  assert.equal(variantKind("Bleu de Chanel All-Over Spray"), "body");
  assert.equal(variantKind("Cloud Body Mist"), "body");
  assert.equal(variantKind("Gypsy Water Hair Perfume"), "body");
  assert.equal(variantKind("Allure Homme Edition Blanche"), null);
  assert.equal(variantKind("Opium (1977)"), null);
  assert.equal(variantKind("Baccarat Rouge 540"), null);
});
t("rankRows: variant down-rank, tier A exempt", () => {
  const r = rankRows([
    row("a", { name: "X All-Over Spray", popularity_score: 9 }),
    row("b", { name: "Y All-Over Spray", popularity_score: 5, tier_a: true }),
    row("c", { name: "Z", popularity_score: 1 }),
  ]);
  assert.equal(r.find((x) => x.id === "a").score, 0.8);
  assert.equal(r.find((x) => x.id === "a").inputs, "ai+variant:body");
  assert.equal(r.find((x) => x.id === "b").score, 1.5); // 0.5 AI pct, not down-ranked, +1 tier A
});
console.log(`\n${passed} passed`);

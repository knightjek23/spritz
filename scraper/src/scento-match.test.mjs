// Run: node src/scento-match.test.mjs
import assert from "node:assert/strict";
import { houseKey, nameKey, pairRows, _internals } from "./scento-match.ts";
import { searchKey, parseConcentration } from "./notes-source.ts";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log("  ok  " + name); };
const s = (id, house, name, concentration) => ({ id, house, name, concentration, top_notes: ["a"], heart_notes: ["b"], base_notes: ["c"], url: `https://www.scento.com/perfumes/${id}` });
const c = (id, house, name, concentration = null, concentrations = null) => ({ id, house, name, concentration, concentrations });

t("houseKey: the same house under different names", () => {
  assert.equal(houseKey("Christian Dior"), houseKey("Dior"));
  assert.equal(houseKey("Rabanne"), houseKey("Paco Rabanne"));
  assert.equal(houseKey("Maison Margiela Fragrances"), houseKey("Maison Martin Margiela"));
  assert.equal(houseKey("Kilian Paris"), houseKey("By Kilian"));
  assert.equal(houseKey("Lattafa Perfumes"), houseKey("Lattafa"));
  assert.equal(houseKey("Frédéric Malle"), houseKey("Frederic Malle"));
  assert.notEqual(houseKey("Tom Ford"), houseKey("Tom Tailor"));
});
t("nameKey: strength words and brackets set aside", () => {
  assert.equal(nameKey("Sauvage Eau de Parfum"), "sauvage");
  assert.equal(nameKey("Ombré Leather (2018)"), "ombre leather");
  assert.equal(nameKey("Sauvage Elixir"), "sauvage elixir");
  assert.equal(nameKey("Acqua di Giò"), nameKey("Acqua di Gio"));
});
t("pairs the right strength when several versions exist", () => {
  const catalog = [c("1", "Dior", "Sauvage", "edt", ["edt"]), c("2", "Dior", "Sauvage Eau de Parfum", "edp", ["edp"]), c("3", "Dior", "Sauvage Parfum", "parfum", ["parfum"])];
  const { pairs, skipped } = pairRows([s("a", "Dior", "Sauvage Eau de Parfum", "eau-de-parfum"), s("b", "Dior", "Sauvage", "eau-de-toilette")], catalog);
  assert.deepEqual(pairs.map((p) => [p.scento.id, p.catalog.id, p.strengthConfirmed]), [["a", "2", true], ["b", "1", true]]);
  assert.equal(skipped.length, 0);
});
t("never pairs across strengths", () => {
  const { pairs, skipped } = pairRows([s("a", "Dior", "Sauvage", "eau-de-parfum")], [c("1", "Dior", "Sauvage", "edt", ["edt"])]);
  assert.equal(pairs.length, 0);
  assert.match(skipped[0].reason, /different strength/);
});
t("a row covering several strengths accepts any of them", () => {
  const { pairs } = pairRows([s("a", "Giorgio Armani", "Acqua di Giò", "eau-de-parfum")], [c("1", "Giorgio Armani", "Acqua di Gio", "edt", ["edt", "edp", "parfum"])]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].strengthConfirmed, true);
});
t("strength unknown: paired only when it is the sole version on both sides, and flagged", () => {
  const one = pairRows([s("a", "Creed", "Aventus", "")], [c("1", "Creed", "Aventus")]);
  assert.equal(one.pairs.length, 1);
  assert.equal(one.pairs[0].strengthConfirmed, false);
  const many = pairRows([s("a", "Dior", "Sauvage", "")], [c("1", "Dior", "Sauvage"), c("2", "Dior", "Sauvage Parfum")]);
  assert.equal(many.pairs.length, 0);
  assert.match(many.skipped[0].reason, /ambiguous/);
});
t("same full name stating its strength pairs even if the catalog field disagrees", () => {
  const { pairs } = pairRows([s("a", "Jean Paul Gaultier", "Le Male Le Parfum", "eau-de-parfum")], [c("1", "Jean Paul Gaultier", "Le Male Le Parfum", null, [])]);
  assert.equal(pairs.length, 1);
});
t("two Scento rows cannot both claim one catalog row", () => {
  const { pairs, skipped } = pairRows([s("a", "Creed", "Aventus", ""), s("b", "Creed", "Aventus (2010)", "")], [c("1", "Creed", "Aventus")]);
  assert.equal(pairs.length, 0);
  assert.equal(skipped.length, 2);
});
t("not in catalog, and different houses with the same name", () => {
  const { pairs, skipped } = pairRows([s("a", "Chanel", "Allure", "eau-de-toilette"), s("b", "Tom Ford", "Noir", "eau-de-parfum")], [c("1", "Tom Tailor", "Noir", "edp", ["edp"])]);
  assert.equal(pairs.length, 0);
  assert.deepEqual(skipped.map((x) => x.reason), ["not in catalog", "not in catalog"]);
});
t("local copies of searchKey / parseConcentration agree with notes-source", () => {
  for (const x of ["Sauvage Eau de Parfum", "Vétiver & Ylang-Ylang!", "Baccarat Rouge 540 Extrait de Parfum", "Le Male Le Parfum", "Sauvage Elixir", "Aventus", "4711 Eau de Cologne", "Bleu de Chanel EDT"]) {
    assert.equal(_internals.searchKey(x), searchKey(x), x);
    assert.equal(_internals.parseConcentration(x), parseConcentration(x), x);
  }
});
console.log(`\n${passed} tests passed`);

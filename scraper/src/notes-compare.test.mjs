// Run: node src/notes-compare.test.mjs   (Node 22.18+ strips the TS types)
import assert from "node:assert/strict";
import {
  normalizeNote,
  compareNotes,
  buildReplacement,
  isBlockedSource,
  hostOf,
  noteOverlap,
} from "./notes-compare.ts";

const n = (names) => names.map((name) => ({ name, weight: 0.7 }));
const stored = {
  top: n(["Calabrian bergamot", "Pepper"]),
  mid: n(["Lavender", "Sichuan Pepper", "Geranium"]),
  base: n(["Ambroxan", "Cedar", "Labdanum"]),
};
const empty = { top: [], mid: [], base: [], flat: [] };
let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log("  ok  " + name); };

t("normalize: case, accents, origin and form words", () => {
  assert.equal(normalizeNote("Calabrian Bergamot"), "bergamot");
  assert.equal(normalizeNote("Bergamot oil"), "bergamot");
  assert.equal(normalizeNote("Vétiver"), "vetiver");
  assert.equal(normalizeNote("Rose Absolute"), "rose");
  assert.equal(normalizeNote("Ambrofix™"), "ambrofix");
});
t("normalize: aliases", () => {
  assert.equal(normalizeNote("Tonka"), "tonka bean");
  assert.equal(normalizeNote("Cedarwood"), "cedar");
  assert.equal(normalizeNote("Ambrox"), "ambroxan");
});
t("normalize: 'woody notes' is not collapsed to 'woody'", () => {
  assert.equal(normalizeNote("Woody Notes"), "woody notes");
  assert.equal(normalizeNote("Woods"), "woody notes");
});
t("normalize: different notes stay different", () => {
  assert.notEqual(normalizeNote("Pepper"), normalizeNote("Pink Pepper"));
  assert.notEqual(normalizeNote("Iris"), normalizeNote("Orris"));
});
t("match: same notes, same tiers", () => {
  const r = compareNotes(stored, { ...empty,
    top: ["Bergamot", "pepper"], mid: ["lavender", "geranium", "Sichuan pepper"],
    base: ["Cedarwood", "Ambroxan", "labdanum"] });
  assert.equal(r.outcome, "match");
  assert.equal(r.tiersVerified, true);
  assert.deepEqual(r.added, []); assert.deepEqual(r.removed, []);
});
t("match on a flat list keeps stored tiers, tiers not verified", () => {
  const r = compareNotes(stored, { ...empty, flat: [
    "bergamot", "pepper", "lavender", "sichuan pepper", "geranium", "ambroxan", "cedar", "labdanum"] });
  assert.equal(r.outcome, "match");
  assert.equal(r.tiersVerified, false);
});
t("same notes, different tiers: source tiers adopted", () => {
  const r = compareNotes(stored, { ...empty,
    top: ["bergamot", "pepper", "lavender"], mid: ["sichuan pepper", "geranium"],
    base: ["ambroxan", "cedar", "labdanum"] });
  assert.equal(r.outcome, "replaced");
  assert.equal(r.tiersVerified, true);
});
t("different notes with tiers: replaced, diff reported", () => {
  const r = compareNotes(stored, { ...empty,
    top: ["bergamot"], mid: ["lavender", "geranium", "elemi"], base: ["ambroxan", "cedar", "vetiver"] });
  assert.equal(r.outcome, "replaced");
  assert.deepEqual(r.added, ["elemi", "vetiver"]);
  assert.deepEqual(r.removed, ["labdanum", "pepper", "sichuan pepper"]);
});
t("different notes on a flat list: needs review, never auto-written", () => {
  const r = compareNotes(stored, { ...empty, flat: ["bergamot", "lavender", "vetiver", "cedar"] });
  assert.equal(r.outcome, "needs_review");
});
t("replacement that would cut more than half the notes: needs review", () => {
  const r = compareNotes(stored, { ...empty, top: ["bergamot"], mid: ["lavender"], base: ["cedar"] });
  assert.equal(r.outcome, "needs_review");
});
t("thin source (under 3 notes): needs review", () => {
  const small = { top: n(["Rose"]), mid: n(["Oud"]), base: n(["Musk"]) };
  const r = compareNotes(small, { ...empty, top: ["rose"], base: ["saffron"] });
  assert.equal(r.outcome, "needs_review");
});
t("source with no notes: not found", () => {
  assert.equal(compareNotes(stored, empty).outcome, "not_found");
});
t("stored row with no notes + tiered source: replaced", () => {
  const r = compareNotes({ top: [], mid: [], base: [] },
    { ...empty, top: ["bergamot"], mid: ["rose"], base: ["musk"] });
  assert.equal(r.outcome, "replaced");
});
t("buildReplacement: source wording and order, flat weight, de-duplicated", () => {
  const rep = buildReplacement({ ...empty, top: ["  Bergamot ", "bergamot oil", "Pink  Pepper"], mid: ["Rose"], base: [] });
  assert.deepEqual(rep.top, [{ name: "Bergamot", weight: 1 }, { name: "Pink Pepper", weight: 1 }]);
  assert.deepEqual(rep.mid, [{ name: "Rose", weight: 1 }]);
  assert.deepEqual(rep.base, []);
});
t("blocked sources", () => {
  assert.equal(isBlockedSource("https://www.fragrantica.com/perfume/Dior/Sauvage-31861.html"), true);
  assert.equal(isBlockedSource("https://www.parfumo.com/Perfumes/Dior/Sauvage"), true);
  assert.equal(isBlockedSource("https://basenotes.com/fragrances/x"), true);
  assert.equal(isBlockedSource("not a url"), true);
  assert.equal(isBlockedSource("https://www.dior.com/en_us/beauty/products/sauvage.html"), false);
  assert.equal(isBlockedSource("https://www.sephora.com/product/x"), false);
  assert.equal(hostOf("https://www.dior.com/x"), "dior.com");
});
t("noteOverlap: spelling variants count as the same note", () => {
  const st = { top: n(["Hiacynth", "Bay Leaf"]), mid: n(["Rose"]), base: n(["White Musk", "Calone"]) };
  assert.equal(noteOverlap(st, { ...empty, top: ["Hyacinth", "Bay"], mid: ["Rose"], base: ["White Musk", "Calone"] }), 1);
  assert.equal(noteOverlap(st, { ...empty, top: ["Hyacinth", "Bay"], mid: ["Rose"], base: ["Musk"] }), 3 / 6);
  assert.equal(noteOverlap({ top: [], mid: [], base: [] }, { ...empty, top: ["Rose"] }), 0);
});
console.log(`\n${passed} tests passed`);

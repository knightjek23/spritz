// Run: node scripts/test-notes-source-label.mjs
import assert from "node:assert/strict";
import { notesSourceLabel } from "../lib/notes-source-label.ts";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log("  ok  " + name); };

t("unverified rows get no source line", () => {
  assert.equal(notesSourceLabel("unverified", null), null);
  assert.equal(notesSourceLabel("unverified", "https://www.scento.com/perfumes/x"), null);
  assert.equal(notesSourceLabel("not_found", "https://www.dior.com/x"), null);
  assert.equal(notesSourceLabel("needs_review", "https://www.dior.com/x"), null);
  assert.equal(notesSourceLabel(undefined, undefined), null);
});
t("verified but no URL on record: no line", () => {
  assert.equal(notesSourceLabel("replaced", null), null);
  assert.equal(notesSourceLabel("match", ""), null);
});
t("Scento rows credit the database page and show the licence", () => {
  const l = notesSourceLabel("replaced", "https://www.scento.com/perfumes/layton-parfums-de-marly");
  assert.deepEqual(l, {
    name: "the Scento perfume database",
    href: "https://www.scento.com/perfume-database",
    licence: { name: "CC BY 4.0", href: "https://creativecommons.org/licenses/by/4.0/" },
  });
});
t("brand or retailer rows show the host and link the page", () => {
  const l = notesSourceLabel("match", "https://www.creedboutique.com/products/aventus");
  assert.deepEqual(l, { name: "creedboutique.com", href: "https://www.creedboutique.com/products/aventus", licence: null });
});
t("a look-alike host is not treated as Scento", () => {
  assert.equal(notesSourceLabel("replaced", "https://notscento.com/x").licence, null);
  assert.equal(notesSourceLabel("replaced", "https://scento.com.evil.example/x").licence, null);
});
t("bad or non-web URLs produce no line", () => {
  assert.equal(notesSourceLabel("match", "not a url"), null);
  assert.equal(notesSourceLabel("match", "javascript:alert(1)"), null);
});
console.log(`\n${passed} tests passed`);

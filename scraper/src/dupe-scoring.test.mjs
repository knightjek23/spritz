// Run: node src/dupe-scoring.test.mjs
import assert from "node:assert/strict";
import { parseVector, prepare, score, topMatches, VECTOR_DIM } from "./dupe-scoring.ts";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log("  ok  " + name); };

// Deterministic pseudo-random numbers so the test is repeatable.
let seed = 42;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const FAMS = ["woody", "citrus", "sweet", "floral", "amber", "fresh", "spicy", "musky"];
const SEAS = ["spring", "summer", "fall", "winter"];
const pick = (list, n) => [...new Set(Array.from({ length: n }, () => list[Math.floor(rnd() * list.length)]))];
function unitVector() {
  const v = new Array(VECTOR_DIM).fill(0);
  for (let k = 0; k < 6 + Math.floor(rnd() * 8); k++) v[Math.floor(rnd() * 60)] += 0.2 + rnd();
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / mag);
}
const rows = Array.from({ length: 240 }, (_, i) => {
  const v = unitVector();
  return {
    id: `id-${i}`,
    // Half as pgvector text (what the database returns), half as arrays.
    note_vector: i % 2 === 0 ? `[${v.join(",")}]` : v,
    family: pick(FAMS, 1 + Math.floor(rnd() * 3)),
    season_tags: i % 5 === 0 ? [] : pick(SEAS, 1 + Math.floor(rnd() * 2)),
    _v: v,
  };
});

// The original algorithm, written out plainly, as the reference.
const cosine = (a, b) => { let d = 0, ma = 0, mb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; ma += a[i] * a[i]; mb += b[i] * b[i]; } return ma === 0 || mb === 0 ? 0 : d / (Math.sqrt(ma) * Math.sqrt(mb)); };
const jaccard = (a, b) => { const A = new Set(a), B = new Set(b); let n = 0; for (const v of A) if (B.has(v)) n++; const u = A.size + B.size - n; return u === 0 ? 0 : n / u; };
const refScore = (a, b) => 0.7 * cosine(a._v, b._v) + 0.2 * jaccard(a.family, b.family) + 0.1 * jaccard(a.season_tags, b.season_tags);

t("parseVector reads pgvector text and arrays alike", () => {
  const v = unitVector();
  assert.deepEqual(parseVector(`[${v.join(",")}]`), v);
  assert.deepEqual(parseVector(v), v);
});
t("parseVector rejects missing, short, non-numeric and all-zero vectors", () => {
  assert.equal(parseVector(null), null);
  assert.equal(parseVector(""), null);
  assert.equal(parseVector("[1,2,3]"), null);
  assert.equal(parseVector(new Array(VECTOR_DIM).fill(0)), null);
  const bad = new Array(VECTOR_DIM).fill(0.1); bad[7] = "x";
  assert.equal(parseVector(`[${bad.join(",")}]`), null);
});
t("prepare keeps every row that has a vector (text or array), drops the rest", () => {
  const p = prepare([...rows, { id: "none", note_vector: null, family: [], season_tags: [] }]);
  assert.equal(p.length, rows.length);
});
t("score matches the original formula on every pair", () => {
  const p = prepare(rows);
  let worst = 0;
  for (let i = 0; i < 60; i++) for (let j = 0; j < rows.length; j++) {
    if (i === j) continue;
    worst = Math.max(worst, Math.abs(score(p[i], p[j]) - refScore(rows[i], rows[j])));
  }
  assert.ok(worst < 1e-9, `largest difference ${worst}`);
});
t("topMatches returns the same top 50 as a full sort", () => {
  const p = prepare(rows);
  for (const i of [0, 1, 17, 118, 239]) {
    const got = topMatches(p, i, 50);
    const ref = rows.map((b, j) => ({ id: b.id, s: j === i ? -1 : refScore(rows[i], b) })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s).slice(0, 50);
    assert.equal(got.length, ref.length);
    for (let k = 0; k < ref.length; k++) assert.ok(Math.abs(got[k].score - ref[k].s) < 1e-9, `row ${i} rank ${k}`);
    for (let k = 1; k < got.length; k++) assert.ok(got[k - 1].score >= got[k].score);
    assert.ok(!got.some((x) => x.b.row.id === rows[i].id), "a row is never its own match");
  }
});
t("fewer rows than topN: returns what exists, sorted", () => {
  const p = prepare(rows.slice(0, 5));
  const got = topMatches(p, 0, 50);
  assert.ok(got.length <= 4);
  for (let k = 1; k < got.length; k++) assert.ok(got[k - 1].score >= got[k].score);
});
console.log(`\n${passed} tests passed`);

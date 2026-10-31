// Unit tests for the discovery lists (Seasonal Suggestions, Top Scents for
// Men/Women): `npm run test:discovery`. Pure functions only, no Supabase,
// no network. Spec: docs/superpowers/specs/2026-10-31-seasonal-and-top-scents-design.md

import assert from "node:assert/strict";

let pass = 0;
function ok(name: string) {
  pass++;
  console.log(`  ok  ${name}`);
}

async function main() {
  const { seasonFor, windowIndex } = await import("../lib/discovery/season");
  const { rotate } = await import("../lib/discovery/rotation");
  const { combineScores, WEIGHTS } = await import("../lib/discovery/score");
  const { researchMentions } = await import("../lib/discovery/research");
  const { inferSeasons, seasonsOf } = await import("../lib/discovery/infer-season");

  // ---- Season (Pacific time, meteorological, Northern Hemisphere) ----
  {
    const at = (iso: string) => seasonFor(new Date(iso));
    assert.equal(at("2026-11-30T20:00:00Z"), "fall");
    assert.equal(at("2026-12-01T20:00:00Z"), "winter");
    assert.equal(at("2027-02-28T20:00:00Z"), "winter");
    assert.equal(at("2027-03-01T20:00:00Z"), "spring");
    assert.equal(at("2027-06-01T20:00:00Z"), "summer");
    assert.equal(at("2027-09-01T20:00:00Z"), "fall");
    // 07:30 UTC on Dec 1 is still 23:30 on Nov 30 in Pacific time.
    assert.equal(at("2026-12-01T07:30:00Z"), "fall");
    ok("seasonFor: boundaries in Pacific time");
  }

  // ---- Window index: 3 Pacific days per window ----
  {
    const w = (iso: string) => windowIndex(new Date(iso));
    const d0 = w("2026-11-01T20:00:00Z");
    assert.equal(w("2026-11-02T20:00:00Z"), d0);
    assert.equal(w("2026-11-03T20:00:00Z"), d0);
    assert.equal(w("2026-11-04T20:00:00Z"), d0 + 1);
    // Across UTC midnight inside one Pacific day: same window.
    assert.equal(w("2026-11-03T06:59:00Z"), w("2026-11-02T08:00:00Z"));
    ok("windowIndex: 3-day windows on Pacific days");
  }

  // ---- Rotation ----
  type Item = { id: string; score: number; unisex: boolean };
  const pool: Item[] = Array.from({ length: 30 }, (_, i) => ({
    id: `f${String(i).padStart(2, "0")}`,
    score: 1 - i / 40,
    unisex: i % 4 === 1, // f01, f05, f09 ... 8 unisex
  }));
  const anchors = new Set(["f00", "f01", "f02"]);

  {
    assert.deepEqual(rotate(pool, "men", 5), rotate(pool, "men", 5));
    assert.notDeepEqual(rotate(pool, "men", 5), rotate(pool, "men", 6));
    assert.equal(rotate(pool, "men", 5).length, 10);
    ok("rotate: deterministic per window, changes next window");
  }

  {
    const N = 30;
    const windows = Array.from({ length: N }, (_, k) => rotate(pool, "women", k));
    for (let k = 1; k < N; k++) {
      for (const id of windows[k]) {
        if (anchors.has(id)) continue;
        assert.ok(!windows[k - 1].includes(id), `${id} repeated at window ${k} after ${k - 1}`);
        if (k >= 2) assert.ok(!windows[k - 2].includes(id), `${id} repeated at window ${k} after ${k - 2}`);
      }
    }
    for (const a of anchors) {
      const n = windows.filter((w) => w.includes(a)).length;
      assert.ok(n >= 15 && n <= 20, `anchor ${a} appeared ${n}/30`);
    }
    const seen = new Set(windows.flat());
    for (const p of pool) assert.ok(seen.has(p.id), `${p.id} never shown in 30 windows`);
    for (let k = 1; k < N; k++) {
      const shared = windows[k].filter((id) => windows[k - 1].includes(id)).length;
      assert.ok(shared <= 4, `windows ${k - 1}/${k} share ${shared}`);
    }
    ok("rotate: cooldowns, anchor frequency 50-67%, full pool coverage, <=4 shared");
  }

  {
    const isUnisex = new Map(pool.map((p) => [p.id, p.unisex]));
    for (let k = 0; k < 30; k++) {
      const picks = rotate(pool, "men", k, { maxUnisex: 3 });
      const u = picks.filter((id) => isUnisex.get(id)).length;
      assert.ok(u <= 3, `window ${k} has ${u} unisex`);
      assert.equal(picks.length, 10);
    }
    ok("rotate: unisex cap of 3 holds");
  }

  {
    assert.equal(rotate(pool.slice(0, 7), "men", 3).length, 7);
    assert.deepEqual(rotate([], "men", 3), []);
    ok("rotate: small and empty pools");
  }

  {
    const picks = rotate(pool, "men", 9);
    const scores = picks.map((id) => pool.find((p) => p.id === id)!.score);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
    ok("rotate: picks ordered by score");
  }

  // ---- Scoring ----
  {
    const sum = WEIGHTS.research + WEIGHTS.popularity + WEIGHTS.trends + WEIGHTS.inApp;
    assert.ok(Math.abs(sum - 1) < 1e-9);
    const ids = ["a", "b", "c"];
    const s = combineScores(ids, {
      research: new Map([["a", 4], ["b", 2]]),
      popularityRank: new Map([["a", 10], ["c", 1]]),
      trends: new Map(),
      inApp: new Map([["b", 5]]),
    });
    assert.ok((s.get("c") ?? 0) > 0, "popularity-only fragrance kept");
    assert.equal(s.size, 3);
    // a: full research (0.45) + popularity rank 10 of max 10 -> 1-(9/10)=0.1*0.30
    assert.ok(Math.abs(s.get("a")! - (0.45 + 0.03)) < 1e-9, `a=${s.get("a")}`);
    // b: half research + full in-app
    assert.ok(Math.abs(s.get("b")! - (0.225 + 0.15)) < 1e-9, `b=${s.get("b")}`);
    // c: rank 1 -> full popularity
    assert.ok(Math.abs(s.get("c")! - 0.3) < 1e-9, `c=${s.get("c")}`);
    ok("combineScores: weights, normalization, missing signals score 0");
  }

  // ---- Research mentions ----
  {
    const now = new Date("2026-11-01T12:00:00Z");
    const file = {
      generated_at: "2026-11-01",
      entries: [
        {
          name: "A", house: "H", fragrance_id: "a", lists: ["men", "seasonal-fall"],
          citations: [
            { source: "sephora", url: "u1", date: "2026-10-20" },
            { source: "sephora", url: "u2", date: "2026-10-25" },
            { source: "reddit", url: "u3", date: "2026-06-01" },
          ],
        },
        { name: "B", house: "H", fragrance_id: null, lists: ["men"], citations: [{ source: "ulta", url: "u4", date: "2026-10-01" }] },
        { name: "C", house: "H", fragrance_id: "c", lists: ["women"], citations: [{ source: "ulta", url: "u5", date: "2026-10-01" }] },
      ],
    };
    const men = researchMentions(file, "men", now);
    // sephora counts once (1), reddit is >90 days old (0.5)
    assert.equal(men.get("a"), 1.5);
    assert.ok(!men.has("c"));
    assert.equal(men.size, 1, "unmatched entry ignored");
    const fallMen = researchMentions(file, "seasonal-men-fall", now);
    assert.equal(fallMen.get("a"), 1.5, "seasonal list matches seasonal-<season> for either gender");
    assert.equal(researchMentions(file, "seasonal-men-winter", now).size, 0);
    ok("researchMentions: one per source, 90-day half decay, unmatched skipped, season-specific");
  }

  // ---- Season inference (season_tags is empty catalog-wide) ----
  // Accord lists are the real top-4 from the 2026-10-31 audit.
  {
    const has = (a: string[], want: string[]) => want.every((w) => inferSeasons(a).includes(w as never));
    const lacks = (a: string[], no: string[]) => no.every((w) => !inferSeasons(a).includes(w as never));
    // At most two seasons, ever: seasonal lists must actually be seasonal.
    for (const a of [
      ["citrus", "amber", "woody", "fresh spicy"],
      ["aromatic", "vanilla", "fresh spicy", "lavender"],
      ["citrus", "woody", "patchouli", "sweet"],
    ]) assert.ok(inferSeasons(a).length <= 2, `${a} -> ${inferSeasons(a)}`);
    // Le Male: a cold-weather staple despite the aromatic/fresh accords.
    assert.ok(has(["aromatic", "vanilla", "fresh spicy", "lavender"], ["fall", "winter"]), "Le Male");
    // Acqua di Gio, Sauvage EDP: warm weather.
    assert.ok(has(["citrus", "aromatic", "marine", "fresh spicy"], ["summer"]), "Acqua di Gio");
    assert.ok(lacks(["citrus", "aromatic", "marine", "fresh spicy"], ["fall", "winter"]), "Acqua di Gio not cold");
    assert.ok(has(["fresh spicy", "citrus", "amber", "lavender"], ["summer"]), "Sauvage EDP");
    // Baccarat Rouge, Tobacco Vanille, Ombre Leather, Angel: cold weather only.
    for (const a of [
      ["woody", "amber", "warm spicy", "metallic"],
      ["vanilla", "sweet", "tobacco", "warm spicy"],
      ["leather", "animalic", "warm spicy", "white floral"],
      ["sweet", "patchouli", "fruity", "warm spicy"],
    ]) {
      assert.ok(lacks(a, ["spring", "summer"]), `${a} -> ${inferSeasons(a)}`);
      assert.ok(inferSeasons(a).length > 0);
    }
    // Chanel No 5 Parfum: spring-led.
    assert.equal(inferSeasons(["powdery", "woody", "aldehydic", "iris"])[0], "spring");
    // Accords the first audit flagged as unknown now vote.
    for (const a of ["soft spicy", "lactonic", "nutty", "tuberose", "cacao", "cherry"]) {
      assert.ok(inferSeasons([a]).length > 0, `${a} unknown`);
    }
    assert.deepEqual(inferSeasons([]), []);
    assert.deepEqual(inferSeasons(null), []);
    assert.deepEqual(inferSeasons(["mystery accord"]), [], "never guesses");
    assert.deepEqual(seasonsOf({ season_tags: ["winter"], family: ["citrus"] }), ["winter"], "stored tags win");
    ok("inferSeasons: <=2 seasons, real-catalog cases, never guesses, stored tags win");
  }

  console.log(`\n${pass} checks passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

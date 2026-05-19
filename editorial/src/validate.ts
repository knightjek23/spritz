// Pre-flight check: parses every editorial .md file, validates schema, prints
// errors + coverage stats. Run this before `ingest` to catch typos / missing fields.

import { loadNotes, loadHouses, loadFragrances } from "./load.js";

async function main() {
  const notes = await loadNotes();
  const houses = await loadHouses();
  const fragrances = await loadFragrances();

  console.log(`\n--- Spritz Editorial — validation ---\n`);
  console.log(`Notes:      ${notes.items.length} valid, ${notes.errors.length} errors`);
  console.log(`Houses:     ${houses.items.length} valid, ${houses.errors.length} errors`);
  console.log(`Fragrances: ${fragrances.items.length} valid, ${fragrances.errors.length} errors\n`);

  const allErrors = [...notes.errors, ...houses.errors, ...fragrances.errors];
  if (allErrors.length > 0) {
    console.log(`Errors:`);
    for (const e of allErrors) console.log(`  - ${e}`);
    console.log();
  }

  // Cross-check: every fragrance.house should have a matching house entry.
  const houseNames = new Set(houses.items.map((h) => h.frontmatter.name.toLowerCase()));
  const orphans = fragrances.items.filter(
    (f) => !houseNames.has(f.frontmatter.house.toLowerCase()),
  );
  if (orphans.length > 0) {
    console.log(`Fragrances missing a house entry:`);
    for (const f of orphans) {
      console.log(`  - ${f.frontmatter.name} (house: ${f.frontmatter.house})`);
    }
    console.log();
  }

  // Body-length warnings (per the Spritz voice rules).
  const tooLong: string[] = [];
  const tooShort: string[] = [];
  for (const n of notes.items) {
    const w = n.body.split(/\s+/).length;
    if (w > 60) tooLong.push(`note "${n.frontmatter.name}" (${w} words — voice says ~30)`);
    if (w < 10) tooShort.push(`note "${n.frontmatter.name}" (${w} words)`);
  }
  for (const h of houses.items) {
    const w = h.body.split(/\s+/).length;
    if (w > 150) tooLong.push(`house "${h.frontmatter.name}" (${w} words — voice says ~100)`);
    if (w < 50) tooShort.push(`house "${h.frontmatter.name}" (${w} words)`);
  }
  for (const f of fragrances.items) {
    const w = f.body.split(/\s+/).length;
    if (w > 150) tooLong.push(`fragrance "${f.frontmatter.name}" (${w} words — voice says 60–120)`);
    if (w < 40) tooShort.push(`fragrance "${f.frontmatter.name}" (${w} words)`);
  }
  if (tooLong.length > 0) {
    console.log(`Verbose entries (consider tightening):`);
    for (const t of tooLong) console.log(`  - ${t}`);
    console.log();
  }
  if (tooShort.length > 0) {
    console.log(`Thin entries (consider expanding):`);
    for (const t of tooShort) console.log(`  - ${t}`);
    console.log();
  }

  // Cliché check
  const banned = /\b(exquisite|luxurious|captivating|enchanting|sophisticated|elegant|mysterious|intoxicating|sensual|alluring|timeless|symphony|masterpiece|evocative|journey)\b/gi;
  const allBodies: Array<{ kind: string; name: string; body: string }> = [
    ...notes.items.map((n) => ({ kind: "note", name: n.frontmatter.name, body: n.body })),
    ...houses.items.map((h) => ({ kind: "house", name: h.frontmatter.name, body: h.body })),
    ...fragrances.items.map((f) => ({ kind: "fragrance", name: f.frontmatter.name, body: f.body })),
  ];
  const flagged = allBodies
    .map((x) => ({ ...x, hits: x.body.match(banned) }))
    .filter((x) => x.hits && x.hits.length > 0);
  if (flagged.length > 0) {
    console.log(`Cliché words found (Spritz voice forbids these):`);
    for (const f of flagged) console.log(`  - ${f.kind} "${f.name}": ${f.hits!.join(", ")}`);
    console.log();
  }

  if (allErrors.length > 0) {
    process.exit(1);
  }
  console.log(`✓ Validation passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Stage 3: build canonical note dictionary + vectorize each fragrance.
//
// Canonical note dictionary = top-N most common normalized note names across
// the parsed corpus, capped at 500 (matches vector(500) in schema).
// Variants like "Bergamot", "bergamot oil", "Italian bergamot" merge under
// `normalizeNoteName()` — keep that function evolvable.

import fs from "node:fs/promises";
import path from "node:path";
import type { ScrapedFragrance } from "./types";

const PARSED_DIR = path.resolve("data/parsed");
const DICT_FILE = path.join(PARSED_DIR, "note_dictionary.json");
const VECTOR_DIM = 500;

export function normalizeNoteName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+oil$/, "")
    .replace(/^(italian|moroccan|sicilian|french|indian)\s+/, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

async function* walkJson(dir: string): AsyncGenerator<string> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name === "note_dictionary.json") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkJson(full);
    else if (entry.name.endsWith(".json")) yield full;
  }
}

async function buildDictionary(): Promise<Record<string, number>> {
  const counts = new Map<string, number>();
  for await (const file of walkJson(PARSED_DIR)) {
    const f: ScrapedFragrance = JSON.parse(await fs.readFile(file, "utf8"));
    for (const n of [...f.top_notes, ...f.mid_notes, ...f.base_notes]) {
      const k = normalizeNoteName(n.name);
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, VECTOR_DIM)
    .map(([name], i) => [name, i] as const);
  const dict = Object.fromEntries(top);
  await fs.writeFile(DICT_FILE, JSON.stringify(dict, null, 2), "utf8");
  console.log(`[vectorize] dictionary: ${Object.keys(dict).length} canonical notes`);
  return dict;
}

function buildVector(
  f: ScrapedFragrance,
  dict: Record<string, number>,
): number[] {
  const vec = new Array(VECTOR_DIM).fill(0);
  const apply = (notes: typeof f.top_notes, layer: number) => {
    for (const n of notes) {
      const idx = dict[normalizeNoteName(n.name)];
      if (idx === undefined) continue;
      vec[idx] += n.weight * layer;
    }
  };
  apply(f.top_notes, 0.4);
  apply(f.mid_notes, 0.4);
  apply(f.base_notes, 0.2);
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return mag === 0 ? vec : vec.map((v) => v / mag);
}

async function main() {
  const dict = await buildDictionary();
  let updated = 0;
  for await (const file of walkJson(PARSED_DIR)) {
    const f: ScrapedFragrance & { note_vector?: number[] } = JSON.parse(
      await fs.readFile(file, "utf8"),
    );
    f.note_vector = buildVector(f, dict);
    await fs.writeFile(file, JSON.stringify(f, null, 2), "utf8");
    updated++;
  }
  console.log(`[vectorize] updated ${updated} fragrance files`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

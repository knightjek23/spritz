// Append every unscraped fragrance with at least MIN_VOTES community votes
// (from the cached per-house lists in data/house-fragrances/) to queue.json.
//
//   npx tsx src/queue-popular.ts            # writes the queue
//   DRY=1 npx tsx src/queue-popular.ts      # preview only
//   MIN_VOTES=100 npx tsx src/queue-popular.ts
//
// Why a vote floor instead of NEW_PER_HOUSE: after the Aug 2026 batch, the
// "next 10 per house" slice had a median of 27 votes and big houses (Chanel,
// Creed, PdM) had nothing left. A floor keeps only fragrances people know.
//
// Houses whose slug contains a 4-digit number (Fueguia-1833, Nobile-1942,
// Room-1015) are skipped: discover-houses' card regex takes the LAST
// "4 digits + number" pair, which for these houses is (house digits, release
// year) whenever a card shows no vote count, so their "votes" are years.
// Fix that regex and re-rank before including them.
//
// Previously failed URLs need nothing here: they stay in queue.json and are
// not in state.completed, so `npm run scrape` retries them automatically.
// Run from scraper/.

import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve("data");
const LISTS_DIR = path.join(DATA_DIR, "house-fragrances");
const QUEUE_FILE = path.join(DATA_DIR, "queue.json");
const STATE_FILE = path.join(DATA_DIR, "scrape-state.json");
const MIN_VOTES = Number(process.env.MIN_VOTES ?? 50);
const DRY = process.env.DRY === "1";

type Card = { url: string; year: number | null; votes: number };

async function main() {
  const queue: string[] = JSON.parse(await fs.readFile(QUEUE_FILE, "utf8"));
  const state: { completed: string[]; failed: { url: string }[] } = JSON.parse(
    await fs.readFile(STATE_FILE, "utf8"),
  );
  const seen = new Set<string>([
    ...queue,
    ...state.completed,
    ...state.failed.map((f) => f.url),
  ]);

  const files = (await fs.readdir(LISTS_DIR)).filter((f) => f.endsWith(".json"));
  const picked: (Card & { house: string })[] = [];
  const skippedHouses: string[] = [];
  const perHouse = new Map<string, number>();
  const yearLike: string[] = [];

  for (const file of files) {
    const house = file.replace(/\.json$/, "");
    const cards: Card[] = JSON.parse(await fs.readFile(path.join(LISTS_DIR, file), "utf8"));
    if (/\d{4}/.test(house)) {
      const n = cards.filter((c) => !seen.has(c.url) && c.votes >= MIN_VOTES).length;
      if (n > 0) skippedHouses.push(`${house} (${n})`);
      continue;
    }
    for (const c of cards) {
      if (seen.has(c.url) || c.votes < MIN_VOTES) continue;
      // Same regex bug for houses with a founding year in the card text
      // ("Parfums Berdoues 1902"): a year landing in the votes slot.
      if (c.votes >= 1800 && c.votes <= 2030) {
        yearLike.push(`${c.url.split("/perfume/")[1]} (${c.votes})`);
        continue;
      }
      seen.add(c.url);
      picked.push({ ...c, house });
      perHouse.set(house, (perHouse.get(house) ?? 0) + 1);
    }
  }

  // Most-voted first, so an interrupted scrape leaves you holding the best ones.
  picked.sort((a, b) => b.votes - a.votes);

  console.log(`[queue:popular] lists=${files.length} min_votes=${MIN_VOTES}`);
  console.log(`[queue:popular] queue=${queue.length} completed=${state.completed.length} failed_to_retry=${state.failed.length}`);
  console.log(`[queue:popular] new URLs: ${picked.length} from ${perHouse.size} houses`);
  console.log(
    `[queue:popular] top houses: ` +
      [...perHouse.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([h, n]) => `${h}:${n}`).join(" "),
  );
  console.log(`[queue:popular] first 10: ` + picked.slice(0, 10).map((p) => `${p.url.split("/perfume/")[1]} (${p.votes})`).join(", "));
  if (skippedHouses.length) {
    console.log(`⚠ SKIPPED (votes unreliable, digit-named house): ${skippedHouses.join(", ")}`);
  }

  if (yearLike.length) {
    console.log(`⚠ SKIPPED (vote count looks like a year): ${yearLike.join(", ")}`);
  }

  if (DRY) {
    console.log(`[queue:popular] DRY=1, queue.json not changed.`);
    return;
  }
  await fs.writeFile(QUEUE_FILE, JSON.stringify([...queue, ...picked.map((p) => p.url)], null, 2));
  console.log(`[queue:popular] queue is now ${queue.length + picked.length} URLs → ${QUEUE_FILE}`);
  console.log(`[queue:popular] scrape will attempt ${picked.length + state.failed.length} pages (${state.failed.length} retries + ${picked.length} new).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

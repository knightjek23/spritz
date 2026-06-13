import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  SUPPORTED_TRENDING_SCHEMA_VERSION,
  SchemaVersionError,
  type TrendingFeed,
} from "./types";

const FEED_RELATIVE_PATH = process.env.TRENDING_FEED_PATH ?? "data/trending-weekly.json";
const FEED_MAX_AGE_DAYS = 10;

/** The per-source areas the collector emits, mapped to their committed files. */
export type TrendingArea =
  | "google_trends"
  | "retailer_bestsellers"
  | "reddit"
  | "fragrantica";

const AREA_FILE: Record<TrendingArea, string> = {
  google_trends: "data/trending-google.json",
  retailer_bestsellers: "data/trending-retailer.json",
  reddit: "data/trending-reddit.json",
  fragrantica: "data/trending-fragrantica.json",
};

function isTrendingFeed(value: unknown): value is TrendingFeed {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<TrendingFeed>;
  return (
    typeof v.schema_version === "string" &&
    typeof v.generated_at === "string" &&
    typeof v.source === "string" &&
    !!v.period &&
    typeof v.period.start === "string" &&
    typeof v.period.end === "string" &&
    Array.isArray(v.entries) &&
    v.entries.every(
      (e) =>
        e &&
        typeof e.rank === "number" &&
        typeof e.name === "string" &&
        typeof e.house === "string",
    )
  );
}

function assertSchemaVersion(feed: TrendingFeed): void {
  if (feed.schema_version !== SUPPORTED_TRENDING_SCHEMA_VERSION) {
    throw new SchemaVersionError(feed.schema_version);
  }
}

export function isFeedStale(feed: TrendingFeed): boolean {
  const generated = new Date(feed.generated_at).getTime();
  if (Number.isNaN(generated)) return true;
  const ageDays = (Date.now() - generated) / 86_400_000;
  return ageDays > FEED_MAX_AGE_DAYS;
}

/** Shared file reader. Returns null on missing/malformed; throws on version mismatch. */
async function loadFeedFromPath(relPath: string): Promise<TrendingFeed | null> {
  try {
    const abs = path.join(process.cwd(), relPath);
    const raw = await fs.readFile(abs, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!isTrendingFeed(parsed)) {
      console.warn("[trending] feed failed shape validation:", relPath);
      return null;
    }
    assertSchemaVersion(parsed);
    return parsed;
  } catch (err) {
    if (err instanceof SchemaVersionError) throw err;
    console.warn("[trending] could not read feed file:", relPath, (err as Error).message);
    return null;
  }
}

/** The blended (source="multi") feed. */
export function loadTrendingFeed(): Promise<TrendingFeed | null> {
  return loadFeedFromPath(FEED_RELATIVE_PATH);
}

/** A single per-source feed (one of the four areas). */
export function loadAreaFeed(area: TrendingArea): Promise<TrendingFeed | null> {
  return loadFeedFromPath(AREA_FILE[area]);
}

export async function loadTrendingFeedFromUrl(
  url = process.env.TRENDING_FEED_URL,
  revalidateSeconds = 3600,
): Promise<TrendingFeed | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { next: { revalidate: revalidateSeconds } });
    if (!res.ok) return null;
    const parsed: unknown = await res.json();
    if (!isTrendingFeed(parsed)) return null;
    assertSchemaVersion(parsed);
    return parsed;
  } catch (err) {
    if (err instanceof SchemaVersionError) throw err;
    console.warn("[trending] could not fetch feed url:", (err as Error).message);
    return null;
  }
}

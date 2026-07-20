/**
 * Shapes for the external weekly trending feed and the catalog-joined result.
 * `TrendingFeed` matches the contract agreed with the collector.
 */

export const SUPPORTED_TRENDING_SCHEMA_VERSION = "1.0";

export class SchemaVersionError extends Error {
  constructor(found: string | undefined) {
    super(
      `Trending feed schema_version is "${found}", app expects "${SUPPORTED_TRENDING_SCHEMA_VERSION}". ` +
        `Update lib/trending to match the collector before deploying.`,
    );
    this.name = "SchemaVersionError";
  }
}

export type TrendingSource =
  | "tiktok"
  | "instagram"
  | "reddit"
  | "fragrantica-trending"
  | "multi"
  | (string & {});

export interface TrendingEntry {
  rank: number;
  name: string;
  house: string;
  fragrantica_url?: string;
  external_id?: string;
  mentions?: number;
  thumbnail_url?: string;
  source_url?: string;
}

export interface TrendingFeed {
  schema_version: string;
  generated_at: string;
  period: { start: string; end: string };
  source: TrendingSource;
  entries: TrendingEntry[];
}

export type MatchMethod = "fragrantica_url" | "exact" | "fuzzy" | "unmatched";

export interface JoinedTrendingEntry extends TrendingEntry {
  fragranceId: string | null;
  imageUrl: string | null;
  matchMethod: MatchMethod;
  matchScore: number | null;
}

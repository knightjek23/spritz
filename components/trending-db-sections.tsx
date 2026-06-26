// Database-derived trending sections. Each is an async Server Component that
// queries Supabase live (see lib/trending/db-trending.ts) and renders through
// the shared <FragranceScroller>. All self-hide when their query returns empty,
// so they're safe to drop anywhere. No collector / Action dependency.

import { FragranceScroller } from "./fragrance-scroller";
import {
  getPopularOnFragrantica,
  getNewThisYear,
  getMostAddedToCollection,
} from "@/lib/trending/db-trending";

type Variant = "default" | "compact";

export async function PopularOnFragrantica({
  limit = 12,
  variant = "default",
}: {
  limit?: number;
  variant?: Variant;
}) {
  const rows = await getPopularOnFragrantica(limit);
  return <FragranceScroller title="Trending on Fragrantica" rows={rows} variant={variant} />;
}

export async function NewThisYear({
  limit = 12,
  variant = "default",
}: {
  limit?: number;
  variant?: Variant;
}) {
  const rows = await getNewThisYear(limit);
  // Not a strict ranking — hide the #n chip.
  return <FragranceScroller title="New this year" rows={rows} variant={variant} showRank={false} />;
}

export async function MostAddedToCollection({
  limit = 12,
  variant = "default",
}: {
  limit?: number;
  variant?: Variant;
}) {
  const rows = await getMostAddedToCollection(limit);
  return <FragranceScroller title="Most added to collections" rows={rows} variant={variant} />;
}

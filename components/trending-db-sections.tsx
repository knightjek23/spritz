// Database-derived trending sections. Each is an async Server Component that
// queries Supabase live (see lib/trending/db-trending.ts) and renders through
// the shared <FragranceScroller>. All self-hide when their query returns empty,
// so they're safe to drop anywhere. No collector / Action dependency.

import { FragranceScroller } from "./fragrance-scroller";
import { GenderToggle } from "./gender-toggle";
import {
  getPopularOnFragrantica,
  getNewThisYear,
  getMostAddedToCollection,
  getMostClickedToBuy,
} from "@/lib/trending/db-trending";

type Variant = "default" | "compact";

export async function PopularOnFragrantica({
  limit = 12,
  variant = "default",
}: {
  limit?: number;
  variant?: Variant;
}) {
  // Men / Women toggle, same pills as Seasonal Suggestions. Unisex shows on
  // both sides. Ranked, so the #n chips stay (each side ranks from #1).
  const [men, women] = await Promise.all([
    getPopularOnFragrantica(limit, "men"),
    getPopularOnFragrantica(limit, "women"),
  ]);
  // Heading deliberately does NOT name the data source. The export and RPC
  // names keep "Fragrantica" because that's what the column means internally,
  // but no user-facing string credits them (private scraper, no UI
  // attribution). This renders on the home page in BOTH auth states, so it was
  // the highest-exposure mention in the app.
  return (
    <GenderToggle
      heading="Most popular right now"
      men={men}
      women={women}
      showRank
      compact={variant === "compact"}
    />
  );
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

/**
 * First-party purchase intent. The honest stand-in for a retailer bestseller
 * list, since no affiliate network publishes a sales rank. Self-hides until
 * there's click volume.
 */
export async function MostClickedToBuy({
  limit = 12,
  variant = "default",
}: {
  limit?: number;
  variant?: Variant;
}) {
  const rows = await getMostClickedToBuy(limit);
  return <FragranceScroller title="Most shopped this month" rows={rows} variant={variant} />;
}

// "Most popular" by-house surface for the Encyclopedia hub.
//
// Server Component — fetches the top 5 houses (each with their top 10
// fragrances) from the list_popular_by_house RPC (migration 0016) and
// hands the grouped result to a small client component that owns the
// tab state. Tabs + one scroller instead of five stacked rows: the hub
// page already carries two trending blocks, so this keeps the section
// to one row of vertical weight.
//
// Data source is the popularity backfill (0015): popularity_rank
// ordinal, house depth = sum of the house's 10 best popularity_scores.
//
// Same resilience contract as TrendingSection: any RPC error, missing
// migration, or empty result → render nothing. This surface is
// decorative; it must never 500 the hub page.

import { createAdminClient } from "@/lib/supabase/admin";
import { PopularByHouseTabs, type HouseGroup } from "@/components/popular-by-house-tabs";

interface PopularByHouseRow {
  house: string;
  house_rank: number;
  id: string;
  name: string;
  year: number | null;
  bottle_image_url: string | null;
  popularity_rank: number;
  house_position: number;
}

export async function PopularByHouse({
  houses = 5,
  perHouse = 10,
}: {
  houses?: number;
  perHouse?: number;
}) {
  let rows: PopularByHouseRow[] = [];
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .rpc("list_popular_by_house", { p_houses: houses, p_per_house: perHouse })
      .returns<PopularByHouseRow[]>();
    if (error) {
      console.warn(
        "[popular-by-house] RPC error (likely migration 0016 not deployed):",
        error.message,
      );
      return null;
    }
    rows = Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn(
      "[popular-by-house] threw:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }

  if (rows.length === 0) return null;

  // Group into ordered house buckets. Rows arrive sorted by house_rank
  // then house_position, so insertion order is already correct.
  const groups: HouseGroup[] = [];
  for (const row of rows) {
    let group = groups[groups.length - 1];
    if (!group || group.house !== row.house) {
      group = { house: row.house, rows: [] };
      groups.push(group);
    }
    group.rows.push({
      id: row.id,
      name: row.name,
      house: row.house,
      bottle_image_url: row.bottle_image_url,
    });
  }

  return <PopularByHouseTabs groups={groups} />;
}

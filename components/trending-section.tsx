// "Trending this week" surface.
//
// Server Component. Ranks what Spritz people actually did with each bottle
// over the last 7 days: scanned it, wore it, shelved it, clicked to buy
// it, each counted once per person and weighted (list_trending_activity,
// migration 0042). Until there is enough of that to fill a row, the gap
// is topped up from the weekly search-demand feed (then retailer best
// sellers), so the row never sits there with a single card. Activity
// always ranks first; the top-up only fills what is left, skips anything
// already shown, and only uses feed entries that matched a catalog
// bottle (so every card links somewhere).
//
// Session 01 Finding 4: the tester anchored Pro value on what's
// culturally hot ("Instagram/TikTok famous fragrances"). Trending is the
// library-side answer to that, without diluting positioning by literally
// labeling things "TikTok fragrances."
//
// Render: horizontal scroll row of fragrance cards with bottle thumbnail,
// name and house. Mobile-first.

import Link from "next/link";
import { BottleImage } from "@/components/bottle-image";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAreaFeed, isFeedStale, type TrendingArea } from "@/lib/trending/feed";
import { joinTrendingToCatalogCached } from "@/lib/trending/join";

interface TrendingRow {
  id: string;
  name: string;
  house: string;
  bottle_image_url: string | null;
}

/** Below this many activity-ranked bottles, top up from the feeds. */
const MIN_ROW = 6;
/** Feeds to top up from, in order. */
const TOP_UP_AREAS: TrendingArea[] = ["google_trends", "retailer_bestsellers"];

// Same rows for every visitor, so cache across requests: the RPC runs
// once per 15 min instead of once per pageview.
const fetchActivityRows = unstable_cache(
  async (limit: number, days: number): Promise<TrendingRow[] | null> => {
    const supabase = createAdminClient();
    const { data: rows, error } = await supabase.rpc("list_trending_activity", {
      p_limit: limit,
      p_days: days,
    });
    if (error) {
      console.warn(
        "[trending] RPC error (likely migration 0042 not deployed):",
        error.message,
      );
      return null;
    }
    return (rows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      house: r.house,
      bottle_image_url: r.bottle_image_url,
    }));
  },
  ["trending-activity-rpc"],
  { revalidate: 900 },
);

/** Catalog-matched entries from the weekly feeds, in feed order, for the
 *  top-up. Never throws: a missing or stale feed just contributes nothing. */
async function feedTopUp(exclude: Set<string>, want: number): Promise<TrendingRow[]> {
  const out: TrendingRow[] = [];
  for (const area of TOP_UP_AREAS) {
    if (out.length >= want) break;
    try {
      const feed = await loadAreaFeed(area);
      if (!feed || isFeedStale(feed) || feed.entries.length === 0) continue;
      const joined = await joinTrendingToCatalogCached(area, feed.generated_at, feed.entries.slice(0, 20));
      for (const e of joined) {
        if (out.length >= want) break;
        if (!e.fragranceId || exclude.has(e.fragranceId)) continue;
        exclude.add(e.fragranceId);
        out.push({ id: e.fragranceId, name: e.name, house: e.house, bottle_image_url: e.imageUrl });
      }
    } catch (err) {
      console.warn(`[trending] top-up from ${area} failed:`, err instanceof Error ? err.message : String(err));
    }
  }
  return out;
}

export async function TrendingSection({
  limit = 10,
  days = 7,
  variant = "default",
}: {
  limit?: number;
  days?: number;
  /** "default" for marketing home (full-width section), "compact" for For You feed */
  variant?: "default" | "compact";
}) {
  // Belt-and-suspenders: wrap the whole RPC + downstream render in
  // try/catch so a missing migration, a malformed row, or a thrown
  // Supabase error can never bubble up and crash the parent page.
  // The trending surface is decorative — if it breaks, the page should
  // render without it, not 500.
  let data: TrendingRow[] = [];
  try {
    // A failed RPC (e.g. migration not applied yet) is treated as "no
    // activity", so the feeds can still fill the row.
    data = (await fetchActivityRows(limit, days)) ?? [];
  } catch (err) {
    console.warn("[trending] threw:", err instanceof Error ? err.message : String(err));
  }
  if (data.length < Math.min(MIN_ROW, limit)) {
    const seen = new Set(data.map((r) => r.id));
    data = [...data, ...(await feedTopUp(seen, limit - data.length))];
  }

  if (data.length === 0) return null;

  return (
    <section
      className={
        variant === "compact"
          ? "mt-6 mb-6"
          : "w-full mt-6"
      }
    >
      <div className="flex items-baseline justify-between mb-3 px-1">
        <h2 className="font-display text-2xl">Trending this week</h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate">
          Last {days} days
        </span>
      </div>

      {/* Horizontal scroller. snap-x snap-mandatory gives a tactile
          carousel feel; the cards are sized so two-and-a-bit are visible
          per screen on mobile, hinting at the scroll. */}
      <div className="-mx-6 px-6 scroll-pl-6 overflow-x-auto snap-x snap-mandatory slim-scrollbar">
        <ul className="flex gap-3 pb-2">
          {data.map((f, i) => (
            <li
              key={f.id}
              className="snap-start shrink-0 w-[140px]"
            >
              <Link
                href={`/fragrance/${f.id}`}
                className="block group"
              >
                {/* isolate + mix-blend-multiply removes the bottle photo's
                    white background by multiplying it into the paper-toned
                    card backdrop. Matches the detail-page hero treatment;
                    no more white rectangle behind each thumbnail. */}
                <div className="relative aspect-square rounded-xl overflow-hidden bg-paper border border-ink/10 mb-2 isolate">
                  <BottleImage
                    src={f.bottle_image_url}
                    house={f.house}
                    name={f.name}
                  />
                  {/* Rank chip in the corner — light social-proof signal */}
                  <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-cream/90 backdrop-blur-sm rounded-full font-mono text-[10px] text-ink">
                    #{i + 1}
                  </span>
                </div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-slate truncate">
                  {f.house}
                </p>
                <p className="font-display text-sm leading-tight truncate group-hover:text-emerald transition-colors">
                  {f.name}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

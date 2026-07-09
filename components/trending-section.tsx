// "Trending this week" surface.
//
// Server Component — fetches from the list_trending_fragrances RPC at
// request time, falls back gracefully if the table is empty (early-stage
// catalog) or the RPC fails.
//
// Session 01 Finding 4: the tester anchored Pro value on what's
// culturally hot ("Instagram/TikTok famous fragrances"). Trending is the
// encyclopedia-side answer to that — what people are actually scanning
// this week — without diluting positioning by literally labeling things
// "TikTok fragrances."
//
// Render: horizontal scroll row of fragrance cards with bottle thumbnail,
// name, house, and scan count. Mobile-first; the row scrolls
// horizontally on narrow screens and wraps on wider ones.

import Link from "next/link";
import Image from "next/image";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

interface TrendingRow {
  id: string;
  name: string;
  house: string;
  family: string[] | null;
  gender: string | null;
  year: number | null;
  bottle_image_url: string | null;
  scan_count: number;
}

// Same rows for every visitor — cache across requests so the RPC runs
// once per 15 min instead of once per pageview.
const fetchTrendingRows = unstable_cache(
  async (limit: number, days: number): Promise<TrendingRow[] | null> => {
    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
      .rpc("list_trending_fragrances", { p_limit: limit, p_days: days })
      .returns<TrendingRow[]>();
    if (error) {
      console.warn(
        "[trending] RPC error (likely migration 0010 not deployed):",
        error.message,
      );
      return null;
    }
    return Array.isArray(rows) ? rows : [];
  },
  ["trending-section-rpc"],
  { revalidate: 900 },
);

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
    const rows = await fetchTrendingRows(limit, days);
    if (rows === null) return null;
    data = rows;
  } catch (err) {
    console.warn("[trending] threw:", err instanceof Error ? err.message : String(err));
    return null;
  }

  if (data.length === 0) return null;

  return (
    <section
      className={
        variant === "compact"
          ? "mb-8"
          : "w-full mt-12 mb-6"
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
                  {f.bottle_image_url ? (
                    <Image
                      src={f.bottle_image_url}
                      alt={`${f.house} ${f.name}`}
                      fill
                      sizes="140px"
                      className="object-contain p-2 mix-blend-multiply group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-slate uppercase tracking-wider">
                      {f.house.slice(0, 2)}
                    </div>
                  )}
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

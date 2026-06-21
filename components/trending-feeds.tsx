// Per-area trending surfaces. One labeled horizontal scroller per source the
// collector pulls from (search demand, retailer bestsellers, Reddit, Fragrantica).
// Replaces the single "TikTok" section: there is no direct TikTok scrape, so we
// name each surface for what it actually measures.
//
// Each row reads its own per-source feed (data/trending-<area>.json), joins to
// the catalog (fragrantica_url exact -> search_fragrances fuzzy >= 0.85), and
// self-hides if its feed is missing, stale, or empty. So Fragrantica simply
// won't render while that source is disabled.
//
// Matches components/trending-section.tsx design tokens. Copy avoids em dashes.

import Link from "next/link";
import Image from "next/image";
import { loadAreaFeed, isFeedStale, type TrendingArea } from "@/lib/trending/feed";
import { joinTrendingToCatalog } from "@/lib/trending/join";
import type { JoinedTrendingEntry } from "@/lib/trending/types";

type AreaDef = { area: TrendingArea; title: string };

// Order = display order. Friendly, on-brand titles for what each source measures.
const DEFAULT_AREAS: AreaDef[] = [
  { area: "google_trends", title: "Most searched this week" },
  { area: "retailer_bestsellers", title: "Best sellers right now" },
  { area: "reddit", title: "What r/fragrance is talking about" },
  { area: "fragrantica", title: "Trending on Fragrantica" },
];

async function AreaRow({
  area,
  title,
  limit,
  variant,
}: {
  area: TrendingArea;
  title: string;
  limit: number;
  variant: "default" | "compact";
}) {
  const feed = await loadAreaFeed(area); // throws only on schema_version mismatch
  if (!feed || isFeedStale(feed) || feed.entries.length === 0) return null;

  let rows: JoinedTrendingEntry[] = [];
  try {
    rows = await joinTrendingToCatalog(feed.entries.slice(0, limit));
  } catch (err) {
    console.warn(`[trending-feeds] join threw for ${area}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
  if (rows.length === 0) return null;

  return (
    <section className={variant === "compact" ? "mb-8" : "w-full mt-10 mb-6"}>
      <div className="flex items-baseline justify-between mb-3 px-1">
        <h2 className="font-display text-2xl">{title}</h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate">
          This week
        </span>
      </div>

      <div className="-mx-6 px-6 overflow-x-auto snap-x snap-mandatory">
        <ul className="flex gap-3 pb-2">
          {rows.map((f) => {
            const inner = (
              <>
                {/* isolate + mix-blend-multiply removes the bottle photo's
                    white background by multiplying it into the paper-toned
                    card backdrop. Matches the detail-page hero treatment;
                    no more white rectangle behind each thumbnail. */}
                <div className="relative aspect-square rounded-xl overflow-hidden bg-paper border border-ink/10 mb-2 isolate">
                  {f.imageUrl ? (
                    <Image
                      src={f.imageUrl}
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
                  <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-cream/90 backdrop-blur-sm rounded-full font-mono text-[10px] text-ink">
                    #{f.rank}
                  </span>
                </div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-slate truncate">
                  {f.house}
                </p>
                <p className="font-display text-sm leading-tight truncate group-hover:text-emerald transition-colors">
                  {f.name}
                </p>
              </>
            );
            return (
              <li key={`${f.rank}-${f.name}`} className="snap-start shrink-0 w-[140px]">
                {f.fragranceId ? (
                  <Link href={`/fragrance/${f.fragranceId}`} className="block group">
                    {inner}
                  </Link>
                ) : (
                  <div className="block">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function TrendingFeeds({
  areas = DEFAULT_AREAS,
  limit = 12,
  variant = "default",
}: {
  areas?: AreaDef[];
  limit?: number;
  variant?: "default" | "compact";
}) {
  return (
    <>
      {areas.map((a) => (
        <AreaRow key={a.area} area={a.area} title={a.title} limit={limit} variant={variant} />
      ))}
    </>
  );
}

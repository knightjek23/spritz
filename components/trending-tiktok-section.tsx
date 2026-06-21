// "Trending on TikTok this week" surface — the external, culture-side
// companion to <TrendingSection /> (which is scan-based and needs real user
// volume to be meaningful). This one reads the weekly scraper feed and works
// from day one.
//
// Session 01 Finding 4: the tester anchored Pro value on what's culturally hot
// (TikTok / celebrity fragrances + dupes). This is the explicit answer to that.
// The "Trending on TikTok" label tested well with beginner users, so we use it
// directly here while keeping <TrendingSection /> as the on-brand "what people
// scan on Spritz" pulse.
//
// Data path: lib/trending/feed.ts reads data/trending-weekly.json (committed
// weekly by the collector's GitHub Action), then lib/trending/join.ts matches
// each entry to the catalog (fragrantica_url exact, then search_fragrances
// fuzzy at >= 0.85). Matched entries link to /fragrance/[id]; unmatched ones
// still render (name, house, scrape thumbnail) but are not clickable.
//
// Graceful by design: a missing or stale feed renders nothing. A schema_version
// mismatch is intentionally NOT swallowed — it throws so a bad deploy is caught
// in CI / preview rather than silently mis-parsed.

import Link from "next/link";
import Image from "next/image";
import { loadTrendingFeed, isFeedStale } from "@/lib/trending/feed";
import { joinTrendingToCatalog } from "@/lib/trending/join";
import type { JoinedTrendingEntry } from "@/lib/trending/types";

export async function TrendingTikTokSection({
  title = "Trending on TikTok this week",
  limit = 12,
  variant = "default",
}: {
  title?: string;
  limit?: number;
  /** "default" for marketing home (full-width section), "compact" for For You feed */
  variant?: "default" | "compact";
}) {
  // loadTrendingFeed throws ONLY on a schema_version mismatch (intended, loud);
  // missing / malformed / IO problems return null. Let the mismatch propagate.
  const feed = await loadTrendingFeed();
  if (!feed || isFeedStale(feed) || feed.entries.length === 0) return null;

  // The join hits Supabase; wrap it so a transient DB error hides the section
  // rather than 500-ing the parent page. (Matches <TrendingSection /> behavior.)
  let rows: JoinedTrendingEntry[] = [];
  try {
    rows = await joinTrendingToCatalog(feed.entries.slice(0, limit));
  } catch (err) {
    console.warn("[trending-tiktok] join threw:", err instanceof Error ? err.message : String(err));
    return null;
  }
  if (rows.length === 0) return null;

  return (
    <section className={variant === "compact" ? "mb-8" : "w-full mt-12 mb-6"}>
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
                  // Unmatched: same card, not clickable, no hover affordance.
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

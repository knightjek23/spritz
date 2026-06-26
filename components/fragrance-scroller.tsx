// Shared presentational scroller for trending-style surfaces. Server component,
// no data fetching of its own — callers pass already-fetched rows. Mirrors
// components/trending-section.tsx (horizontal snap scroller, square bottle
// thumbnails with the mix-blend-multiply treatment, rank chip, link to
// /fragrance/[id]). Keeps every trending surface visually consistent.

import Link from "next/link";
import Image from "next/image";

export interface ScrollerRow {
  id: string;
  name: string;
  house: string;
  bottle_image_url: string | null;
}

export function FragranceScroller({
  title,
  rows,
  variant = "default",
  showRank = true,
}: {
  title: string;
  rows: ScrollerRow[];
  variant?: "default" | "compact";
  /** Show the #n chip. Off for sets where order isn't a ranking. */
  showRank?: boolean;
}) {
  if (!rows || rows.length === 0) return null;

  return (
    <section className={variant === "compact" ? "mb-8" : "w-full mt-10 mb-6"}>
      <div className="flex items-baseline justify-between mb-3 px-1">
        <h2 className="font-display text-2xl">{title}</h2>
      </div>

      <div className="-mx-6 px-6 overflow-x-auto snap-x snap-mandatory">
        <ul className="flex gap-3 pb-2">
          {rows.map((f, i) => (
            <li key={f.id} className="snap-start shrink-0 w-[140px]">
              <Link href={`/fragrance/${f.id}`} className="block group">
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
                  {showRank && (
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-cream/90 backdrop-blur-sm rounded-full font-mono text-[10px] text-ink">
                      #{i + 1}
                    </span>
                  )}
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

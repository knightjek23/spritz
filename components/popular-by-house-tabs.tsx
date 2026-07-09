"use client";

// Client half of the "Most popular" by-house surface: a pill tablist of
// the top 5 houses over a single ranked scroller. Tapping a pill swaps
// the scroller in place — no navigation, no data refetch (all 50 rows
// arrive from the server parent in one payload).
//
// Reuses FragranceScroller so the row reads identically to the two
// trending surfaces above it on the hub page (same card, same rank
// chip, same snap behavior). The scroller's title is the active house
// name, which doubles as the tab panel heading.
//
// The selected pill uses ink-on-cream inversion rather than a color
// swatch — house tabs are navigation state, not category coding like
// family pills.

import { useState } from "react";
import Link from "next/link";
import { FragranceScroller, type ScrollerRow } from "@/components/fragrance-scroller";
import { houseSlug } from "@/lib/slugs";

export interface HouseGroup {
  house: string;
  rows: ScrollerRow[];
}

export function PopularByHouseTabs({ groups }: { groups: HouseGroup[] }) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!groups || groups.length === 0) return null;
  const active = groups[Math.min(activeIndex, groups.length - 1)];

  return (
    <section className="mt-12 mb-6">
      <p className="font-mono text-xs uppercase tracking-widest text-slate mb-3">
        Most popular
      </p>

      {/* House pills — scrollable row so five names fit on narrow
          screens without wrapping into a block. */}
      <div
        role="tablist"
        aria-label="Most popular fragrances by house"
        className="-mx-6 px-6 overflow-x-auto slim-scrollbar"
      >
        <div className="flex gap-2 pb-1 w-max">
          {groups.map((g, i) => {
            const selected = i === activeIndex;
            return (
              <button
                key={g.house}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveIndex(i)}
                className={
                  selected
                    ? "px-4 py-2 text-sm rounded-full bg-ink text-cream transition whitespace-nowrap"
                    : "px-4 py-2 text-sm rounded-full bg-paper border border-ink/10 text-ink hover:brightness-95 transition whitespace-nowrap"
                }
              >
                {g.house}
              </button>
            );
          })}
        </div>
      </div>

      {/* Single scroller for the active house. FragranceScroller's own
          h2 (the house name) acts as the tab panel heading. */}
      <div role="tabpanel" aria-label={`${active.house} top ${active.rows.length}`}>
        <FragranceScroller
          title={active.house}
          rows={active.rows}
          variant="compact"
          showRank
        />
        <Link
          href={`/house/${houseSlug(active.house)}`}
          className="inline-flex items-center gap-1 text-sm text-emerald underline underline-offset-4 hover:text-emerald/80 transition"
        >
          All {active.house} fragrances
          <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}

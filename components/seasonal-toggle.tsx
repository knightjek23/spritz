"use client";

// Client half of Seasonal Suggestions: heading, one-line subline, a
// Men / Women pill toggle and the scroller for the chosen side. Both sides
// arrive from the server in one payload, so switching is instant. Pills
// follow the "Most popular" house tabs (ink-on-cream for the selected
// state). If one side is empty the toggle is dropped and the other side
// shows alone.

import { useState } from "react";
import { FragranceScroller, type ScrollerRow } from "@/components/fragrance-scroller";

type Side = "men" | "women";

export function SeasonalToggle({
  heading,
  men,
  women,
}: {
  heading: string;
  men: ScrollerRow[];
  women: ScrollerRow[];
}) {
  const sides = (["men", "women"] as Side[]).filter((s) => (s === "men" ? men : women).length > 0);
  const [active, setActive] = useState<Side>(sides[0] ?? "men");
  if (sides.length === 0) return null;
  const rows = active === "men" ? men : women;

  return (
    <section className="w-full mt-10 mb-6">
      <div className="px-1 mb-4">
        <h2 className="font-display text-2xl">{heading}</h2>
        <p className="text-sm text-slate mt-1">What people are reaching for this season.</p>
      </div>

      {sides.length > 1 && (
        <div role="tablist" aria-label={`${heading} for men or women`} className="flex gap-2 mb-4 px-1">
          {sides.map((s) => {
            const selected = s === active;
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActive(s)}
                className={
                  selected
                    ? "px-4 py-2 text-sm rounded-full bg-ink text-cream transition"
                    : "px-4 py-2 text-sm rounded-full bg-paper border border-ink/10 text-ink hover:brightness-95 transition"
                }
              >
                {s === "men" ? "Men" : "Women"}
              </button>
            );
          })}
        </div>
      )}

      <div role="tabpanel" aria-label={`${heading}, ${active === "men" ? "men" : "women"}`}>
        <FragranceScroller rows={rows} variant="compact" showRank={false} />
      </div>
    </section>
  );
}

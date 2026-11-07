"use client";

// Men / Women pill toggle over a FragranceScroller. Shared by Seasonal
// Suggestions and "Most popular right now". Both sides arrive from the
// server in one payload, so switching is instant. Both pills are one
// fixed width (and both carry a 1px border, so heights match too); the
// selected pill is brand emerald with cream text. If one side is
// empty the toggle is dropped and the other side shows alone; if both are
// empty the section hides.

import { useState } from "react";
import { FragranceScroller, type ScrollerRow } from "@/components/fragrance-scroller";

type Side = "men" | "women";

export function GenderToggle({
  heading,
  subline,
  men,
  women,
  showRank = false,
  compact = false,
}: {
  heading: string;
  /** One line under the heading. Omit for none. */
  subline?: string;
  men: ScrollerRow[];
  women: ScrollerRow[];
  /** #n chips. On for ranked lists, off for rotating picks. */
  showRank?: boolean;
  /** Tighter outer spacing, for the signed-in feed. */
  compact?: boolean;
}) {
  const sides = (["men", "women"] as Side[]).filter((s) => (s === "men" ? men : women).length > 0);
  const [active, setActive] = useState<Side>(sides[0] ?? "men");
  if (sides.length === 0) return null;
  const rows = active === "men" ? men : women;

  return (
    <section className={compact ? "mt-6 mb-6" : "w-full mt-6"}>
      <div className="px-1 mb-4">
        <h2 className="font-display text-2xl">{heading}</h2>
        {subline && <p className="text-sm text-slate mt-1">{subline}</p>}
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
                  "w-24 py-2 text-sm text-center rounded-full border transition " +
                  (selected
                    ? "bg-emerald border-emerald text-cream"
                    : "bg-paper border-ink/10 text-ink hover:brightness-95")
                }
              >
                {s === "men" ? "Men" : "Women"}
              </button>
            );
          })}
        </div>
      )}

      <div role="tabpanel" aria-label={`${heading}, ${active === "men" ? "men" : "women"}`}>
        <FragranceScroller rows={rows} variant="compact" showRank={showRank} />
      </div>
    </section>
  );
}

"use client";

// Family pills with tap-to-explain bottom sheet.
//
// Session 01 observation: the tester tapped the "Fruity" family pill on
// a fragrance detail page expecting a quick definition popup, and got
// navigated to the full /family/[slug] page instead. Her words: "make
// families have pop-up descriptions with 'x' out option when finished."
//
// New behavior:
//   - Tap a pill → opens a bottom sheet with the family name, the
//     one-line blurb from lib/families.ts, and a primary CTA to browse
//     all fragrances in that family.
//   - Tap outside the sheet, the close X, or the backdrop → closes it.
//   - Keyboard: Escape closes the sheet.
//
// Why a bottom sheet over a modal: matches native mobile expectations
// (Safari share sheet, iOS picker), feels lower-friction than a
// full-screen modal, and reads as ephemeral information rather than a
// destination switch.

import { useEffect, useState } from "react";
import Link from "next/link";
import { FAMILY_BLURB, familyName, normalizeFamily } from "@/lib/families";

interface Props {
  /** Raw family strings from fragrances.family[]. May be accords or canonical slugs. */
  families: string[];
}

export function FamilyPills({ families }: Props) {
  const [active, setActive] = useState<string | null>(null);

  // Close on Escape — accessibility nicety so keyboard users can dismiss
  // without hunting for the close button.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {families.map((fam) => (
          <button
            key={fam}
            type="button"
            onClick={() => setActive(fam)}
            className="px-3 py-1.5 bg-paper hover:bg-brass/40 text-ink text-sm rounded-full capitalize transition"
            aria-haspopup="dialog"
          >
            {fam}
          </button>
        ))}
      </div>

      {active && (
        <FamilySheet
          family={active}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}

function FamilySheet({
  family,
  onClose,
}: {
  family: string;
  onClose: () => void;
}) {
  // Normalize the raw accord ("warm spicy", "powdery", "vanilla") into
  // a canonical family slug ("spicy", "floral", "gourmand"). Same
  // mapping the SQL normalize_family function uses server-side — keeps
  // the link target valid and the blurb lookup hitting FAMILY_BLURB.
  const slug = normalizeFamily(family);
  const blurb = FAMILY_BLURB[slug] ?? null;
  // Display the original accord string when it's distinct from the
  // canonical family — e.g. tapping "Warm Spicy" should still show
  // "Warm Spicy" as the sheet title, with the spicy blurb beneath.
  const canonicalDisplay = familyName(slug);
  const rawDisplay = family.charAt(0).toUpperCase() + family.slice(1).toLowerCase();
  const displayName = rawDisplay;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="family-sheet-title"
    >
      {/* Backdrop — tap to dismiss. Slightly translucent ink so the
          fragrance page is dimmed but still recognizable. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
      />

      {/* Sheet — mx-auto + max-w-md keeps it phone-shaped on tablet/
          desktop. Rounded only on the top so the attachment to the
          bottom edge feels intentional. (Entrance animation skipped to
          avoid pulling in tailwindcss-animate; vanilla Tailwind doesn't
          have a slide-up keyframe built in.) */}
      <div
        className="relative w-full max-w-md bg-cream rounded-t-3xl px-6 pt-6 pb-8 shadow-2xl"
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-slate mb-1">
              Family
            </p>
            <h2
              id="family-sheet-title"
              className="font-display text-3xl leading-tight capitalize"
            >
              {displayName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 -mr-2 flex items-center justify-center text-ink/60 hover:text-ink transition"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5"
              aria-hidden
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        {blurb ? (
          <p className="text-base text-ink leading-relaxed mb-6">{blurb}</p>
        ) : (
          <p className="text-base text-slate leading-relaxed mb-6 italic">
            Editorial description coming soon.
          </p>
        )}

        <Link
          href={`/family/${slug}`}
          onClick={onClose}
          className="block w-full text-center bg-emerald text-cream py-3 rounded-xl font-medium hover:bg-emerald/90 transition"
        >
          Browse all {canonicalDisplay.toLowerCase()} fragrances
        </Link>
      </div>
    </div>
  );
}

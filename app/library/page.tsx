// /library — the hub page for the Library bottom-nav tab.
//
// Consolidates three browse-by-X entries (notes, houses, families) and
// surfaces both trending feeds (scrape-based + scan-based) at the top.
// The intent is that tapping Library in the nav lands a user on a
// single page that answers "what's in here and where do I start?" —
// rather than dumping them into a single index that only covers one
// dimension.
//
// Trending is duplicated here AND on the home page intentionally. Home
// is the destination for "what's new" / "what's hot"; Library is
// the destination for "what is this thing and how do I explore it." A
// trending list belongs in both — same data, different reading order.
//
// Server Component: trending fetches run at request time, browse links
// are static.

import type { Metadata } from "next";
import Link from "next/link";
import { TrendingFeeds } from "@/components/trending-feeds";
import { TrendingSection } from "@/components/trending-section";
import { PopularByHouse } from "@/components/popular-by-house";

export const metadata: Metadata = {
  title: "Library · Spritz",
  description:
    "Every fragrance, every note, every house. Browse by family or note, or see what's trending this week.",
};

export default function LibraryHubPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-10">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate mb-2">
          The library
        </p>
        <h1 className="font-display text-5xl leading-[0.95] mb-3">
          Every fragrance,
          <br />
          broken down.
        </h1>
        <p className="text-slate text-base leading-relaxed max-w-xs">
          Browse by family, look up a note, dive into a house. Or skim what
          people are wearing this week.
        </p>
      </header>

      {/* Trending feeds — external scrape source(s). Self-hides if the
          JSON feed isn't populated yet. */}
      <TrendingFeeds variant="default" />

      {/* Trending scans — internal scan-event aggregation. Self-hides
          when there isn't enough scan volume. The two trending blocks
          read as complementary: "what TikTok is wearing" + "what
          Spritz users are scanning." */}
      <TrendingSection />

      {/* Most popular by house — the top 5 houses (by depth of their
          10 best fragrances' popularity scores), each with a ranked
          top-10 scroller behind a pill tab. All-time cultural-presence
          complement to the two week-scoped trending blocks above.
          Self-hides until migration 0016 is applied. */}
      <PopularByHouse />

      {/* Three browse-by-X entries — primary navigation into the
          library. Big tap targets so it's clear these are the
          main entries, not buried links. */}
      <section className="mt-12 mb-10">
        <h2 className="font-display text-2xl mb-4">Browse</h2>
        <div className="grid grid-cols-1 gap-3">
          <Link
            href="/families"
            className="group flex items-center justify-between px-5 py-5 rounded-2xl bg-paper border border-ink/10 hover:brightness-95 transition"
          >
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-1">
                By family
              </p>
              <p className="font-display text-xl leading-tight">
                Citrus, floral, woody, gourmand...
              </p>
              <p className="text-sm text-slate mt-1 leading-snug">
                The shape of the bottle in one word.
              </p>
            </div>
            <ChevronRight />
          </Link>

          <Link
            href="/notes"
            className="group flex items-center justify-between px-5 py-5 rounded-2xl bg-paper border border-ink/10 hover:brightness-95 transition"
          >
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-1">
                By note
              </p>
              <p className="font-display text-xl leading-tight">
                Bergamot, vanilla, oud, leather...
              </p>
              <p className="text-sm text-slate mt-1 leading-snug">
                What every ingredient smells like.
              </p>
            </div>
            <ChevronRight />
          </Link>

          <Link
            href="/houses"
            className="group flex items-center justify-between px-5 py-5 rounded-2xl bg-paper border border-ink/10 hover:brightness-95 transition"
          >
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-1">
                By house
              </p>
              <p className="font-display text-xl leading-tight">
                Chanel, Tom Ford, Creed, Le Labo...
              </p>
              <p className="text-sm text-slate mt-1 leading-snug">
                Founders, signatures, style.
              </p>
            </div>
            <ChevronRight />
          </Link>
        </div>
      </section>

      {/* Quiet search affordance — for users who already know what
          they're looking for and want the catalog directly. */}
      <section className="pt-6 border-t border-ink/10 text-center">
        <p className="text-sm text-slate mb-3">
          Already know what you want?
        </p>
        <Link
          href="/search"
          className="inline-flex items-center gap-2 text-sm text-emerald underline underline-offset-4 hover:text-emerald/80 transition"
        >
          Search the catalog by name
        </Link>
      </section>
    </div>
  );
}

function ChevronRight() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5 text-slate shrink-0 ml-3"
      aria-hidden
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

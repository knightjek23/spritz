// Signed-out / empty-collection home — the marketing landing page.
//
// Rewritten after Session 01: the prior hero ("Know what you're wearing"
// + Scan as primary CTA) read as a scan tool first, library second.
// The tester asked verbatim for "an library of different perfumes /
// colognes to browse/learn about" — which is exactly what Spritz is, but
// she didn't see it. New hero leads with the library framing,
// promotes browsing to the primary entry point, and demotes scan to a
// secondary action. Also leans more beginner-friendly per Session 01
// Finding 5 (her brother and mom — gift-getters wanting to start
// buying — are the natural users).
//
// Kept as a Server Component (no Clerk client primitives) so it renders
// statically for crawlers and first-load anonymous users.

import Link from "next/link";
import { TrendingSection } from "./trending-section";
import { TrendingFeeds } from "./trending-feeds";
import { PopularOnFragrantica, NewThisYear } from "./trending-db-sections";

export function MarketingHome() {
  return (
    <div className="mx-auto max-w-md px-6 pt-16 pb-12 flex flex-col items-center text-center">
      {/* Each block carries a spritz-rise-N stagger so the page settles
          in from below in one fluid motion on first paint (~80ms between
          starts, 600ms each, ease-out-expo). Honors prefers-reduced-
          motion globally via globals.css. */}
      <span className="spritz-rise spritz-rise-1 inline-block px-3 py-1 mb-6 bg-brass text-ink text-xs font-mono uppercase tracking-wider rounded-full">
        v0.1 · The fragrance library
      </span>

      <h1 className="spritz-rise spritz-rise-2 font-display text-6xl mb-4 leading-[0.95]">
        Every fragrance,
        <br />
        broken down.
      </h1>

      <p className="spritz-rise spritz-rise-3 text-slate text-lg mb-3 max-w-xs leading-snug">
        What&apos;s in it, who made it, how it wears, and which cheaper bottles
        smell almost the same.
      </p>

      <p className="spritz-rise spritz-rise-4 text-sm text-slate/80 mb-10 max-w-xs leading-snug">
        New to fragrance? Browse families to find your kind of scent. Already
        have a bottle? Scan the label.
      </p>

      {/* Primary: scan a bottle. Leads with the action that gets the
          user from "curious about this bottle" to "here's what it is"
          in one tap. The camera flow is the highest-signal entry point
          and the one that makes Spritz feel distinct from other
          fragrance sites. */}
      <Link
        href="/scan"
        className="spritz-rise spritz-rise-5 w-full bg-emerald text-cream py-4 rounded-2xl font-medium tracking-wide mb-3 hover:bg-emerald/90 transition"
      >
        Scan a bottle
      </Link>

      {/* Secondary: browse the library. Same affordance, quieter
          visual weight. Still the discovery path for users without a
          bottle in hand. */}
      <Link
        href="/families"
        className="spritz-rise spritz-rise-6 w-full border border-ink/15 text-ink py-4 rounded-2xl font-medium tracking-wide hover:bg-ink/5 transition mb-3"
      >
        Browse the library
      </Link>

      {/* Tertiary: search. Text-only so it sits visually beneath the two
          full-width CTAs. Same destination, lighter hit. */}
      <Link
        href="/search"
        className="spritz-rise spritz-rise-7 text-sm text-slate hover:text-ink underline underline-offset-4 py-2 transition"
      >
        Or search by name
      </Link>

      <p className="spritz-rise spritz-rise-8 mt-10 text-xs font-mono uppercase tracking-widest text-slate">
        Free to use · no card needed
      </p>

      {/* Trending this week — surfaces what people are actually scanning.
          Renders nothing if scan_events is empty (early-stage catalog) or
          the RPC errors, so this is safe to leave in. */}
      {/* Culture-side trending (external scraper feed) above the scan-based
          pulse. This one has data from day one; <TrendingSection /> fills in
          as real scan volume accrues. Both self-hide when empty. */}
      <div className="spritz-rise spritz-rise-9 w-full text-left mt-4">
        <TrendingFeeds />
        <TrendingSection />
        {/* Catalog-derived surfaces: always have data even with zero users,
            query Supabase live, and self-hide if empty. */}
        <PopularOnFragrantica />
        <NewThisYear />
      </div>
    </div>
  );
}

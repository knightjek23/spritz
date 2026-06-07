// Signed-out / empty-collection home — the marketing landing page.
//
// Rewritten after Session 01: the prior hero ("Know what you're wearing"
// + Scan as primary CTA) read as a scan tool first, encyclopedia second.
// The tester asked verbatim for "an encyclopedia of different perfumes /
// colognes to browse/learn about" — which is exactly what Spritz is, but
// she didn't see it. New hero leads with the encyclopedia framing,
// promotes browsing to the primary entry point, and demotes scan to a
// secondary action. Also leans more beginner-friendly per Session 01
// Finding 5 (her brother and mom — gift-getters wanting to start
// buying — are the natural users).
//
// Kept as a Server Component (no Clerk client primitives) so it renders
// statically for crawlers and first-load anonymous users.

import Link from "next/link";

export function MarketingHome() {
  return (
    <div className="mx-auto max-w-md px-6 pt-16 pb-12 flex flex-col items-center text-center">
      <span className="inline-block px-3 py-1 mb-6 bg-brass text-ink text-xs font-mono uppercase tracking-wider rounded-full">
        v0.1 · The fragrance encyclopedia
      </span>

      <h1 className="font-display text-6xl mb-4 leading-[0.95]">
        Every fragrance,
        <br />
        broken down.
      </h1>

      <p className="text-slate text-lg mb-3 max-w-xs leading-snug">
        What&apos;s in it, who made it, how it wears, and which cheaper bottles
        smell almost the same.
      </p>

      <p className="text-sm text-slate/80 mb-10 max-w-xs leading-snug">
        New to fragrance? Browse families to find your kind of scent. Already
        have a bottle? Scan the label.
      </p>

      {/* Primary: browse the encyclopedia. Per Session 01, this is what
          the tester was looking for and didn't realize was the whole product. */}
      <Link
        href="/families"
        className="w-full bg-emerald text-cream py-4 rounded-2xl font-medium tracking-wide mb-3 hover:bg-emerald/90 transition"
      >
        Browse the encyclopedia
      </Link>

      {/* Secondary: scan. Demoted from primary; same affordance, lower
          visual weight. The fragrance encyclopedia is the product, scan
          is one of three ways into it. */}
      <Link
        href="/scan"
        className="w-full border border-ink/15 text-ink py-4 rounded-2xl font-medium tracking-wide hover:bg-ink/5 transition mb-3"
      >
        Scan a bottle
      </Link>

      {/* Tertiary: search. Text-only so it sits visually beneath the two
          full-width CTAs. Same destination, lighter hit. */}
      <Link
        href="/search"
        className="text-sm text-slate hover:text-ink underline underline-offset-4 py-2 transition"
      >
        Or search by name
      </Link>

      <p className="mt-10 text-xs font-mono uppercase tracking-widest text-slate">
        Free to use · no card needed
      </p>
    </div>
  );
}

// Signed-out / empty-collection home — the marketing landing page.
//
// Kept as a Server Component (no Clerk client primitives) so it renders
// statically for crawlers and first-load anonymous users. The signed-in
// "view your collection" affordance lives in the For You feed now, not
// here, because anyone landing on this page either isn't signed in or
// has nothing to recommend from.

import Link from "next/link";

export function MarketingHome() {
  return (
    <div className="mx-auto max-w-md px-6 pt-16 pb-12 flex flex-col items-center text-center">
      <span className="inline-block px-3 py-1 mb-6 bg-brass text-ink text-xs font-mono uppercase tracking-wider rounded-full">
        v0.1 · The fragrance encyclopedia
      </span>

      <h1 className="font-display text-6xl mb-4 leading-[0.95]">
        Know what
        <br />
        you&apos;re wearing.
      </h1>

      <p className="text-slate text-lg mb-12 max-w-xs">
        Point your camera at any bottle. Get the full story: notes, perfumer,
        longevity, how to wear it.
      </p>

      <Link
        href="/scan"
        className="w-full bg-emerald text-cream py-4 rounded-2xl font-medium tracking-wide mb-3 hover:bg-emerald/90 transition"
      >
        Scan a bottle
      </Link>
      <Link
        href="/search"
        className="w-full border border-ink/15 text-ink py-4 rounded-2xl font-medium tracking-wide hover:bg-ink/5 transition"
      >
        Search by name
      </Link>

      <p className="mt-10 text-xs font-mono uppercase tracking-widest text-slate">
        Free to use · no card needed
      </p>
    </div>
  );
}

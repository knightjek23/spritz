// Signed-in home feed — "For you" recommendations grounded in the user's
// own collection.
//
// Layout order (after Josh's pass on Session 01 follow-up):
//   1. Primary CTAs (Encyclopedia / Scan / Search) — same trio as the
//      marketing home, so the signed-in and signed-out home stay
//      consistent at the top of the page.
//   2. "Based on what you wear" header + seed names.
//   3. Try next — fragrances close to ones the user owns.
//   4. Trending this week — general what's-hot pulse.
//   5. Save you money — curated/AI dupes pulled from their set.
//   6. Quiet explore footer — by note / by house / by family.
//
// Server Component — no interactivity here, just static-ish render
// against pre-computed recommendation data. All data fetching happens
// in lib/recommendations.ts and is passed in.

import Link from "next/link";
import Image from "next/image";
import type { Recommendations } from "@/lib/recommendations";
import { houseSlug } from "@/lib/houses";
import { TrendingSection } from "./trending-section";

export function ForYouFeed({ data }: { data: Recommendations }) {
  return (
    <div className="mx-auto max-w-md px-6 py-10">
      {/* 1. Primary CTAs — Encyclopedia (primary), Scan (secondary),
            Search (tertiary text link). Mirrors components/marketing-home
            so signed-in and signed-out users see the same entry trio at
            the top of the page. */}
      <div className="flex flex-col items-stretch mb-10">
        <Link
          href="/families"
          className="w-full text-center bg-emerald text-cream py-4 rounded-2xl font-medium tracking-wide mb-3 hover:bg-emerald/90 transition"
        >
          Browse the encyclopedia
        </Link>
        <Link
          href="/scan"
          className="w-full text-center border border-ink/15 text-ink py-4 rounded-2xl font-medium tracking-wide mb-3 hover:bg-ink/5 transition"
        >
          Scan a bottle
        </Link>
        <Link
          href="/search"
          className="text-center text-sm text-slate hover:text-ink underline underline-offset-4 py-2 transition"
        >
          Or search by name
        </Link>
      </div>

      {/* 2. "Based on what you wear" header — sits between the CTAs and
            the personalized recs so the user reads CTAs, then learns why
            the next section exists, then sees the recs. */}
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-slate mb-1">
          For you
        </p>
        <h1 className="font-display text-4xl leading-[0.95]">
          Based on what you wear.
        </h1>
        {data.seeds.length > 0 && (
          <p className="text-sm text-slate mt-3 leading-relaxed">
            Built from{" "}
            {data.seeds.map((s, i) => (
              <span key={s.id}>
                {i > 0 ? (i === data.seeds.length - 1 ? " and " : ", ") : ""}
                <span className="text-ink font-medium">{s.name}</span>
              </span>
            ))}
            .
          </p>
        )}
      </header>

      {/* 3. Try next — personalized similars. Right below the header so
            the cause-and-effect ("based on your shelf" → "here's what
            we found") is one read. */}
      {data.similar.length > 0 ? (
        <section className="mb-12">
          <h2 className="font-display text-2xl mb-1">Try next</h2>
          <p className="text-sm text-slate mb-4">
            Bottles that share notes and family with yours.
          </p>
          <ul className="space-y-2">
            {data.similar.map(({ fragrance: f, similarity, becauseOf }) => (
              <li key={f.id}>
                <Link
                  href={`/fragrance/${f.id}`}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl border border-ink/10 hover:bg-ink/5 transition"
                >
                  {f.bottle_image_url ? (
                    <div className="shrink-0 w-12 h-16 relative">
                      <Image
                        src={f.bottle_image_url}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-contain mix-blend-multiply"
                      />
                    </div>
                  ) : (
                    <div className="shrink-0 w-12 h-16 rounded bg-paper" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{f.name}</div>
                    <div className="text-xs text-slate truncate">
                      {f.house}
                      {f.year ? ` · ${f.year}` : ""}
                    </div>
                    {becauseOf.length > 0 && (
                      <div className="text-[11px] text-slate mt-1 truncate">
                        <span className="font-mono uppercase tracking-wider text-[9px] text-slate">
                          if you like:{" "}
                        </span>
                        {becauseOf.slice(0, 2).join(", ")}
                        {becauseOf.length > 2 ? ` +${becauseOf.length - 2}` : ""}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-slate">
                    {Math.round(similarity * 100)}%
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="mb-12 rounded-xl border border-dashed border-ink/15 p-6 text-center">
          <p className="text-sm text-slate mb-3 leading-relaxed">
            We need a bit more catalog coverage to surface strong matches for
            your shelf yet.
          </p>
          <Link
            href="/search"
            className="inline-block px-4 py-2 rounded-lg bg-emerald text-cream text-sm font-medium hover:bg-emerald/90 transition"
          >
            Browse the catalog
          </Link>
        </section>
      )}

      {/* 4. Trending this week — general pulse. Sits below the
            personalized recs because it's hierarchically less relevant
            to a signed-in user with their own shelf to work from.
            Self-hides if no scan data. */}
      <TrendingSection variant="compact" />

      {/* 5. Save you money — curated/AI dupes for the user's collection. */}
      {data.cheaperDupes.length > 0 && (
        <section className="mb-12">
          <h2 className="font-display text-2xl mb-1">Save you money</h2>
          <p className="text-sm text-slate mb-4">
            Community-known dupes for the bottles you already wear.
          </p>
          <ul className="space-y-3">
            {data.cheaperDupes.map(({ forFragrance, dupe }, i) => (
              <li
                key={`${dupe.house}-${dupe.name}-${i}`}
                className="rounded-xl border border-ink/10 px-4 py-3 bg-cream/40"
              >
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-slate">
                      <Link
                        href={`/house/${houseSlug(dupe.house)}`}
                        className="hover:text-ink transition"
                      >
                        {dupe.house}
                      </Link>
                    </p>
                    <p className="font-display text-lg leading-tight">{dupe.name}</p>
                  </div>
                  {dupe.similarity && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider bg-brass/40 text-ink">
                      {dupe.similarity}
                    </span>
                  )}
                </div>
                {dupe.note && (
                  <p className="text-sm text-ink/80 leading-relaxed mt-2">
                    {dupe.note}
                  </p>
                )}
                <p className="font-mono text-[10px] uppercase tracking-widest text-slate mt-3 pt-2 border-t border-ink/5">
                  alternative to{" "}
                  <Link
                    href={`/fragrance/${forFragrance.id}`}
                    className="text-ink hover:underline normal-case font-sans tracking-normal"
                  >
                    {forFragrance.name}
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 6. Quiet explore footer — by-note / by-house / by-family. My
            shelf joins this row too so signed-in users still have a
            direct entry into /collection without it stealing CTA real
            estate. */}
      <section className="pt-6 border-t border-ink/10">
        <p className="font-mono text-xs uppercase tracking-widest text-slate mb-3">
          Explore the encyclopedia
        </p>
        <div className="grid grid-cols-4 gap-2 text-xs">
          <Link
            href="/notes"
            className="text-center px-2 py-2 rounded-lg border border-ink/10 hover:bg-ink/5 transition"
          >
            By note
          </Link>
          <Link
            href="/houses"
            className="text-center px-2 py-2 rounded-lg border border-ink/10 hover:bg-ink/5 transition"
          >
            By house
          </Link>
          <Link
            href="/families"
            className="text-center px-2 py-2 rounded-lg border border-ink/10 hover:bg-ink/5 transition"
          >
            By family
          </Link>
          <Link
            href="/collection"
            className="text-center px-2 py-2 rounded-lg border border-ink/10 hover:bg-ink/5 transition"
          >
            My shelf
          </Link>
        </div>
      </section>
    </div>
  );
}

// /perfumer/[slug] — every fragrance credited to one perfumer.
//
// Same reading order as /house/[slug]: header, a "Most popular" top-10
// scroller when there is enough work to summarize, then the full catalog
// ranked by popularity. Adds the houses this perfumer has worked for, since
// "who have they made things for" is the first question people ask about a
// nose.
//
// The slug resolves to the exact stored name(s) through lib/perfumers.ts.
// Matching never happens on a slug in SQL (see migration 0028).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { perfumerBySlug } from "@/lib/perfumers";
import { houseSlug } from "@/lib/houses";
import { canonicalHouseSlug } from "@/lib/slugs";
import { FragranceScroller } from "@/components/fragrance-scroller";
import { BottleImage } from "@/components/bottle-image";
import { isProUser } from "@/lib/entitlement";
import { ProLocked } from "@/components/pro-locked";

// Pro-gated per request, so not ISR. See the note in /perfumers.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const p = await perfumerBySlug(params.slug);
  if (!p) return { title: "Perfumer not found" };
  // Metadata is public (crawlers, link previews), so it names the perfumer
  // but never lists their work.
  return {
    title: p.name,
    description: `Every fragrance by perfumer ${p.name}, on Spritz Pro.`,
    alternates: { canonical: `/perfumer/${p.slug}` },
  };
}

export default async function PerfumerPage({ params }: { params: { slug: string } }) {
  const [p, pro] = await Promise.all([perfumerBySlug(params.slug), isProUser()]);
  if (!p) notFound();

  // Locked: the name is already in the URL, so showing it costs nothing.
  // Their work is the credit data, and it is never queried for non-Pro.
  if (!pro) {
    return (
      <article className="mx-auto max-w-md px-6 py-10">
        <p className="mb-4">
          <Link
            href="/library"
            className="font-mono text-xs uppercase tracking-widest text-slate hover:text-ink"
          >
            ← Library
          </Link>
        </p>
        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest text-slate">
            Perfumer · {p.count} fragrance{p.count === 1 ? "" : "s"}
          </p>
          <h1 className="font-display text-5xl mt-2 leading-[0.95]">{p.name}</h1>
        </header>
        <ProLocked
          body={`See all ${p.count} fragrance${p.count === 1 ? "" : "s"} ${p.name} has created, and the houses they've made them for. Pro feature.`}
        />
      </article>
    );
  }

  // One query per stored spelling that maps to this slug (almost always
  // one), merged and deduped.
  const supabase = createAdminClient();
  const responses = await Promise.all(
    p.storedNames.map((n) =>
      supabase.rpc("find_fragrances_by_perfumer", { p_name: n, p_limit: 300 }),
    ),
  );
  const seen = new Set<string>();
  const fragrances = responses
    .flatMap((r) => r.data ?? [])
    .filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)))
    .sort((a, b) => {
      const ra = a.popularity_rank ?? Number.MAX_SAFE_INTEGER;
      const rb = b.popularity_rank ?? Number.MAX_SAFE_INTEGER;
      return ra - rb || a.name.localeCompare(b.name);
    });

  if (fragrances.length === 0) notFound();

  // Houses they've worked for, most frequent first.
  const houseCounts = new Map<string, number>();
  for (const f of fragrances) houseCounts.set(f.house, (houseCounts.get(f.house) ?? 0) + 1);
  const houses = [...houseCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  // Same threshold as the house page: the scroller only earns its place
  // when it summarizes something longer than itself.
  const topTen =
    fragrances.length > 10
      ? fragrances.slice(0, 10).map((f) => ({
          id: f.id,
          name: f.name,
          house: f.house,
          bottle_image_url: f.bottle_image_url,
        }))
      : [];

  return (
    <article className="mx-auto max-w-md px-6 py-10">
      <p className="mb-4">
        <Link
          href="/perfumers"
          className="font-mono text-xs uppercase tracking-widest text-slate hover:text-ink"
        >
          ← All perfumers
        </Link>
      </p>

      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          Perfumer · {fragrances.length} fragrance{fragrances.length === 1 ? "" : "s"}
        </p>
        <h1 className="font-display text-5xl mt-2 leading-[0.95]">{p.name}</h1>
        <p className="mt-3 text-sm text-slate">
          {houses.length === 1
            ? `Worked with ${houses[0][0]}`
            : `Worked with ${houses.length} houses`}
        </p>
      </header>

      {houses.length > 1 && (
        <section className="mb-10">
          <h2 className="font-display text-2xl mb-4">Houses</h2>
          <ul className="flex flex-wrap gap-2">
            {houses.map(([house, n]) => (
              <li key={house}>
                <Link
                  href={`/house/${canonicalHouseSlug(houseSlug(house))}`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-paper hover:bg-brass/40 text-ink text-sm rounded-full transition"
                >
                  <span>{house}</span>
                  <span className="font-mono text-[10px] text-slate">{n}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {topTen.length > 0 && (
        <FragranceScroller
          title="Most popular"
          rows={topTen}
          variant="compact"
          showRank
        />
      )}

      <section className="mb-10">
        <h2 className="font-display text-2xl mb-4">Their work</h2>
        <ul className="space-y-2">
          {fragrances.map((f) => (
            <li key={f.id}>
              <Link
                href={`/fragrance/${f.id}`}
                className="flex items-center gap-3 px-3 py-2 rounded-xl bg-paper border border-ink/10 hover:brightness-95 transition"
              >
                <div className="shrink-0 w-12 h-16 relative">
                  <BottleImage
                    src={f.bottle_image_url}
                    house={f.house}
                    name={f.name}
                    sizes="48px"
                    className="object-contain mix-blend-multiply"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{f.name}</div>
                  <div className="text-xs text-slate truncate">
                    {[f.house, f.year].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Honest about the data's shape: the scraper stores only the first
          credited nose, so co-authored work lives under its lead perfumer. */}
      <p className="text-xs text-slate leading-relaxed">
        Each fragrance is listed under its lead perfumer. Work co-authored with
        another nose may appear on their page instead.
      </p>
    </article>
  );
}

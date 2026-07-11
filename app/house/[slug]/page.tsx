// /house/[slug] — library entry for a perfume house.
//
// Top: editorial story from editorial/houses/<slug>.md (history, style,
// founder, country, link out to official site).
// Middle: "Most popular" top-10 scroller (same FragranceScroller surface
// as the library hub) — only when the house has more than 10
// fragrances, so it never just duplicates a short catalog list.
// Bottom: every fragrance from this house in our catalog, ranked by
// popularity.
//
// Like /note/[slug], if we have catalog rows but no editorial, we still
// render the catalog list — useful for houses we haven't written about
// yet but that show up in scans.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadHouse, loadAllHouses } from "@/lib/houses";
import { canonicalHouseSlug, slugsForCanonicalHouse } from "@/lib/slugs";
import { FragranceScroller } from "@/components/fragrance-scroller";
import type { Fragrance } from "@/lib/types";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  // Canonicalize the same way the page body does. Without this, alias
  // URLs (e.g. /house/maison-martin-margiela) rendered full content
  // under the title "House not found". The canonical alternate also
  // stops aliases from being indexed as duplicates.
  const canonical = canonicalHouseSlug(params.slug);
  const house = await loadHouse(canonical);
  if (!house) return { title: "House not found" };
  return {
    title: house.name,
    description: house.body.split("\n").slice(0, 2).join(" ").slice(0, 160),
    alternates: { canonical: `/house/${canonical}` },
  };
}

export default async function HousePage({ params }: { params: { slug: string } }) {
  // Canonicalize the incoming slug so aliases (e.g.
  // /house/maison-martin-margiela) render the same page as the canonical
  // (/house/maison-margiela) instead of a stub with half the catalog.
  const canonical = canonicalHouseSlug(params.slug);
  const house = await loadHouse(canonical);

  // Pull catalog rows for the canonical slug AND every alias. The RPC
  // does exact-match on slug, so we fan out and merge client-side. For
  // most houses this is a single call; only aliased houses (Margiela)
  // hit the multi-call path.
  const supabase = createAdminClient();
  const querySlugs = slugsForCanonicalHouse(canonical);
  const responses = await Promise.all(
    querySlugs.map((s) =>
      supabase.rpc("find_fragrances_by_house", { p_slug: s, p_limit: 200 }),
    ),
  );
  const rows = responses.flatMap((r) => (r.data ?? []) as Fragrance[]);
  // Dedupe by id in case the same row somehow appears via multiple
  // slugs (defensive — shouldn't happen with the current data model).
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  if (!house && unique.length === 0) notFound();

  // The RPC returns rows ordered by popularity_rank, but the alias
  // fan-out merge can interleave lists, so re-sort defensively.
  const fragrances = unique.sort((a, b) => {
    const ra = a.popularity_rank ?? Number.MAX_SAFE_INTEGER;
    const rb = b.popularity_rank ?? Number.MAX_SAFE_INTEGER;
    return ra - rb || a.name.localeCompare(b.name);
  });
  const displayName = house?.name ?? fragrances[0]?.house ?? canonical;

  // Top-10 scroller only earns its place when there's a catalog to
  // summarize — for houses with ≤10 fragrances it would just repeat
  // the full list directly below it.
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
      {/* Crumb */}
      <p className="mb-4">
        <Link
          href="/houses"
          className="font-mono text-xs uppercase tracking-widest text-slate hover:text-ink"
        >
          ← All houses
        </Link>
      </p>

      {/* Header */}
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          House
          {fragrances.length > 0 && (
            <span> · {fragrances.length} fragrance{fragrances.length === 1 ? "" : "s"}</span>
          )}
        </p>
        <h1 className="font-display text-5xl mt-2 leading-[0.95]">
          {displayName}
        </h1>
        {house && (house.founded || house.founder || house.country) && (
          <p className="mt-3 text-sm text-slate">
            {house.founded && <span>Founded {house.founded}</span>}
            {house.founded && (house.founder || house.country) && <span> · </span>}
            {house.founder && <span>{house.founder}</span>}
            {house.founder && house.country && <span> · </span>}
            {house.country && <span>{house.country}</span>}
          </p>
        )}
      </header>

      {/* Editorial body — when we have one */}
      {house?.body && (
        <section className="mb-10">
          <p className="text-ink leading-relaxed whitespace-pre-line">
            {house.body}
          </p>
          {house.website && (
            <p className="mt-6">
              <a
                href={house.website}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs uppercase tracking-widest text-emerald hover:underline"
              >
                Official site ↗
              </a>
            </p>
          )}
        </section>
      )}

      {!house && (
        <section className="mb-10 border-l-2 border-brass pl-4">
          <p className="text-slate text-sm leading-relaxed italic">
            We haven&apos;t written about {displayName} yet. Below is every
            fragrance from them in our catalog.
          </p>
        </section>
      )}

      {/* Most popular — same ranked scroller surface as the library
          hub, scoped to this house. Sits between editorial and the full
          catalog so a skimmer gets the greatest hits without scrolling
          the whole list. */}
      {topTen.length > 0 && (
        <FragranceScroller
          title="Most popular"
          rows={topTen}
          variant="compact"
          showRank
          showHouse={false}
        />
      )}

      {/* Catalog */}
      {fragrances.length > 0 && (
        <section className="mb-10">
          <h2 className="font-display text-2xl mb-4">
            {house ? "Fragrances from the house" : "In our catalog"}
          </h2>
          <ul className="space-y-2">
            {fragrances.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/fragrance/${f.id}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl bg-paper border border-ink/10 hover:brightness-95 transition"
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
                      {f.year ? `${f.year}` : ""}
                      {f.year && f.family?.[0] ? " · " : ""}
                      {f.family?.[0] ?? ""}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

export async function generateStaticParams() {
  const houses = await loadAllHouses();
  return houses.map((h) => ({ slug: h.slug }));
}

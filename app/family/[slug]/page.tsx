// /family/[slug] — library entry for a fragrance family.
//
// Header pulls from FAMILY_BLURB (curated, small set). Then a "Most
// popular" top-10 scroller (same FragranceScroller surface as the
// library hub and house pages) when the family has more than 10
// fragrances, followed by the catalog list of every fragrance whose
// family[] includes this slug, ordered by popularity: first 50, then
// "See more" loads 50 at a time (components/browse-list).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchFamilyPage } from "@/lib/browse-pages";
import { BrowseList } from "@/components/browse-list";
import { FAMILY_BLURB, familyName, familySlug } from "@/lib/families";
import { FragranceScroller } from "@/components/fragrance-scroller";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  // Canonicalize the same way the page body does so alias slugs emit
  // the canonical URL rather than indexable duplicates.
  const slug = familySlug(params.slug);
  const name = familyName(slug);
  const blurb = FAMILY_BLURB[slug];
  return {
    title: `${name} fragrances`,
    description: blurb
      ? `${blurb} Every ${name.toLowerCase()} fragrance in the Spritz library.`
      : `${name} fragrances in the Spritz library.`,
    alternates: { canonical: `/family/${slug}` },
  };
}

export default async function FamilyPage({
  params,
}: {
  params: { slug: string };
}) {
  const slug = familySlug(params.slug);

  // First 50 by popularity plus the full count; "See more" in BrowseList
  // loads the next 50 from the same function (lib/browse-pages.ts).
  const { rows: fragrances, total } = await fetchFamilyPage(slug);

  // No matches AND no blurb → 404. Otherwise render whatever we have.
  if (fragrances.length === 0 && !FAMILY_BLURB[slug]) notFound();

  const name = familyName(slug);
  const blurb = FAMILY_BLURB[slug];

  // Top-10 scroller only when there's a catalog to summarize — for
  // families with ≤10 fragrances it would just repeat the full list
  // below. Rows arrive from the RPC already ordered by popularity_rank.
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
    <article className="mx-auto max-w-md px-6 pt-4 pb-10">
      {/* Crumb */}
      <p className="mb-4">
        <Link
          href="/families"
          className="font-mono text-xs uppercase tracking-widest text-slate hover:text-ink"
        >
          ← All families
        </Link>
      </p>

      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          Family
          {total > 0 && (
            <span> · {total} fragrance{total === 1 ? "" : "s"}</span>
          )}
        </p>
        <h1 className="font-display text-5xl mt-2 leading-[0.95] capitalize">
          {name}
        </h1>
        {blurb && (
          <p className="text-slate text-base mt-3 leading-relaxed">
            {blurb}
          </p>
        )}
      </header>

      {/* Most popular — ranked top-10 scroller, house eyebrow ON since
          a family page spans many houses. */}
      {topTen.length > 0 && (
        <FragranceScroller
          title="Most popular"
          rows={topTen}
          variant="compact"
          showRank
        />
      )}

      {fragrances.length > 0 ? (
        <section className="mb-6">
          <h2 className="font-display text-2xl mb-4">
            In this family
          </h2>
          <BrowseList kind="family" slug={slug} initialRows={fragrances} total={total} />
        </section>
      ) : (
        <section className="mb-6 rounded-xl border border-dashed border-ink/15 p-6 text-center">
          <p className="text-sm text-slate leading-relaxed">
            Nothing tagged with this family in our catalog yet. Try{" "}
            <Link href="/families" className="text-emerald underline underline-offset-2">
              another family
            </Link>{" "}
            or{" "}
            <Link href="/search" className="text-emerald underline underline-offset-2">
              search by name
            </Link>
            .
          </p>
        </section>
      )}
    </article>
  );
}

// /family/[slug] — encyclopedia entry for a fragrance family.
//
// Header pulls from FAMILY_BLURB (curated, small set). Body is the
// catalog list of every fragrance whose family[] includes this slug,
// ordered by popularity.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/admin";
import { FAMILY_BLURB, familyName, familySlug } from "@/lib/families";
import type { Fragrance } from "@/lib/types";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const name = familyName(params.slug);
  const blurb = FAMILY_BLURB[params.slug.toLowerCase()];
  return {
    title: `${name} fragrances · Spritz`,
    description: blurb
      ? `${blurb} Every ${name.toLowerCase()} fragrance in the Spritz encyclopedia.`
      : `${name} fragrances in the Spritz encyclopedia.`,
  };
}

export default async function FamilyPage({
  params,
}: {
  params: { slug: string };
}) {
  const slug = familySlug(params.slug);

  const supabase = createAdminClient();
  const { data: rows } = await supabase.rpc("find_fragrances_by_family", {
    p_family: slug,
    p_limit: 100,
  });

  const fragrances = (rows ?? []) as Fragrance[];

  // No matches AND no blurb → 404. Otherwise render whatever we have.
  if (fragrances.length === 0 && !FAMILY_BLURB[slug]) notFound();

  const name = familyName(slug);
  const blurb = FAMILY_BLURB[slug];

  return (
    <article className="mx-auto max-w-md px-6 py-10">
      {/* Crumb */}
      <p className="mb-4">
        <Link
          href="/families"
          className="font-mono text-xs uppercase tracking-widest text-slate hover:text-ink"
        >
          ← All families
        </Link>
      </p>

      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          Family
          {fragrances.length > 0 && (
            <span> · {fragrances.length} fragrance{fragrances.length === 1 ? "" : "s"}</span>
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

      {fragrances.length > 0 ? (
        <section className="mb-10">
          <h2 className="font-display text-2xl mb-4">
            In this family
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
                    {/* House rendered as plain text (not a nested Link)
                        because nested <a> tags are invalid HTML and the
                        Server-Component onClick handler that previously
                        tried to gate them crashed the page with
                        "Event handlers cannot be passed to Client
                        Component props." Two-tap path to the house page:
                        tap card → fragrance detail → house link in
                        the header. */}
                    <div className="text-xs text-slate truncate">
                      {f.house}
                      {f.year ? ` · ${f.year}` : ""}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="mb-10 rounded-xl border border-dashed border-ink/15 p-6 text-center">
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

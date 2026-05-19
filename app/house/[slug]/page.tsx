// /house/[slug] — encyclopedia entry for a perfume house.
//
// Top: editorial story from editorial/houses/<slug>.md (history, style,
// founder, country, link out to official site).
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
import type { Fragrance } from "@/lib/types";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const house = await loadHouse(params.slug);
  if (!house) return { title: "House not found · Spritz" };
  return {
    title: `${house.name} · Spritz`,
    description: house.body.split("\n").slice(0, 2).join(" ").slice(0, 160),
  };
}

export default async function HousePage({ params }: { params: { slug: string } }) {
  const house = await loadHouse(params.slug);

  // Pull catalog rows even when we don't have editorial — a house can
  // exist in the catalog without an editorial entry.
  const supabase = createAdminClient();
  const { data: rows } = await supabase.rpc("find_fragrances_by_house", {
    p_slug: params.slug,
    p_limit: 200,
  });

  if (!house && (!rows || rows.length === 0)) notFound();

  const fragrances = (rows ?? []) as Fragrance[];
  const displayName = house?.name ?? fragrances[0]?.house ?? params.slug;

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
                  className="flex items-center gap-3 px-3 py-2 rounded-xl border border-ink/10 hover:bg-ink/5 transition"
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

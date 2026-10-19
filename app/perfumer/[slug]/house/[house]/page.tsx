// /perfumer/[slug]/house/[house] — one perfumer's work for one house.
//
// Reached from the house pills on /perfumer/[slug]. Shows only the
// fragrances this nose made for this house, then hands off to the house's
// full catalog at the bottom. Same Pro gate and the same data as the
// perfumer page (perfumerFragrances), filtered by house slug, so the pill
// count and this page's count always agree.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { perfumerBySlug, perfumerFragrances } from "@/lib/perfumers";
import { canonicalHouseSlug, houseSlug } from "@/lib/slugs";
import { BottleImage } from "@/components/bottle-image";
import { createAdminClient } from "@/lib/supabase/admin";
import { catalogHouseBySlug } from "@/lib/search-houses";
import { isProUser } from "@/lib/entitlement";
import { ProLocked } from "@/components/pro-locked";

export const dynamic = "force-dynamic";

type Params = { slug: string; house: string };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await perfumerBySlug(params.slug);
  if (!p) return { title: "Perfumer not found" };
  return {
    title: `${p.name} for ${params.house.replace(/-/g, " ")}`,
    description: `Fragrances by perfumer ${p.name} for one house, on Spritz Pro.`,
    alternates: { canonical: `/perfumer/${p.slug}/house/${canonicalHouseSlug(params.house)}` },
  };
}

export default async function PerfumerHousePage({ params }: { params: Params }) {
  const [p, pro] = await Promise.all([perfumerBySlug(params.slug), isProUser()]);
  if (!p) notFound();

  const target = canonicalHouseSlug(params.house);

  if (!pro) {
    return (
      <article className="mx-auto max-w-md px-6 py-10">
        <p className="mb-4">
          <Link
            href={`/perfumer/${p.slug}`}
            className="font-mono text-xs uppercase tracking-widest text-slate hover:text-ink"
          >
            ← {p.name}
          </Link>
        </p>
        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest text-slate">Perfumer</p>
          <h1 className="font-display text-5xl mt-2 leading-[0.95]">{p.name}</h1>
        </header>
        <ProLocked
          body={`See what ${p.name} has created for each house they've worked with. Pro feature.`}
        />
      </article>
    );
  }

  const [all, catalogHouse] = await Promise.all([
    perfumerFragrances(p),
    catalogHouseBySlug(target, createAdminClient()),
  ]);
  const fragrances = all.filter((f) => canonicalHouseSlug(houseSlug(f.house)) === target);
  if (fragrances.length === 0) notFound();

  // Display name as stored in the catalog, not the slug.
  const houseName = fragrances[0].house;
  const houseHref = `/house/${target}`;

  return (
    <article className="mx-auto max-w-md px-6 py-10">
      <p className="mb-4">
        <Link
          href={`/perfumer/${p.slug}`}
          className="font-mono text-xs uppercase tracking-widest text-slate hover:text-ink"
        >
          ← {p.name}
        </Link>
      </p>

      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          Perfumer · {fragrances.length} fragrance{fragrances.length === 1 ? "" : "s"}
        </p>
        <h1 className="font-display text-5xl mt-2 leading-[0.95]">{houseName}</h1>
        <p className="mt-3 text-sm text-slate">By {p.name}</p>
      </header>

      <section className="mb-8">
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

      {/* Hand-off to the whole house: the one thing left to do here. */}
      <Link
        href={houseHref}
        className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-paper border border-ink/10 hover:brightness-95 transition"
      >
        <span className="font-medium">Browse all of {houseName}</span>
        <span className="font-mono text-xs text-slate shrink-0">
          {catalogHouse && catalogHouse.count > fragrances.length
            ? `${catalogHouse.count} fragrances →`
            : "→"}
        </span>
      </Link>

      <p className="mt-8 text-xs text-slate leading-relaxed">
        Each fragrance is listed under its lead perfumer. Work co-authored with
        another nose may appear on their page instead.
      </p>
    </article>
  );
}

// /houses — index of every perfume house we have either an editorial for
// or any catalog rows from. Editorial houses get a "with a story" badge,
// catalog-only houses are listed plainly.
//
// Two data sources unioned:
//   1. Editorial files in /editorial/houses/ — gives us the "with a story"
//      set with founder, country, founded year.
//   2. list_catalog_houses RPC — every distinct house name appearing in
//      the catalog with a fragrance count.
// Catalog data wins on count. Editorial data wins on display fields.

import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAllHouses, houseSlug } from "@/lib/houses";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Houses · Spritz",
  description:
    "Every perfume house in our encyclopedia. Tom Ford, Chanel, Dior, Maison Margiela, Lattafa, and the rest of the catalog.",
};

interface DisplayHouse {
  slug: string;
  name: string;
  count: number;
  hasEditorial: boolean;
  country?: string;
  founded?: number;
}

export default async function HousesIndexPage() {
  const editorialHouses = await loadAllHouses();
  const editorialBySlug = new Map(editorialHouses.map((h) => [h.slug, h]));

  const supabase = createAdminClient();
  const { data: catalogHouses } = await supabase.rpc("list_catalog_houses", {
    p_limit: 500,
  });

  // Merge: every catalog house gets a row. Augment with editorial fields
  // where we have them. Editorial houses with zero catalog rows still
  // show up (so users browsing the index can see what we've written about
  // even before the catalog catches up).
  const merged = new Map<string, DisplayHouse>();

  for (const c of catalogHouses ?? []) {
    const slug = c.slug;
    const ed = editorialBySlug.get(slug);
    merged.set(slug, {
      slug,
      name: ed?.name ?? c.house,
      count: c.fragrance_count,
      hasEditorial: !!ed,
      country: ed?.country,
      founded: ed?.founded,
    });
  }

  for (const ed of editorialHouses) {
    if (merged.has(ed.slug)) continue;
    merged.set(ed.slug, {
      slug: ed.slug,
      name: ed.name,
      count: 0,
      hasEditorial: true,
      country: ed.country,
      founded: ed.founded,
    });
  }

  // Sort: editorial houses first (the curated ones), then everything else
  // by catalog count descending. Within editorial, alpha.
  const houses = Array.from(merged.values()).sort((a, b) => {
    if (a.hasEditorial !== b.hasEditorial) {
      return a.hasEditorial ? -1 : 1;
    }
    if (a.hasEditorial) return a.name.localeCompare(b.name);
    return b.count - a.count;
  });

  const editorialCount = houses.filter((h) => h.hasEditorial).length;
  const catalogOnly = houses.filter((h) => !h.hasEditorial);

  return (
    <article className="mx-auto max-w-md px-6 py-10">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          Encyclopedia · {houses.length} houses
        </p>
        <h1 className="font-display text-5xl mt-2 leading-[0.95]">
          The houses
        </h1>
        <p className="text-slate text-base mt-3 max-w-xs leading-relaxed">
          Founders, countries, signatures, and every bottle they make.
        </p>
      </header>

      {/* Editorial houses — the ones with a written story */}
      {editorialCount > 0 && (
        <section className="mb-10">
          <h2 className="font-display text-2xl mb-1">With a story</h2>
          <p className="text-sm text-slate mb-4">
            Houses we&apos;ve written history, style, and signature notes for.
          </p>
          <ul className="space-y-2">
            {houses
              .filter((h) => h.hasEditorial)
              .map((h) => (
                <li key={h.slug}>
                  <Link
                    href={`/house/${h.slug}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-ink/10 hover:bg-ink/5 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-lg leading-tight">{h.name}</div>
                      <div className="text-xs text-slate mt-1">
                        {[h.country, h.founded ? `est. ${h.founded}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <span className="font-mono text-xs text-slate shrink-0">
                      {h.count > 0 ? `${h.count}` : "—"}
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* Catalog-only houses — present in the catalog but no editorial yet */}
      {catalogOnly.length > 0 && (
        <section className="mb-10">
          <h2 className="font-display text-2xl mb-1">Also in the catalog</h2>
          <p className="text-sm text-slate mb-4">
            Houses with fragrances in our database — editorial coming.
          </p>
          <ul className="flex flex-wrap gap-2">
            {catalogOnly.slice(0, 60).map((h) => (
              <li key={h.slug}>
                <Link
                  href={`/house/${h.slug}`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-paper hover:bg-brass/40 text-ink text-sm rounded-full transition"
                >
                  <span>{h.name}</span>
                  <span className="font-mono text-[10px] text-slate">
                    {h.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {catalogOnly.length > 60 && (
            <p className="mt-4 text-xs font-mono uppercase tracking-widest text-slate">
              + {catalogOnly.length - 60} more — refine via search
            </p>
          )}
        </section>
      )}
    </article>
  );
}

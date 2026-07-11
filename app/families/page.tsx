// /families — index of every family in the catalog.
//
// Two data sources unioned: the curated FAMILY_BLURB map (so editorial
// families surface even if zero catalog rows yet match them) and the
// list_catalog_families RPC (so unexpected families don't fall through
// the cracks). Catalog count is authoritative when present.

import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { FAMILY_ORDER, FAMILY_BLURB, familyName } from "@/lib/families";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Families",
  description:
    "Browse fragrances by family: citrus, floral, woody, oriental, gourmand, leather, and beyond. The shape of the bottle in one word.",
};

interface DisplayFamily {
  slug: string;
  name: string;
  blurb?: string;
  count: number;
}

export default async function FamiliesIndexPage() {
  const supabase = createAdminClient();
  const { data: catalog } = await supabase.rpc("list_catalog_families", {
    p_limit: 200,
  });

  // Merge: every catalog family + every editorial family.
  const merged = new Map<string, DisplayFamily>();

  for (const c of catalog ?? []) {
    merged.set(c.family, {
      slug: c.family,
      name: familyName(c.family),
      blurb: FAMILY_BLURB[c.family],
      count: c.fragrance_count,
    });
  }

  // Editorial families that don't have any catalog rows yet still appear,
  // just with count 0. Keeps the library complete instead of having
  // gaps appear and disappear as the catalog grows.
  for (const slug of Object.keys(FAMILY_BLURB)) {
    if (merged.has(slug)) continue;
    merged.set(slug, {
      slug,
      name: familyName(slug),
      blurb: FAMILY_BLURB[slug],
      count: 0,
    });
  }

  // Sort using FAMILY_ORDER for editorial families (preserves the
  // curated reading order), then everything else by descending count.
  const ordered: DisplayFamily[] = [
    ...FAMILY_ORDER.map((slug) => merged.get(slug)).filter(
      (x): x is DisplayFamily => !!x,
    ),
    ...Array.from(merged.values())
      .filter((f) => !FAMILY_ORDER.includes(f.slug))
      .sort((a, b) => b.count - a.count),
  ];

  return (
    <article className="mx-auto max-w-md px-6 py-10">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          Library · {ordered.length} families
        </p>
        <h1 className="font-display text-5xl mt-2 leading-[0.95]">
          The families
        </h1>
        <p className="text-slate text-base mt-3 max-w-xs leading-relaxed">
          The shape of the bottle in one word. Citrus, floral, woody, leather,
          gourmand, and the rest.
        </p>
      </header>

      <ul className="space-y-2">
        {ordered.map((f) => (
          <li key={f.slug}>
            <Link
              href={`/family/${f.slug}`}
              className="flex items-baseline justify-between gap-3 px-4 py-3 rounded-xl bg-paper border border-ink/10 hover:brightness-95 transition"
            >
              <div className="min-w-0 flex-1">
                <div className="font-display text-xl capitalize leading-tight">
                  {f.name}
                </div>
                {f.blurb && (
                  <div className="text-xs text-slate mt-1 leading-relaxed">
                    {f.blurb}
                  </div>
                )}
              </div>
              <span className="font-mono text-xs text-slate shrink-0">
                {f.count > 0 ? f.count : "0"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}

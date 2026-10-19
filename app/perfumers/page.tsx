// /perfumers — index of every credited perfumer in the catalog.
//
// Two ways in, because people look for noses two different ways:
//   1. "The names you know" — the perfumers behind the catalog's most
//      popular fragrances (Kurkdjian, Polge, Morillas). Ranked by the best
//      popularity rank of anything they made, not by volume, since a
//      prolific mass-market nose is not who most people are looking for.
//   2. A–Z by surname — perfumers are referred to by surname ("an Ellena
//      fragrance"), so that is the index order.

import type { Metadata } from "next";
import Link from "next/link";
import { listPerfumers, type PerfumerSummary } from "@/lib/perfumers";
import { isProUser } from "@/lib/entitlement";
import { ProLocked } from "@/components/pro-locked";

// Pro-gated per request, so this page can't be ISR-cached. The perfumer
// list itself is still cached for an hour inside listPerfumers().
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Perfumers",
  description:
    "Every perfumer in the Spritz library. Francis Kurkdjian, Jacques Polge, Alberto Morillas, Dominique Ropion and the rest of the noses behind the bottles.",
};

/** How many perfumers lead the page in the "names you know" block. */
const FEATURED = 20;

/** Surname for A–Z ordering: last word of the name, ignoring parentheses
 *  ("Daniela (Roche) Andrier" -> "Andrier"). */
function surname(name: string): string {
  const words = name.replace(/\([^)]*\)/g, " ").trim().split(/\s+/);
  return words[words.length - 1] ?? name;
}

function letterOf(name: string): string {
  const c = surname(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .charAt(0)
    .toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

export default async function PerfumersIndexPage() {
  const [all, pro] = await Promise.all([listPerfumers(), isProUser()]);

  // Free and signed-out visitors get the header and the count, never the
  // names: the index is the browse path into every credit.
  if (!pro) {
    return (
      <article className="mx-auto max-w-md px-6 py-10">
        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest text-slate">
            Library · {all.length} perfumers
          </p>
          <h1 className="font-display text-5xl mt-2 leading-[0.95]">The perfumers</h1>
        </header>
        <ProLocked
          body={`Browse ${all.length.toLocaleString()} perfumers and everything each of them has made. See who created the fragrances you love, then find what else they've done. Pro feature.`}
        />
      </article>
    );
  }

  const featured = all
    .filter((p) => p.bestRank != null)
    .sort((a, b) => (a.bestRank as number) - (b.bestRank as number))
    .slice(0, FEATURED);

  const byLetter = new Map<string, PerfumerSummary[]>();
  for (const p of all) {
    const l = letterOf(p.name);
    const list = byLetter.get(l);
    if (list) list.push(p);
    else byLetter.set(l, [p]);
  }
  const letters = [...byLetter.keys()].sort((a, b) =>
    a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b),
  );
  for (const l of letters) {
    byLetter.get(l)!.sort((a, b) => surname(a.name).localeCompare(surname(b.name)));
  }

  return (
    <article className="mx-auto max-w-md px-6 py-10">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          Library · {all.length} perfumers
        </p>
        <h1 className="font-display text-5xl mt-2 leading-[0.95]">The perfumers</h1>
        <p className="text-slate text-base mt-3 max-w-xs leading-relaxed">
          The noses behind the bottles, and everything each of them has made.
        </p>
      </header>

      {featured.length > 0 && (
        <section className="mb-10">
          <h2 className="font-display text-2xl mb-1">The names you know</h2>
          <p className="text-sm text-slate mb-4">
            Behind the most popular fragrances in the library.
          </p>
          <ul className="space-y-2">
            {featured.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/perfumer/${p.slug}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-paper border border-ink/10 hover:brightness-95 transition"
                >
                  <span className="font-display text-lg leading-tight truncate">{p.name}</span>
                  <span className="font-mono text-xs text-slate shrink-0">{p.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-10">
        <h2 className="font-display text-2xl mb-4">A to Z</h2>

        {/* Jump row. Native anchors, so it works with JS off. */}
        <nav aria-label="Jump to letter" className="flex flex-wrap gap-x-3 gap-y-1 mb-6">
          {letters.map((l) => (
            <a
              key={l}
              href={`#letter-${l}`}
              className="font-mono text-xs text-slate hover:text-ink"
            >
              {l}
            </a>
          ))}
        </nav>

        <div className="space-y-6">
          {letters.map((l) => (
            <div key={l} id={`letter-${l}`} className="scroll-mt-20">
              <h3 className="font-mono text-xs uppercase tracking-widest text-slate mb-2">{l}</h3>
              <ul className="flex flex-wrap gap-2">
                {byLetter.get(l)!.map((p) => (
                  <li key={p.slug}>
                    <Link
                      href={`/perfumer/${p.slug}`}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-paper hover:bg-brass/40 text-ink text-sm rounded-full transition"
                    >
                      <span>{p.name}</span>
                      <span className="font-mono text-[10px] text-slate">{p.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

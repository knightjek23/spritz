"use client";

// Search page — typeahead dropdown is the primary affordance, but a full
// "all results" list still renders below for users who Enter through the
// suggestions or want to scan the long-tail matches.
//
// useSearchParams() is wrapped in <Suspense> per Next 14 App Router build
// requirements (CSR bailout otherwise breaks static generation).

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { cleanBottleImageUrl } from "@/lib/bottle-image";
import { BottleImage } from "@/components/bottle-image";
import { SearchAutocomplete } from "@/components/search-autocomplete";
import type { Fragrance } from "@/lib/types";
import type { KeywordHit, SearchResponse, SearchTerm } from "@/lib/search-terms";
import type { HouseHit } from "@/lib/search-houses";
import { SpritzLoader } from "@/components/spritz-loader";

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchSkeleton />}>
      <SearchPageInner />
    </Suspense>
  );
}

function SearchSkeleton() {
  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <h1 className="font-display text-3xl mb-6">Search</h1>
      <div className="h-12 rounded-xl bg-paper animate-pulse" />
    </div>
  );
}

function SearchPageInner() {
  const params = useSearchParams();
  const initialQ = params.get("q") ?? "";

  const [q, setQ] = useState(initialQ);
  const [submittedQ, setSubmittedQ] = useState(initialQ);
  const [results, setResults] = useState<Fragrance[]>([]);
  // Keyword mode: set when every word of the query is a known note or
  // family. byTerms is popularity-ordered, most terms matched first.
  const [terms, setTerms] = useState<SearchTerm[] | null>(null);
  const [byTerms, setByTerms] = useState<KeywordHit[]>([]);
  // House rows: the query is typing a house name. Rendered first.
  const [houses, setHouses] = useState<HouseHit[]>([]);
  const [busy, setBusy] = useState(false);

  // Run the full search whenever the user explicitly submits (Enter / "See
  // all results"). The dropdown handles incremental fetches itself.
  useEffect(() => {
    const trimmed = submittedQ.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setTerms(null);
      setByTerms([]);
      setHouses([]);
      return;
    }
    let cancelled = false;
    setBusy(true);
    fetch(`/api/search?q=${encodeURIComponent(trimmed)}&full=1`)
      .then((r) => r.json())
      .then((data: SearchResponse) => {
        if (cancelled) return;
        setResults((data.results ?? []) as unknown as Fragrance[]);
        const keyword = data.terms && (data.byTerms ?? []).length > 0;
        setTerms(keyword ? data.terms : null);
        setByTerms(keyword ? data.byTerms : []);
        setHouses(data.houses ?? []);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [submittedQ]);

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <h1 className="font-display text-3xl mb-6">Search</h1>

      <div className="mb-8">
        <SearchAutocomplete
          initialQuery={initialQ}
          autoFocus
          onQueryChange={setQ}
          onSubmit={setSubmittedQ}
        />
      </div>

      {busy && submittedQ && (
        <div role="status" aria-live="polite" className="flex items-center gap-3 mb-4">
          <SpritzLoader size={36} label="" />
          <p className="text-slate text-sm">Searching…</p>
        </div>
      )}

      {/* House match: "xerjoff" → the Xerjoff library page. */}
      {submittedQ && !busy && houses.length > 0 && (
        <section className="mb-6">
          <p className="font-mono text-xs uppercase tracking-widest text-slate mb-3">
            {houses.length === 1 ? "House" : "Houses"}
          </p>
          <ul className="space-y-2">
            {houses.map((h) => (
              <li key={h.slug}>
                <Link
                  href={`/house/${h.slug}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl bg-paper border border-ink/10 hover:brightness-95 transition"
                >
                  <div className="shrink-0 w-12 h-16 flex items-center justify-center">
                    <span className="w-10 h-10 flex items-center justify-center border border-ink/15 font-serif text-xl text-ink">
                      {h.name.trim().charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{h.name}</div>
                    <div className="text-xs text-slate truncate">
                      {h.count} fragrance{h.count === 1 ? "" : "s"}
                    </div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-slate">
                    <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Keyword results: most popular fragrances carrying the typed
          notes / families. Sits above the name matches. */}
      {submittedQ && !busy && terms && byTerms.length > 0 && (
        <section className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest text-slate mb-3">
            Most popular with {terms.map((t) => t.label).join(" · ")}
          </p>
          <ul className="space-y-2">
            {byTerms.map((f) => (
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
                      {f.house}
                      {f.year ? ` · ${f.year}` : ""}
                    </div>
                    {terms.length > 1 && (
                      // Which of the typed terms this bottle carries.
                      <div className="mt-1 flex flex-wrap gap-1">
                        {terms.map((t) => {
                          const hit = f.matched.includes(t.key);
                          return (
                            <span
                              key={t.key}
                              className={`font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 border ${
                                hit
                                  ? "border-emerald/40 text-emerald"
                                  : "border-ink/10 text-slate/60 line-through"
                              }`}
                            >
                              {t.label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {submittedQ && !busy && results.length > 0 && (
        <p className="font-mono text-xs uppercase tracking-widest text-slate mb-3">
          {terms
            ? `Fragrances named like "${submittedQ}"`
            : `${results.length} result${results.length === 1 ? "" : "s"} for "${submittedQ}"`}
        </p>
      )}

      {submittedQ && !busy && results.length === 0 && byTerms.length === 0 && houses.length === 0 && (
        <p className="text-sm text-slate">
          No matches in our catalog yet. Try a different brand, or notes like
          &ldquo;musk, iris, citrus&rdquo;.
        </p>
      )}

      <ul className="space-y-2">
        {results.map((f) => (
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
                  {f.house}
                  {f.year ? ` · ${f.year}` : ""}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* Helper hint — only when the user hasn't submitted yet */}
      {!submittedQ && q.trim().length < 2 && (
        <p className="text-xs text-slate font-mono uppercase tracking-widest">
          Start typing to see suggestions
        </p>
      )}
    </div>
  );
}

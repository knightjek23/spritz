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
import Image from "next/image";
import { SearchAutocomplete } from "@/components/search-autocomplete";
import type { Fragrance } from "@/lib/types";

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
  const [busy, setBusy] = useState(false);

  // Run the full search whenever the user explicitly submits (Enter / "See
  // all results"). The dropdown handles incremental fetches itself.
  useEffect(() => {
    const trimmed = submittedQ.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setBusy(true);
    fetch(`/api/search?q=${encodeURIComponent(trimmed)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setResults(data.results ?? []);
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
        <p className="text-slate text-sm mb-4">Searching…</p>
      )}

      {submittedQ && !busy && results.length > 0 && (
        <p className="font-mono text-xs uppercase tracking-widest text-slate mb-3">
          {results.length} result{results.length === 1 ? "" : "s"} for &ldquo;{submittedQ}&rdquo;
        </p>
      )}

      {submittedQ && !busy && results.length === 0 && (
        <p className="text-sm text-slate">
          No matches in our catalog yet. Try a different brand or note.
        </p>
      )}

      <ul className="space-y-2">
        {results.map((f) => (
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

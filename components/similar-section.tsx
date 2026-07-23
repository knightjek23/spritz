"use client";

// "Similar fragrances" — collapsed by default, opt-in discovery.
// PRD §6 P0.5 + §8: same engine as before, reframed.
// - Header: "If you like this, explore" (NOT "cheaper alternatives")
// - No price delta. No Buy CTA on items. Click → goes to that fragrance's detail page.
// - Lead each row with the SHARED notes — that's the educational hook.

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { cleanBottleImageUrl } from "@/lib/bottle-image";
import type { DupeResult } from "@/lib/types";

export function SimilarSection({ fragranceId }: { fragranceId: string }) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<DupeResult[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function expand() {
    setOpen((v) => !v);
    if (loaded) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/dupes/${fragranceId}`);
      const data = await res.json();
      setResults(data.results ?? []);
      setTruncated(Boolean(data.truncated));
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={expand}
        className="w-full flex items-center justify-between text-left py-2"
      >
        <div>
          <h2 className="font-display text-xl">If you like this, explore</h2>
          <p className="text-xs text-slate mt-1">
            Other fragrances that share notes and family
          </p>
        </div>
        <span className="font-mono text-xs text-slate ml-4">
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div className="mt-4">
          {loading && <p className="text-sm text-slate">Looking for siblings…</p>}

          {loaded && results.length === 0 && (
            <p className="text-sm text-slate">
              No close matches in our catalog yet.
            </p>
          )}

          <ul className="space-y-2">
            {results.map((d) => (
              <li key={d.fragrance.id}>
                <Link
                  href={`/fragrance/${d.fragrance.id}`}
                  className="flex items-start gap-3 px-3 py-3 rounded-xl bg-paper border border-ink/10 hover:brightness-95 transition"
                >
                  {cleanBottleImageUrl(d.fragrance.bottle_image_url) ? (
                    <div className="shrink-0 w-12 h-16 relative">
                      <Image
                        src={cleanBottleImageUrl(d.fragrance.bottle_image_url)!}
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
                    <div className="font-medium truncate">{d.fragrance.name}</div>
                    <div className="text-xs text-slate mt-0.5 truncate">
                      {d.fragrance.house}
                    </div>
                    {d.shared_notes.length > 0 && (
                      <div className="text-xs text-ink/70 mt-2">
                        <span className="text-slate">shares </span>
                        {d.shared_notes.join(", ")}
                      </div>
                    )}
                    <div className="font-mono text-xs text-slate mt-1">
                      {d.similarity_pct}% match
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {truncated && (
            <p className="text-sm text-slate mt-4">
              Showing 5 of many.{" "}
              <Link href="/pricing" className="text-emerald underline underline-offset-2">
                Pro unlocks 25
              </Link>
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}

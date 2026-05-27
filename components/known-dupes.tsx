"use client";

// Curated + AI dupes section. Editorial layer, not algorithmic similarity.
//
// Three render states:
// 1. Curated/AI dupes already exist on the row → render them with source badges
// 2. No dupes exist + user is Pro → show "Generate dupes with AI" button
// 3. No dupes exist + user is free or signed-out → show Pro upsell
//
// Designed to be informational, not pushy — each dupe explains the relationship.

import { useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import type { DupeRecommendation } from "@/lib/types";

const TIER_LABEL: Record<string, string> = {
  budget: "budget",
  mid: "mid-range",
  designer: "designer",
  niche: "niche",
};

const SIMILARITY_PILL: Record<string, string> = {
  "very close": "bg-brass text-ink",
  close: "bg-brass/40 text-ink",
  "inspired by": "bg-paper text-ink",
};

export function KnownDupes({
  fragranceId,
  initialDupes,
}: {
  fragranceId: string;
  initialDupes: DupeRecommendation[] | null | undefined;
}) {
  // isLoaded gates the Pro-only branch so SSR and the first client render
  // produce identical output. Without it, the server renders the upsell
  // (Clerk has no user yet) and the client briefly renders the AI button
  // (Clerk knows the user), which React reports as a hydration mismatch
  // and can unmount the entire section. Treating "not loaded yet" as the
  // safe-default upsell path keeps the markup stable.
  const { isLoaded, isSignedIn, user } = useUser();
  const isPro = user?.publicMetadata?.plan === "pro"; // optimistic — server is authoritative
  const [dupes, setDupes] = useState<DupeRecommendation[]>(initialDupes ?? []);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/dupes/ai/${fragranceId}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402) setError("Pro required");
        else if (res.status === 401) setError("Please sign in");
        else setError(data.error ?? "Failed to generate");
        return;
      }
      setDupes(data.dupes ?? []);
      if ((data.dupes ?? []).length === 0) {
        setError("No well-known dupes found for this fragrance.");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  }

  // State: dupes present
  if (dupes.length > 0) {
    return (
      <section className="mb-10">
        <h2 className="font-display text-2xl mb-2">Known dupes</h2>
        <p className="text-sm text-slate mb-4">
          Fragrances the community references as similar, usually at a lower price point.
          Not exact replicas; close-enough scent profiles for a fraction of the cost.
        </p>
        <ul className="space-y-3">
          {dupes.map((d, i) => (
            <li
              key={`${d.house}-${d.name}-${i}`}
              className="rounded-xl border border-ink/10 px-4 py-3 bg-cream/40"
            >
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <div className="min-w-0">
                  <p className="font-mono text-xs uppercase tracking-widest text-slate">
                    {d.house}
                  </p>
                  <p className="font-display text-lg leading-tight truncate">{d.name}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {d.similarity && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider ${SIMILARITY_PILL[d.similarity] ?? "bg-paper text-ink"}`}
                    >
                      {d.similarity}
                    </span>
                  )}
                  {d.price_tier && (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-slate">
                      {TIER_LABEL[d.price_tier] ?? d.price_tier}
                    </span>
                  )}
                </div>
              </div>
              {d.note && (
                <p className="text-sm text-ink/80 leading-relaxed mt-2">{d.note}</p>
              )}
              {/* Source badge — small, tucked at the bottom */}
              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-ink/5">
                {d.source === "editorial" && (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-slate">
                    · curated
                  </span>
                )}
                {d.source === "ai" && (
                  <>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-emerald">
                      · AI generated
                    </span>
                    {typeof d.confidence === "number" && (
                      <span className="font-mono text-[10px] text-slate">
                        {Math.round(d.confidence * 100)}% confidence
                      </span>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  // State: no dupes, signed-in Pro user. Gated on isLoaded so this branch
  // never wins during the initial render — prevents the hydration flash
  // (and the unmount that can follow it) when Clerk resolves a beat after
  // first paint.
  if (isLoaded && isSignedIn && isPro) {
    return (
      <section className="mb-10">
        <h2 className="font-display text-2xl mb-2">Known dupes</h2>
        <p className="text-sm text-slate mb-4">
          We don&apos;t have curated dupes for this fragrance yet. Generate them with AI?
        </p>
        <button
          onClick={generate}
          disabled={generating}
          className="w-full px-4 py-3 rounded-xl bg-ink text-cream font-medium hover:bg-ink/90 disabled:opacity-60 transition"
        >
          {generating ? "Generating dupes…" : "Generate dupes with AI"}
        </button>
        {error && <p className="text-sm text-burgundy mt-3">{error}</p>}
      </section>
    );
  }

  // State: no dupes, free or signed-out user → Pro upsell
  return (
    <section className="mb-10">
      <h2 className="font-display text-2xl mb-2">Known dupes</h2>
      <p className="text-sm text-slate mb-4">
        AI-generated dupes are a Pro feature. Get community-recognized dupes for any
        fragrance, instantly.
      </p>
      <Link
        href="/pricing"
        className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-brass text-ink font-medium hover:bg-brass/80 transition"
      >
        Unlock with Pro
      </Link>
    </section>
  );
}

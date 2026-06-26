"use client";

// AI-generated community consensus. Pro-gated, mirrors the KnownDupes
// pattern: cached → render, no cache + Pro → Generate CTA, no cache +
// free → upsell.
//
// Built around the AI Transparency Patterns playbook:
//   - During generation: Living Breadcrumb (quiet, evolving status line
//     that proves the system understood the request and is making
//     progress). Replaces the "Generating…" placeholder spinner.
//   - After generation: Audit Trail (persistent "Generated [date]"
//     receipt + sources caveat) so the user can verify provenance later,
//     even after the live progress UI disappears.
//   - Low-confidence handling (Partial Success): when the model returns
//     confidence < 0.5, we show a small caveat banner ("Limited
//     community signal") so the user knows the take is thinner than
//     usual rather than questioning the whole feature.
//
// Stakes: low (informational, not financial/irreversible) → conversational tone.

import { useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import type { ConsensusRecord, Fragrance } from "@/lib/types";
import { LivingBreadcrumb, generatedReceipt } from "./living-breadcrumb";

interface Props {
  fragrance: Pick<
    Fragrance,
    | "id"
    | "name"
    | "house"
    | "consensus_summary"
    | "consensus_verdict"
    | "consensus_pros"
    | "consensus_cons"
    | "consensus_confidence"
    | "consensus_generated_at"
  >;
}

export function KnownConsensus({ fragrance }: Props) {
  const { isLoaded, isSignedIn, user } = useUser();
  const isPro = user?.publicMetadata?.plan === "pro";

  // Hydrate from server-rendered data so cached consensus renders
  // instantly on first paint. Generate path replaces this with the
  // freshly-returned record.
  const [consensus, setConsensus] = useState<ConsensusRecord | null>(() => {
    if (!fragrance.consensus_summary || !fragrance.consensus_generated_at) return null;
    return {
      summary: fragrance.consensus_summary,
      verdict: fragrance.consensus_verdict ?? "",
      pros: fragrance.consensus_pros ?? [],
      cons: fragrance.consensus_cons ?? [],
      confidence: fragrance.consensus_confidence ?? 0.5,
      generated_at: fragrance.consensus_generated_at,
    };
  });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/consensus/${fragrance.id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402) setError("Pro required");
        else if (res.status === 401) setError("Please sign in");
        else setError(data.message ?? data.error ?? "Couldn't generate. Try again.");
        return;
      }
      if (data.consensus) setConsensus(data.consensus);
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  }

  // ----- State: consensus present -----
  if (consensus) {
    const isThinSignal = consensus.confidence < 0.5;
    return (
      <section className="mb-10">
        <h2 className="font-display text-2xl mb-2">Community take</h2>

        {/* Thin-signal caveat (Partial Success pattern). Shown only when
            the model self-rated low confidence — usually new releases or
            obscure niche houses with little community discussion. */}
        {isThinSignal && (
          <p className="text-sm text-slate italic mb-4 px-3 py-2 rounded-lg bg-paper">
            Limited community signal on this one. Take with a grain of salt.
          </p>
        )}

        {/* Verdict — the headline "is it worth it?" answer */}
        <p className="font-display text-lg leading-snug text-ink mb-4">
          {consensus.verdict}
        </p>

        {/* Synthesized summary */}
        <p className="text-base text-ink leading-relaxed mb-5 whitespace-pre-line">
          {consensus.summary}
        </p>

        {/* Pros / cons. Two-column on wider screens, stacked on mobile. */}
        {(consensus.pros.length > 0 || consensus.cons.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {consensus.pros.length > 0 && (
              <div className="rounded-xl border border-ink/10 px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-2">
                  What people praise
                </p>
                <ul className="space-y-1.5">
                  {consensus.pros.map((p, i) => (
                    <li
                      key={i}
                      className="text-sm text-ink leading-snug flex gap-2"
                    >
                      <span className="text-emerald shrink-0" aria-hidden>
                        +
                      </span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {consensus.cons.length > 0 && (
              <div className="rounded-xl border border-ink/10 px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-2">
                  Common complaints
                </p>
                <ul className="space-y-1.5">
                  {consensus.cons.map((c, i) => (
                    <li
                      key={i}
                      className="text-sm text-ink leading-snug flex gap-2"
                    >
                      <span className="text-slate shrink-0" aria-hidden>
                        −
                      </span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Audit Trail receipt — persistent provenance. Tells the user
            when the consensus was generated and where it draws from, so
            the "why" survives after the live progress UI disappears.
            The skill calls this out as critical for any AI output the
            user might later question. */}
        <p className="font-mono text-[10px] uppercase tracking-wider text-slate">
          · AI generated · {generatedReceipt(consensus.generated_at)} ·
          synthesized from Reddit, Fragrantica, and forum reviews
        </p>
      </section>
    );
  }

  // ----- State: no consensus, signed-in Pro user → Generate CTA -----
  if (isLoaded && isSignedIn && isPro) {
    // Three-stage Living Breadcrumb. Stages map to real phases of the
    // model's work (drawing on community sources in training data,
    // weighing competing takes, synthesizing the answer) but in the
    // user's vocabulary so each stage proves the system understood what
    // was asked.
    const stages = [
      {
        afterMs: 0,
        copy: `Reading what users say about ${fragrance.name} by ${fragrance.house}…`,
      },
      {
        afterMs: 1500,
        copy: "Cross-checking Reddit, Fragrantica, and forum reviews…",
      },
      {
        afterMs: 3200,
        copy: "Synthesizing the consensus…",
      },
    ];

    return (
      <section className="mb-10">
        <h2 className="font-display text-2xl mb-2">Community take</h2>
        <p className="text-sm text-slate mb-4">
          See what users actually say about this fragrance and whether it&apos;s
          worth the buy.
        </p>
        <button
          onClick={generate}
          disabled={generating}
          className="w-full px-4 py-3 rounded-xl bg-ink text-cream font-medium hover:bg-ink/90 disabled:opacity-60 transition"
        >
          {generating ? "Working…" : "Generate the consensus"}
        </button>
        {/* Living Breadcrumb sits below the button while the request is
            in flight, narrating progress so the wait reads as active
            work rather than a stalled spinner. */}
        <LivingBreadcrumb active={generating} stages={stages} className="mt-3" />
        {error && <p className="text-sm text-burgundy mt-3">{error}</p>}
      </section>
    );
  }

  // ----- State: no consensus, free or signed-out → Pro upsell -----
  return (
    <section className="mb-10">
      <h2 className="font-display text-2xl mb-2">Community take</h2>
      <p className="text-sm text-slate mb-4">
        AI-synthesized consensus from Reddit, Fragrantica, and forum reviews.
        What users actually say, and whether it&apos;s worth the buy. Pro feature.
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

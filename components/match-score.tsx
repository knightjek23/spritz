"use client";

// Match score card — "Will I like this?" on the fragrance page.
//
// Per-user, so it hydrates client-side (the page is ISR-cached, see
// SaveButtonsRow). One authenticated GET /api/match/[id] after Clerk
// resolves; the server decides free vs Pro and what to return. The client
// never reads the plan from Clerk metadata (lib/entitlement.ts explains why).
//
// States:
//   signed out      renders nothing (the page stays clean for visitors)
//   loading         a quiet placeholder the size of the final card
//   needs_shelf     "Add N more bottles" with a link to the collection
//   ok (free)       score + label, "n free this week", Pro CTA for the why
//   ok (pro)        score + label + reasons
//   locked          free cap reached → gate with TrialCta
//
// Stakes: low. The score is a hint, phrased as one ("Likely a match"),
// never as a verdict.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { TrialCta } from "@/components/trial-cta";
import { localDay, trackFeatureUsed, trackProGateCta, trackProGateShown } from "@/lib/pro-events";

type Payload =
  | { state: "needs_shelf"; contributing: number; min: number }
  | { state: "locked"; cap: number }
  | {
      state: "ok";
      score: number;
      label: string;
      reasons: string[];
      sharedNotes: string[];
      warningNote: string | null;
      pro: boolean;
      remaining: number | null;
    };

export function MatchScore({ fragranceId, compact = false }: { fragranceId: string; compact?: boolean }) {
  const { isLoaded, isSignedIn } = useUser();
  const [data, setData] = useState<Payload | null | "error">(null);
  const gateTracked = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let live = true;
    fetch(`/api/match/${fragranceId}?day=${localDay()}`)
      .then(async (r) => {
        const body = (await r.json().catch(() => null)) as Payload | null;
        if (!live) return;
        if (!body || (!r.ok && r.status !== 402)) {
          setData("error");
          return;
        }
        setData(body);
        if (body.state === "ok") trackFeatureUsed("match", { pro: body.pro, score: body.score });
      })
      .catch(() => live && setData("error"));
    return () => {
      live = false;
    };
  }, [isLoaded, isSignedIn, fragranceId]);

  useEffect(() => {
    if (!data || data === "error" || gateTracked.current) return;
    if (data.state === "locked" || (data.state === "ok" && !data.pro)) {
      gateTracked.current = true;
      trackProGateShown("match", { state: data.state });
    }
  }, [data]);

  if (!isLoaded || !isSignedIn || data === "error") return null;

  if (!data) {
    return (
      <section aria-busy className={`${compact ? "mb-6" : "mb-10"} border border-ink/10 p-4`}>
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Your match</p>
        <div className="mt-3 h-8 w-28 bg-paper" />
      </section>
    );
  }

  if (data.state === "needs_shelf") {
    const left = Math.max(1, data.min - data.contributing);
    return (
      <section className={`${compact ? "mb-6" : "mb-10"} border border-ink/10 p-4`}>
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Your match</p>
        <p className="mt-2 text-sm text-ink leading-relaxed">
          Add {left} more {left === 1 ? "bottle" : "bottles"} you own or have tried and Spritz will tell you how
          well new fragrances fit your taste.
        </p>
        <Link href="/collection" className="mt-3 inline-block text-sm text-emerald underline underline-offset-4">
          Open my collection
        </Link>
      </section>
    );
  }

  if (data.state === "locked") {
    return (
      <section className={`${compact ? "mb-6" : "mb-10"} border border-ink/10 p-4`}>
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Your match</p>
        <p className="mt-2 text-sm text-ink leading-relaxed">
          You've used your {data.cap} free match scores this week. Pro scores every fragrance you open and tells
          you why.
        </p>
        <div className="mt-3" onClickCapture={() => trackProGateCta("match", { state: "locked" })}>
          <TrialCta />
        </div>
      </section>
    );
  }

  const tone =
    data.score >= 75 ? "text-emerald" : data.score >= 55 ? "text-ink" : data.score >= 35 ? "text-slate" : "text-burgundy";

  return (
    <section className={`${compact ? "mb-6" : "mb-10"} border border-ink/10 p-4`}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Your match</p>
        {!data.pro && data.remaining !== null && (
          <p className="font-mono text-xs uppercase tracking-widest text-slate">
            {data.remaining} free left this week
          </p>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <span className={`font-display text-4xl leading-none ${tone}`}>{data.score}%</span>
        <span className="text-sm text-ink">{data.label}</span>
      </div>
      <div
        className="mt-3 h-1 w-full bg-paper"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={data.score}
        aria-label="Match score"
      >
        <div className="h-1 bg-emerald" style={{ width: `${data.score}%` }} />
      </div>

      {data.pro ? (
        <ul className="mt-3 space-y-1.5">
          {data.reasons.map((r) => (
            <li key={r} className="text-sm text-ink leading-relaxed">
              {r}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm text-slate">Pro tells you which of your notes drive this.</p>
          <Link
            href="/pricing"
            onClick={() => trackProGateCta("match", { state: "ok_free" })}
            className="text-sm text-emerald underline underline-offset-4"
          >
            See why
          </Link>
        </div>
      )}
    </section>
  );
}

"use client";

// "Layer it" — pairings from the user's own shelf for this fragrance.
//
// Hydrates client-side (ISR page). Pro renders the top three pairs with a
// one-line reason each. Free renders the section with one veiled row and
// the gate, so the value is visible before the ask. Signed out, or a shelf
// with fewer than two other bottles, renders a short nudge; when nothing
// on the shelf pairs well the section says so rather than forcing a pick.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { BottleImage } from "@/components/bottle-image";
import { TrialCta } from "@/components/trial-cta";
import { trackFeatureUsed, trackProGateCta, trackProGateShown } from "@/lib/pro-events";

interface Pair {
  partner: { id: string; name: string; house: string; bottle_image_url: string | null };
  score: number;
  reason: string;
  sharedBase: string[];
}

type Payload =
  | { state: "needs_shelf"; owned: number; min: number }
  | { state: "none" }
  | { state: "locked"; count: number }
  | { state: "ok"; pairs: Pair[] };

export function LayerIt({ fragranceId, name }: { fragranceId: string; name: string }) {
  const { isLoaded, isSignedIn } = useUser();
  const [data, setData] = useState<Payload | null | "error">(null);
  const tracked = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let live = true;
    fetch(`/api/layer/${fragranceId}`)
      .then(async (r) => {
        const body = (await r.json().catch(() => null)) as Payload | null;
        if (!live) return;
        if (!body || (!r.ok && r.status !== 402)) return setData("error");
        setData(body);
        if (body.state === "ok") trackFeatureUsed("layering", { pairs: body.pairs.length });
      })
      .catch(() => live && setData("error"));
    return () => {
      live = false;
    };
  }, [isLoaded, isSignedIn, fragranceId]);

  useEffect(() => {
    if (data && data !== "error" && data.state === "locked" && !tracked.current) {
      tracked.current = true;
      trackProGateShown("layering", { count: data.count });
    }
  }, [data]);

  if (!isLoaded || !isSignedIn || !data || data === "error" || data.state === "none") return null;

  return (
    <section className="mb-10">
      <h2 className="font-display text-2xl mb-1">Layer it</h2>
      <p className="text-sm text-slate mb-4">Bottles you already own that pair with {name}.</p>

      {data.state === "needs_shelf" && (
        <p className="text-sm text-ink leading-relaxed">
          Mark {Math.max(1, data.min - data.owned)} more {data.min - data.owned === 1 ? "bottle" : "bottles"} as owned
          and Spritz will suggest pairings from your shelf.{" "}
          <Link href="/collection" className="text-emerald underline underline-offset-4">
            Open my collection
          </Link>
        </p>
      )}

      {data.state === "locked" && (
        <div>
          <ul aria-hidden className="select-none pointer-events-none blur-[3px] opacity-70 mb-4">
            <li className="flex items-center gap-3 py-2">
              <div className="relative h-12 w-12 bg-paper shrink-0" />
              <div className="flex-1">
                <div className="h-3 w-40 bg-ink/15 mb-2" />
                <div className="h-3 w-56 bg-ink/10" />
              </div>
            </li>
          </ul>
          <p className="text-sm text-ink leading-relaxed mb-3">
            {data.count === 1 ? "1 bottle" : `${data.count} bottles`} on your shelf {data.count === 1 ? "pairs" : "pair"}{" "}
            with {name}. Pro shows which, and why they work together.
          </p>
          <div onClickCapture={() => trackProGateCta("layering")}>
            <TrialCta />
          </div>
        </div>
      )}

      {data.state === "ok" && (
        <ul className="divide-y divide-ink/10">
          {data.pairs.map((p) => (
            <li key={p.partner.id} className="py-3">
              <Link href={`/fragrance/${p.partner.id}`} className="group flex items-start gap-3">
                <div className="relative h-14 w-14 bg-paper shrink-0">
                  <BottleImage src={p.partner.bottle_image_url} house={p.partner.house} name={p.partner.name} sizes="56px" />
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[11px] uppercase tracking-widest text-slate truncate">{p.partner.house}</p>
                  <p className="font-medium text-ink leading-tight">{p.partner.name}</p>
                  <p className="text-sm text-slate mt-1 leading-relaxed">{p.reason}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

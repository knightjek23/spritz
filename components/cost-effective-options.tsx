"use client";

// "Cost-effective options": cheaper bottles with the same scent profile,
// with the retailer and the saving. Pro feature. Replaces <KnownDupes>.
//
// The list is fetched here rather than rendered into the page, because the
// fragrance page is cached and identical for every visitor. The route
// decides what each viewer gets:
//   signed out     -> upsell
//   free           -> upsell with a true teaser ("3 options, save up to $85")
//   Pro            -> the list
//   no price data  -> a one-line explanation, no upsell (nothing to sell)
//
// Each row links to the fragrance page, and the retailer price links out
// through the same affiliate URL the Buy button uses.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { BottleImage } from "@/components/bottle-image";
import { TrialCta } from "@/components/trial-cta";
import type { CostEffectiveResponse } from "@/app/api/cost-effective/[id]/route";

type State =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "ready"; data: CostEffectiveResponse }
  | { kind: "error" };

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `$${Math.round(n)}`;
  }
}

export function CostEffectiveOptions({
  fragranceId,
  fragranceName,
}: {
  fragranceId: string;
  fragranceName: string;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setState({ kind: "signed-out" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/cost-effective/${fragranceId}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401) {
          setState({ kind: "signed-out" });
          return;
        }
        if (!res.ok) {
          setState({ kind: "error" });
          return;
        }
        setState({ kind: "ready", data: (await res.json()) as CostEffectiveResponse });
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fragranceId, isLoaded, isSignedIn]);

  const heading = <h2 className="font-display text-2xl mb-2">Cost-effective options</h2>;

  if (state.kind === "loading") {
    return (
      <section className="mb-10" aria-busy>
        {heading}
        <div className="h-4 w-64 rounded bg-ink/5 animate-pulse mb-4" />
        <div className="space-y-2">
          <div className="h-[76px] rounded-xl bg-ink/5 animate-pulse" />
          <div className="h-[76px] rounded-xl bg-ink/5 animate-pulse" />
        </div>
      </section>
    );
  }

  if (state.kind === "signed-out") {
    return (
      <section className="mb-10">
        {heading}
        <p className="text-sm text-slate mb-4">
          Bottles with the same scent profile as {fragranceName} for less, with live prices.
          Pro feature.
        </p>
        <TrialCta />
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section className="mb-10">
        {heading}
        <p className="text-sm text-slate">Couldn&apos;t load options. Refresh to try again.</p>
      </section>
    );
  }

  const { data } = state;

  // No price for the source: say so plainly. Nothing to sell here, so no
  // upsell either; a paywall in front of "we don't know" would read badly.
  if (data.reason === "no_source_price") {
    return (
      <section className="mb-10">
        {heading}
        <p className="text-sm text-slate">
          We don&apos;t have a price for {fragranceName} yet, so we can&apos;t work out what
          would save you money.
        </p>
      </section>
    );
  }

  if (data.reason === "no_matches") {
    return (
      <section className="mb-10">
        {heading}
        <p className="text-sm text-slate">
          Nothing with the same scent profile as {fragranceName} is selling for meaningfully
          less right now.
          That usually means it&apos;s already well priced for what it is.
        </p>
      </section>
    );
  }

  // Free user with options behind the gate.
  if (!data.pro && data.teaser) {
    const { count, bestSaving, currency } = data.teaser;
    return (
      <section className="mb-10">
        {heading}
        <p className="text-sm text-slate mb-1">
          We found{" "}
          <span className="text-ink font-medium">
            {count} bottle{count === 1 ? "" : "s"}
          </span>{" "}
          that have the same scent profile as {fragranceName} for less, the best saving{" "}
          <span className="text-ink font-medium">{money(bestSaving, currency)}</span>.
        </p>
        <p className="text-sm text-slate mb-4">See which ones with Pro.</p>
        <TrialCta />
      </section>
    );
  }

  const src = data.sourcePrice;
  return (
    <section className="mb-10">
      {heading}
      <p className="text-sm text-slate mb-4">
        Bottles with the same scent profile as {fragranceName}
        {src ? ` (${src.estimated ? "~" : ""}${money(src.price, src.currency)} for 100 ml)` : ""}{" "}
        for less. Match is how close the profile is. Prices are per 100 ml; retailer prices
        can lag the store, &ldquo;est.&rdquo; is an estimated list price, and &ldquo;rough
        est.&rdquo; is based on the house&apos;s usual pricing rather than this bottle.
      </p>
      <ul className="space-y-2">
        {data.options.map((o) => (
          <li
            key={o.id}
            className="flex items-center gap-3 px-3 py-2 rounded-xl bg-paper border border-ink/10"
          >
            <Link
              href={`/fragrance/${o.id}`}
              className="flex items-center gap-3 min-w-0 flex-1 py-1"
            >
              <div className="shrink-0 w-10 h-14 relative">
                <BottleImage
                  src={o.bottle_image_url}
                  house={o.house}
                  name={o.name}
                  sizes="40px"
                  className="object-contain mix-blend-multiply"
                />
              </div>
              <div className="min-w-0">
                <div className="font-medium truncate">{o.name}</div>
                <div className="text-xs text-slate truncate">
                  {o.house} · {Math.round(o.similarity * 100)}% match
                </div>
              </div>
            </Link>
            {/* The saving is the headline number. Beneath it: a retailer
                price links out to the affiliate page; an estimate (model
                recollection of list price, no store behind it) is labelled
                "est." and does not link, so nobody taps through to a price
                that was never observed. */}
            {o.product_url && !o.estimated ? (
              <a
                href={`/api/buy/${o.id}${o.retailer ? `?retailer=${encodeURIComponent(o.retailer)}` : ""}`}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="shrink-0 text-right min-h-[44px] flex flex-col justify-center px-2 rounded-lg hover:bg-ink/5 transition"
                data-no-longpress
              >
                <span className="font-display text-lg leading-none text-emerald">
                  save {money(o.saving, o.currency)}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate mt-1">
                  {money(o.price, o.currency)} · {o.retailer}
                </span>
              </a>
            ) : (
              <div className="shrink-0 text-right min-h-[44px] flex flex-col justify-center px-2">
                <span className="font-display text-lg leading-none text-emerald">
                  save ~{money(o.saving, o.currency)}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate mt-1">
                  ~{money(o.price, o.currency)} · {o.rough ? "rough est." : "est. list price"}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

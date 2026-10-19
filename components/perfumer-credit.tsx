"use client";

// Perfumer credit on the fragrance page. Pro only.
//
// The page is ISR-cached and the same for everyone, so the name is never in
// its HTML or props. This component asks /api/perfumer/[id], which checks
// Pro against Supabase (not Clerk metadata, so comped users work too):
//
//   Pro            -> name, linking to /perfumer/[slug]
//   free / signed out -> upsell
//   uncredited     -> renders nothing
//
// `hasCredit` is the only thing the page reveals publicly: whether a credit
// exists, so we never upsell an empty field.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

// "locked" is reserved for a real answer of "not Pro". Signed-out and
// failed requests get their own states: collapsing all three into one
// "Unlock with Pro" box once made a working Pro account look broken, with
// nothing on screen to say why.
type State =
  | { kind: "loading" }
  | { kind: "pro"; perfumer: string; slug: string }
  | { kind: "locked" }
  | { kind: "signed-out" }
  | { kind: "error" }
  | { kind: "none" };

export function PerfumerCredit({
  fragranceId,
  hasCredit,
}: {
  fragranceId: string;
  hasCredit: boolean;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!hasCredit) {
      setState({ kind: "none" });
      return;
    }
    if (!isLoaded) return;
    if (!isSignedIn) {
      setState({ kind: "signed-out" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // no-store: a stale cached answer from before an upgrade or comp
        // would keep showing the paywall to someone who is now Pro.
        const res = await fetch(`/api/perfumer/${fragranceId}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 402) {
          setState({ kind: "locked" });
          return;
        }
        if (res.status === 401) {
          setState({ kind: "signed-out" });
          return;
        }
        if (!res.ok) {
          setState({ kind: "error" });
          return;
        }
        const body = (await res.json()) as { perfumer: string | null; slug: string | null };
        setState(
          body.perfumer && body.slug
            ? { kind: "pro", perfumer: body.perfumer, slug: body.slug }
            : { kind: "none" },
        );
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fragranceId, hasCredit, isLoaded, isSignedIn]);

  if (state.kind === "none") return null;

  return (
    <section className="mb-10 min-h-[3.5rem]">
      <p className="font-mono text-xs uppercase tracking-widest text-slate mb-1">Perfumer</p>

      {state.kind === "loading" && (
        // Fixed-height placeholder so the page doesn't jump when the name lands.
        <div className="h-7 w-48 rounded bg-ink/5 animate-pulse" aria-hidden />
      )}

      {state.kind === "pro" && (
        <Link
          href={`/perfumer/${state.slug}`}
          className="group inline-flex items-baseline gap-2 font-display text-xl hover:text-emerald transition"
        >
          {state.perfumer}
          <span className="font-mono text-xs text-slate group-hover:text-emerald">
            See their work →
          </span>
        </Link>
      )}

      {state.kind === "signed-out" && (
        <p className="text-sm text-slate">
          See who made this with Spritz Pro.{" "}
          <Link href="/sign-in" className="text-emerald underline underline-offset-4">
            Sign in
          </Link>{" "}
          or{" "}
          <Link href="/pricing" className="text-emerald underline underline-offset-4">
            see Pro
          </Link>
          .
        </p>
      )}

      {state.kind === "error" && (
        <p className="text-sm text-slate">
          Couldn&apos;t load the perfumer. Refresh to try again.
        </p>
      )}

      {state.kind === "locked" && (
        <div>
          <p className="text-sm text-slate mb-3">
            See who made this, and everything else they&apos;ve created. Pro feature.
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-brass text-ink font-medium hover:bg-brass/80 transition"
          >
            Unlock with Pro
          </Link>
        </div>
      )}
    </section>
  );
}

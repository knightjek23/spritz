"use client";

// /welcome — first-run onboarding.
//
// Lands here after a fresh sign-up. Asks the user for 3 fragrances they
// already own / love, which we save to their collection as `own`. The
// payoff: their detail pages immediately have meaning (the "similar"
// section is anchored on their real taste), and the collection has
// something in it from day one.
//
// First-run detection: emptiness of the collection, not a Clerk flag. If
// a user has any items, we redirect to /collection. Easy to reach via
// /welcome again later if they want to redo it — recoverable by design.
//
// Skip path: a "skip for now" link sends them to the home page without
// recording anything. The collection stays empty; we'll prompt again at
// natural opportunities (after a scan, when they tap Wishlist for the
// first time, etc.).

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { cleanBottleImageUrl } from "@/lib/bottle-image";
import { useRouter } from "next/navigation";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { SearchAutocomplete } from "@/components/search-autocomplete";
import type { Fragrance } from "@/lib/types";

const TARGET_PICKS = 3;

export default function WelcomePage() {
  return (
    <>
      <SignedIn>
        <WelcomeInner />
      </SignedIn>
      <SignedOut>
        {/* Should be unreachable in practice — Clerk redirects unauthenticated
            users away. But if someone hits /welcome cold, send them to sign-up. */}
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <p className="text-slate mb-6">Sign up to get started.</p>
          <Link
            href="/sign-up"
            className="inline-block px-6 py-3 rounded-xl bg-emerald text-cream font-medium hover:bg-emerald/90 transition"
          >
            Create an account
          </Link>
        </div>
      </SignedOut>
    </>
  );
}

function WelcomeInner() {
  const router = useRouter();
  const [picks, setPicks] = useState<Fragrance[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedExisting, setCheckedExisting] = useState(false);

  // Skip onboarding if the user already has a populated collection.
  // Avoids the "I came back to /welcome later by mistake" loop where we'd
  // re-add items they already saved.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/collection")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (Array.isArray(d.items) && d.items.length > 0) {
          router.replace("/collection");
        } else {
          setCheckedExisting(true);
        }
      })
      .catch(() => {
        // If the collection fetch fails, just show the onboarding UI —
        // worst case the POSTs below will fail loudly and the user can
        // retry.
        setCheckedExisting(true);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  function addPick(f: Fragrance) {
    setPicks((current) => {
      // Dedupe — picking the same fragrance twice is almost certainly a slip.
      if (current.some((p) => p.id === f.id)) return current;
      // Cap at the target — extra picks just no-op rather than confuse.
      if (current.length >= TARGET_PICKS) return current;
      return [...current, f];
    });
  }

  function removePick(id: string) {
    setPicks((current) => current.filter((p) => p.id !== id));
  }

  async function submit() {
    if (picks.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      // Fire all three POSTs in parallel. Each is independent; partial
      // success is fine (we'll show what landed even if one fails).
      const results = await Promise.allSettled(
        picks.map((p) =>
          fetch("/api/collection", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ fragrance_id: p.id, status: "own" }),
          }),
        ),
      );
      const failures = results.filter(
        (r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok),
      );
      if (failures.length === picks.length) {
        // Total failure — likely auth / DB outage. Let the user retry.
        setError("Couldn't save your selections. Try again in a moment.");
        return;
      }
      router.push("/collection");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!checkedExisting) {
    // Brief skeleton while we check collection emptiness. Avoids flash of
    // onboarding UI for returning users.
    return (
      <div className="mx-auto max-w-md px-6 py-16">
        <div className="h-8 w-32 bg-paper rounded animate-pulse mb-4" />
        <div className="h-14 w-full bg-paper rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-10">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate mb-2">
          Welcome to Spritz
        </p>
        <h1 className="font-display text-5xl leading-[0.95] mb-4">
          What do you
          <br />
          already love?
        </h1>
        <p className="text-slate text-base leading-relaxed max-w-xs">
          Pick {TARGET_PICKS} fragrances you wear. We&apos;ll use them to suggest
          similar bottles, dupes for cheaper alternatives, and editorial
          you&apos;ll actually want to read.
        </p>
      </header>

      {/* Search picker */}
      <div className="mb-6">
        <SearchAutocomplete
          placeholder="Search by name or brand…"
          autoFocus
          onPick={addPick}
          clearOnPick
        />
      </div>

      {/* Selection state */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <p className="font-mono text-xs uppercase tracking-widest text-slate">
            Your picks · {picks.length} of {TARGET_PICKS}
          </p>
          {picks.length > 0 && (
            <button
              type="button"
              onClick={() => setPicks([])}
              className="text-xs text-slate hover:text-ink underline underline-offset-2"
            >
              Clear
            </button>
          )}
        </div>

        {picks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink/15 p-6 text-center">
            <p className="text-sm text-slate">
              Search above and tap a result to add it.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {picks.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-3 px-3 py-2 rounded-xl border border-ink/10 bg-cream"
              >
                {cleanBottleImageUrl(f.bottle_image_url) ? (
                  <div className="shrink-0 w-12 h-16 relative">
                    <Image
                      src={cleanBottleImageUrl(f.bottle_image_url)!}
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
                  <div className="text-xs text-slate truncate">{f.house}</div>
                </div>
                <button
                  type="button"
                  onClick={() => removePick(f.id)}
                  aria-label={`Remove ${f.name}`}
                  className="shrink-0 px-2 py-1 text-slate hover:text-burgundy text-lg leading-none"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="mb-4 text-sm text-burgundy">{error}</p>
      )}

      {/* Actions */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={submit}
          disabled={picks.length === 0 || submitting}
          className="w-full bg-emerald text-cream py-4 rounded-2xl font-medium tracking-wide hover:bg-emerald/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {submitting
            ? "Saving…"
            : picks.length === 0
            ? "Add at least one to continue"
            : `Save ${picks.length} fragrance${picks.length === 1 ? "" : "s"} to my collection`}
        </button>
        <Link
          href="/"
          className="block text-center text-sm text-slate hover:text-ink py-2 transition"
        >
          Skip for now
        </Link>
      </div>
    </div>
  );
}

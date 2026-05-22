"use client";

// Collection page — own / tried / wishlist tabs.
//
// Handles three audiences:
//   1. Signed-out → friendly explainer + sign-in / sign-up CTAs.
//   2. Signed-in + empty tab → tab-specific guidance (Own / Tried / Wishlist
//      each suggest a different next action, since their use cases differ).
//   3. Signed-in + populated → tappable list of cards.

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import type { CollectionItem, CollectionStatus, Fragrance } from "@/lib/types";

type ItemWithFragrance = CollectionItem & { fragrance: Fragrance };

const TABS: Array<{ key: CollectionStatus; label: string }> = [
  { key: "own", label: "Own" },
  { key: "tried", label: "Tried" },
  { key: "wishlist", label: "Wishlist" },
];

// Per-tab empty copy. Different shelves get different prompts —
// "wishlist is empty" should suggest browsing, "own is empty" should suggest
// scanning what's on your shelf.
const EMPTY_COPY: Record<
  CollectionStatus,
  { heading: string; body: string; ctaHref: string; ctaLabel: string }
> = {
  own: {
    heading: "Build your shelf",
    body: "Scan the bottles you already own and we'll save them here, with notes, longevity, and the editorial story for each.",
    ctaHref: "/scan",
    ctaLabel: "Scan a bottle",
  },
  tried: {
    heading: "Track what you've sampled",
    body: "Mark fragrances you've tried but don't own. Useful when you're deciding which one to buy next.",
    ctaHref: "/search",
    ctaLabel: "Find a fragrance",
  },
  wishlist: {
    heading: "Save what's next",
    body: "Add fragrances you want to try someday. We'll remind you when prices drop or a dupe shows up.",
    ctaHref: "/search",
    ctaLabel: "Browse the catalog",
  },
};

export default function CollectionPage() {
  return (
    <>
      <SignedOut>
        <SignedOutState />
      </SignedOut>
      <SignedIn>
        <SignedInCollection />
      </SignedIn>
    </>
  );
}

function SignedOutState() {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <span className="inline-block px-3 py-1 mb-6 bg-brass text-ink text-xs font-mono uppercase tracking-wider rounded-full">
        Sign in to save
      </span>
      <h1 className="font-display text-4xl mb-4 leading-tight">
        Your shelf, your history.
      </h1>
      <p className="text-slate text-base mb-10 max-w-xs mx-auto leading-relaxed">
        Track what you own, what you&apos;ve tried, and what you want next.
        Free to use, no card needed.
      </p>
      <Link
        href="/sign-up"
        className="block w-full bg-emerald text-cream py-4 rounded-2xl font-medium tracking-wide mb-3 hover:bg-emerald/90 transition"
      >
        Create an account
      </Link>
      <Link
        href="/sign-in"
        className="block w-full border border-ink/15 text-ink py-4 rounded-2xl font-medium tracking-wide hover:bg-ink/5 transition"
      >
        I already have one
      </Link>
    </div>
  );
}

function SignedInCollection() {
  const [tab, setTab] = useState<CollectionStatus>("own");
  const [items, setItems] = useState<ItemWithFragrance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/collection?status=${tab}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .finally(() => setLoading(false));
  }, [tab]);

  const empty = EMPTY_COPY[tab];

  return (
    <div className="mx-auto max-w-md px-6 py-10">
      <h1 className="font-display text-3xl mb-6">My collection</h1>

      <div className="flex gap-1 p-1 bg-ink/5 rounded-xl mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              tab === t.key ? "bg-cream shadow-sm" : "text-ink/60"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          Loading…
        </p>
      )}

      {!loading && items.length === 0 && (
        <div className="text-center py-8 px-2">
          <h2 className="font-display text-2xl mb-2">{empty.heading}</h2>
          <p className="text-slate text-sm mb-6 leading-relaxed max-w-xs mx-auto">
            {empty.body}
          </p>
          <Link
            href={empty.ctaHref}
            className="inline-block px-6 py-3 rounded-xl bg-emerald text-cream font-medium hover:bg-emerald/90 transition"
          >
            {empty.ctaLabel}
          </Link>
        </div>
      )}

      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id}>
            <Link
              href={`/fragrance/${it.fragrance.id}`}
              className="flex items-center gap-3 px-3 py-2 rounded-xl border border-ink/10 hover:bg-ink/5 transition"
            >
              {it.fragrance.bottle_image_url ? (
                <div className="shrink-0 w-12 h-16 relative">
                  <Image
                    src={it.fragrance.bottle_image_url}
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
                <div className="font-medium truncate">{it.fragrance.name}</div>
                <div className="text-xs text-slate truncate">{it.fragrance.house}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

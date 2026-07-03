"use client";

// Collection page — own / tried / wishlist tabs.
//
// Handles three audiences:
//   1. Signed-out → friendly explainer + sign-in / sign-up CTAs.
//   2. Signed-in + empty tab → tab-specific guidance (Own / Tried / Wishlist
//      each suggest a different next action, since their use cases differ).
//   3. Signed-in + populated → tappable list of cards.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import type {
  CollectionItem,
  CollectionStatus,
  Fragrance,
  Reaction,
} from "@/lib/types";
import { CardMenu } from "@/components/card-menu";

// The API now bundles the user's reaction (like/dislike/null) per item so
// the shelf can render the small indicator overlay without a second
// round-trip. See app/api/collection/route.ts.
type ItemWithFragrance = CollectionItem & {
  fragrance: Fragrance;
  reaction: Reaction | null;
};

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

  // Hoisted into a callback so CardMenu's onDelete can refresh the list
  // after a successful Delete without having to navigate or full-reload.
  const refetch = useCallback(() => {
    setLoading(true);
    fetch(`/api/collection?status=${tab}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => {
    refetch();
  }, [refetch]);

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

      {/* Shelf rows. The card itself is a Link to the detail page; the
          kebab on the right opens a bottom-sheet menu (CardMenu) with
          Like / Dislike / Share / Buy / Find Dupe / Delete. The kebab
          calls stopPropagation so it never triggers the row's Link. */}
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id} className="relative">
            <Link
              href={`/fragrance/${it.fragrance.id}`}
              className="flex items-center gap-3 px-3 py-2 pr-14 rounded-xl bg-paper border border-ink/10 hover:brightness-95 transition"
            >
              {it.fragrance.bottle_image_url ? (
                // bg-paper + isolate + mix-blend-multiply trio: the multiply
                // needs an opaque backdrop to blend into (without it, the
                // white bottle background stays white). Matches the trending
                // card thumbnail pattern.
                <div className="shrink-0 w-12 h-16 relative isolate bg-paper rounded-md overflow-hidden">
                  <Image
                    src={it.fragrance.bottle_image_url}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-contain mix-blend-multiply p-1"
                  />
                  {/* Like/Dislike indicator — small cream badge in the
                      top-right corner of the thumbnail. Emerald heart
                      for liked, slate thumbs-down for disliked. */}
                  <ReactionBadge reaction={it.reaction} />
                </div>
              ) : (
                <div className="shrink-0 w-12 h-16 relative rounded-md bg-paper" aria-hidden>
                  <ReactionBadge reaction={it.reaction} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{it.fragrance.name}</div>
                <div className="text-xs text-slate truncate">{it.fragrance.house}</div>
              </div>
            </Link>
            {/* Kebab sits absolutely over the row's right padding so the
                whole card stays one tappable Link target. */}
            <div className="absolute top-1/2 -translate-y-1/2 right-3">
              <CardMenu
                fragrance={{
                  id: it.fragrance.id,
                  name: it.fragrance.name,
                  house: it.fragrance.house,
                  bottle_image_url: it.fragrance.bottle_image_url,
                }}
                collectionItemId={it.id}
                currentReaction={it.reaction}
                onDelete={refetch}
                // Inline local state update instead of a full refetch —
                // the API call already happened inside CardMenu, and
                // refetch() would flip loading=true and flash the
                // "Loading…" line during a routine reaction toggle.
                // Mutating just the one item's reaction keeps the
                // indicator in sync silently.
                onReactionChange={(next) =>
                  setItems((current) =>
                    current.map((item) =>
                      item.id === it.id ? { ...item, reaction: next } : item,
                    ),
                  )
                }
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Small overlay badge on the shelf thumbnail showing the user's reaction
// to this fragrance. Renders nothing when there's no reaction. Tucked
// into the top-right corner so it doesn't crowd the bottle photo.
function ReactionBadge({ reaction }: { reaction: Reaction | null }) {
  if (!reaction) return null;
  const isLike = reaction === "like";
  return (
    <span
      aria-label={isLike ? "Liked" : "Disliked"}
      className="absolute top-0.5 right-0.5 inline-flex items-center justify-center w-4 h-4 bg-cream rounded-full shadow-sm"
    >
      {isLike ? (
        <svg
          viewBox="0 0 32 32"
          className="w-3 h-3 text-emerald"
          fill="currentColor"
          aria-hidden
        >
          <path d="M3.96 8.51C3.12 9.73 2.67 11.18 2.67 12.67C2.67 15.73 4.67 18 6.67 20L14.01 27.11C14.26 27.39 14.57 27.62 14.92 27.77C15.26 27.92 15.64 28 16.02 28C16.39 28 16.77 27.91 17.11 27.76C17.46 27.6 17.76 27.37 18.01 27.08L25.33 20C27.33 18 29.33 15.72 29.33 12.67C29.34 11.18 28.9 9.73 28.06 8.5C27.22 7.27 26.02 6.33 24.63 5.8C23.25 5.26 21.73 5.17 20.28 5.52C18.84 5.87 17.53 6.65 16.55 7.77C16.48 7.84 16.39 7.9 16.3 7.94C16.2 7.98 16.1 8 16 8C15.9 8 15.8 7.98 15.7 7.94C15.61 7.9 15.52 7.84 15.45 7.77C14.46 6.66 13.16 5.89 11.72 5.54C10.27 5.19 8.76 5.29 7.37 5.82C5.99 6.35 4.8 7.29 3.96 8.51Z" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 32 32"
          className="w-3 h-3 text-slate"
          fill="currentColor"
          aria-hidden
        >
          <path d="M11 14V26M19 9.88L18 14H23.83C24.14 14 24.45 14.07 24.73 14.21C25 14.35 25.24 14.55 25.43 14.8C25.62 15.05 25.74 15.34 25.8 15.64C25.85 15.95 25.84 16.26 25.75 16.56L23.42 24.56C23.3 24.98 23.05 25.34 22.7 25.6C22.35 25.86 21.93 26 21.5 26H8C7.47 26 6.96 25.79 6.59 25.42C6.21 25.04 6 24.53 6 24V16C6 15.47 6.21 14.96 6.59 14.59C6.96 14.21 7.47 14 8 14H10.76C11.13 14 11.5 13.9 11.81 13.7C12.13 13.5 12.38 13.22 12.55 12.89L16 6C16.47 6.01 16.94 6.12 17.36 6.33C17.78 6.54 18.15 6.84 18.44 7.21C18.73 7.59 18.93 8.02 19.02 8.48C19.12 8.94 19.11 9.42 19 9.88Z" />
        </svg>
      )}
    </span>
  );
}

"use client";

// "+" in the shelf header: search any fragrance and add it to whichever
// tab is open (Own / Tried / Wishlist).
//
// Tapping the "+" swaps the header row for the search field in picker
// mode, the same SearchAutocomplete the Compare feature uses, with the
// current tab named in the placeholder so it is clear where the pick will
// land. Picking a fragrance POSTs to /api/collection (same endpoint the
// detail page's Save buttons use, so the free cap and duplicate handling
// are identical), then the shelf refetches and the field closes.
//
// Outcomes, each said plainly in the row rather than as a toast:
//   409  already on the shelf (any tab)   -> "Already on your shelf"
//   402  free cap reached                 -> cap message + Pro CTA
//   other error                           -> "Couldn't add that. Try again."
//
// The icon is public/icons/add.svg inlined so it takes the text colour,
// scaled from its 64px artboard to a 44px tap target.

import { useState } from "react";
import { SearchAutocomplete } from "@/components/search-autocomplete";
import { TrialCta } from "@/components/trial-cta";
import type { CollectionStatus, Fragrance } from "@/lib/types";

const TAB_LABEL: Record<CollectionStatus, string> = {
  own: "Own",
  tried: "Tried",
  wishlist: "Wishlist",
};

type Notice =
  | { kind: "added"; name: string }
  | { kind: "duplicate"; name: string }
  | { kind: "cap"; cap: number }
  | { kind: "error" };

export function AddToShelf({
  status,
  onAdded,
}: {
  /** The tab currently open; the pick is saved there. */
  status: CollectionStatus;
  /** Called after a successful add so the shelf can refetch. */
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function pick(f: Fragrance) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fragrance_id: f.id, status }),
      });
      if (res.status === 409) {
        setNotice({ kind: "duplicate", name: f.name });
        return;
      }
      if (res.status === 402) {
        const body = (await res.json().catch(() => ({}))) as { cap?: number };
        setNotice({ kind: "cap", cap: body.cap ?? 10 });
        return;
      }
      if (!res.ok) {
        setNotice({ kind: "error" });
        return;
      }
      setNotice({ kind: "added", name: f.name });
      setOpen(false);
      onAdded();
    } catch {
      setNotice({ kind: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between mb-6">
        {/* flex-wrap so the notice (basis-full) drops to its own line under
            the title + button rather than squeezing between them. */}
        <h1 className="font-display text-3xl">My collection</h1>
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setOpen(true);
          }}
          aria-label={`Add a fragrance to ${TAB_LABEL[status]}`}
          // 44px target, nudged right so the glyph's visual edge lines up
          // with the row's right padding rather than the button's box.
          className="w-11 h-11 -mr-2.5 flex items-center justify-center text-ink hover:bg-ink/5 rounded-full transition"
          data-no-longpress
        >
          <svg width="28" height="28" viewBox="0 0 64 64" fill="none" aria-hidden>
            <path d="M32.5 12L32.5 53" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M53 32.5L12 32.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
        {notice && <NoticeLine notice={notice} status={status} />}
      </div>
    );
  }

  return (
    <div className="mb-6">
      <p className="font-mono text-xs uppercase tracking-widest text-slate mb-2">
        Add to {TAB_LABEL[status]}
      </p>
      <SearchAutocomplete
        autoFocus
        placeholder={`Search a fragrance to add to ${TAB_LABEL[status]}…`}
        onPick={pick}
        leading="back"
        onLeadingClick={() => {
          setOpen(false);
          setNotice(null);
        }}
      />
      {busy && <p className="text-xs text-slate mt-2">Adding…</p>}
      {notice && <NoticeLine notice={notice} status={status} />}
    </div>
  );
}

function NoticeLine({ notice, status }: { notice: Notice; status: CollectionStatus }) {
  if (notice.kind === "added") {
    return (
      <p className="basis-full text-sm text-emerald mt-2" role="status">
        Added {notice.name} to {TAB_LABEL[status]}.
      </p>
    );
  }
  if (notice.kind === "duplicate") {
    return (
      <p className="basis-full text-sm text-slate mt-2" role="status">
        {notice.name} is already on your shelf.
      </p>
    );
  }
  if (notice.kind === "cap") {
    return (
      <div className="basis-full mt-3" role="status">
        <p className="text-sm text-slate mb-3">
          Your shelf holds {notice.cap} fragrances on the free plan. Pro makes it unlimited.
        </p>
        <TrialCta />
      </div>
    );
  }
  return (
    <p className="basis-full text-sm text-burgundy mt-2" role="alert">
      Couldn&apos;t add that. Try again.
    </p>
  );
}

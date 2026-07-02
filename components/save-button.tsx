"use client";

// Own / Tried / Wishlist save button.
//
// Behavior:
//   1. Clerk still loading      → disabled to prevent hydration-time
//                                  race clicks.
//   2. Signed out + click       → Clerk sign-up modal in place; the
//                                  user comes back to this page with
//                                  intent intact.
//   3. Signed in + click when idle  → POST /api/collection, transition
//                                     to 'saved', capture the returned
//                                     item ID so we can toggle off.
//   4. Signed in + click when saved → DELETE /api/collection?id=<itemId>,
//                                     transition back to 'idle'.
//
// Persistence across page loads: the parent fragrance page queries the
// current user's collection entries server-side and passes
// initialItemId for each status. If a collection_items row already
// exists, the button hydrates in the 'saved' state so the user sees
// their status immediately without a client-side round-trip.
//
// Session 01 test feedback drove the modal-based sign-up (rather than
// silent /sign-up redirect) so the cause-and-effect stays visible when
// an unauthenticated user taps.

import { useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import type { CollectionStatus } from "@/lib/types";

type ButtonState =
  | "idle"
  | "saving"
  | "saved"
  | "removing"
  | "cap"
  | "auth"
  | "error";

export function SaveButton({
  fragranceId,
  status,
  label,
  initialItemId,
}: {
  fragranceId: string;
  status: CollectionStatus;
  label: string;
  /** collection_items.id if the user has already saved this fragrance
   *  under this status. When provided, the button hydrates in the
   *  'saved' state and tapping it triggers a DELETE. */
  initialItemId?: string | null;
}) {
  const { isLoaded, isSignedIn } = useUser();
  const clerk = useClerk();

  // Track the item id alongside the visible state. The id is what
  // powers the DELETE toggle-off; without it, we can't remove.
  const [itemId, setItemId] = useState<string | null>(initialItemId ?? null);
  const [state, setState] = useState<ButtonState>(
    initialItemId ? "saved" : "idle",
  );

  async function onClick() {
    if (!isLoaded) return; // wait for Clerk; prevents hydration-time fires
    if (!isSignedIn) {
      clerk.openSignUp({
        redirectUrl: typeof window !== "undefined" ? window.location.href : "/",
      });
      return;
    }

    // Toggle-off path: currently saved → DELETE.
    if (state === "saved" && itemId) {
      setState("removing");
      try {
        const res = await fetch(
          `/api/collection?id=${encodeURIComponent(itemId)}`,
          { method: "DELETE" },
        );
        if (res.ok) {
          setItemId(null);
          setState("idle");
        } else if (res.status === 401 || res.status === 404) {
          setState("auth");
        } else {
          setState("error");
        }
      } catch {
        setState("error");
      }
      return;
    }

    // Toggle-on path: currently idle/error/cap/auth → POST.
    setState("saving");
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fragrance_id: fragranceId, status }),
      });

      if (res.ok) {
        // Capture the new item id so a subsequent tap can DELETE it.
        const body = (await res.json().catch(() => null)) as
          | { item?: { id?: string } }
          | null;
        if (body?.item?.id) setItemId(body.item.id);
        setState("saved");
      } else if (res.status === 402) {
        setState("cap");
      } else if (res.status === 409) {
        // Server says this already exists but we didn't hydrate with the
        // id (e.g. the page was loaded stale, or another device saved).
        // Show 'saved' so the user isn't confused; itemId stays null,
        // so a toggle-off attempt would flip to 'error'. On next page
        // load the server-side hydration will populate itemId properly.
        setState("saved");
      } else if (res.status === 401 || res.status === 404) {
        setState("auth");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  const text =
    state === "saving"
      ? "…"
      : state === "removing"
      ? "…"
      : state === "saved"
      ? "✓ " + label
      : state === "cap"
      ? "Upgrade"
      : state === "auth"
      ? "Sign in"
      : state === "error"
      ? "Try again"
      : label;

  // Brass fill on saved state — signals both "this is your active
  // status" and "tap to remove". Idle borrows the standard bordered
  // button; error states inherit idle appearance with the different
  // text carrying the meaning.
  const className =
    state === "saved"
      ? "px-3 py-3 rounded-xl bg-brass text-ink text-center font-medium text-sm hover:bg-brass/80 transition"
      : "px-3 py-3 rounded-xl border border-ink/15 text-center font-medium text-sm hover:bg-ink/5 transition disabled:opacity-60";

  const busy = state === "saving" || state === "removing";

  return (
    <button
      onClick={onClick}
      // Only disable during transient in-flight states. When 'saved',
      // the button MUST stay tappable so the user can toggle off.
      disabled={busy || !isLoaded}
      className={className}
      aria-pressed={state === "saved"}
      aria-label={
        !isLoaded
          ? "Loading"
          : !isSignedIn
          ? `Sign up to mark as ${label}`
          : state === "saved"
          ? `Remove ${label}`
          : `Mark as ${label}`
      }
    >
      {text}
    </button>
  );
}

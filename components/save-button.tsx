"use client";

// Own / Tried / Wishlist save button.
//
// Three behavioral branches:
//   1. Clerk still loading        → button is rendered but disabled to
//                                    prevent a click that races hydration
//                                    (which used to fire router.push to
//                                    /sign-up unintentionally).
//   2. Signed out + click         → open Clerk's sign-up modal IN PLACE.
//                                    No full-page redirect. After the
//                                    user signs up, the modal closes and
//                                    they're back on the fragrance page
//                                    with the same intent intact.
//   3. Signed in + click          → POST /api/collection.
//
// Session 01 test feedback: "All buttons (Own, Tried, Wishlist) did not
// function properly. Need to be routed." Root cause was the silent
// redirect in (2) — the user didn't recognize the sign-up page as the
// consequence of tapping Own. The modal flow keeps the cause-and-effect
// visible.

import { useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import type { CollectionStatus } from "@/lib/types";

export function SaveButton({
  fragranceId,
  status,
  label,
}: {
  fragranceId: string;
  status: CollectionStatus;
  label: string;
}) {
  const { isLoaded, isSignedIn } = useUser();
  const clerk = useClerk();
  const [state, setState] = useState<
    "idle" | "saving" | "saved" | "cap" | "auth" | "error"
  >("idle");

  async function onClick() {
    if (!isLoaded) return; // wait for Clerk; prevents hydration-time fires
    if (!isSignedIn) {
      // Modal sign-up — keeps the user on the fragrance page so the
      // intent isn't lost. Clerk closes the modal after success.
      clerk.openSignUp({
        // Stay on this URL after sign-up. Clerk handles this via the
        // afterSignUpUrl/redirectUrl flow; defaulting to current URL.
        redirectUrl: typeof window !== "undefined" ? window.location.href : "/",
      });
      return;
    }

    setState("saving");
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fragrance_id: fragranceId, status }),
      });

      if (res.ok) setState("saved");
      else if (res.status === 402) setState("cap");
      else if (res.status === 409) setState("saved");
      // Auth-level errors (401 = no Clerk session, 404 = users row missing).
      // The API auto-creates the users row in 404 cases as a backfill, but
      // if it still fails surface a clearer state than "Try again".
      else if (res.status === 401 || res.status === 404) setState("auth");
      else setState("error");
    } catch {
      setState("error");
    }
  }

  const text =
    state === "saving" ? "…"
    : state === "saved" ? "✓ " + label
    : state === "cap" ? "Upgrade"
    : state === "auth" ? "Sign in"
    : state === "error" ? "Try again"
    : label;

  // Acid-yellow on saved state — matches the design system's "confirmation
  // pop" use case.
  const className =
    state === "saved"
      ? "px-3 py-3 rounded-xl bg-brass text-ink text-center font-medium text-sm"
      : "px-3 py-3 rounded-xl border border-ink/15 text-center font-medium text-sm hover:bg-ink/5 transition disabled:opacity-60";

  return (
    <button
      onClick={onClick}
      disabled={state === "saving" || state === "saved" || !isLoaded}
      className={className}
      aria-label={
        !isLoaded
          ? "Loading"
          : !isSignedIn
          ? `Sign up to mark as ${label}`
          : `Mark as ${label}`
      }
    >
      {text}
    </button>
  );
}

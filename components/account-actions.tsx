"use client";

// Client-side buttons for the /account page. Two interactions that need
// JS: the Stripe portal redirect (creates a session, then window.location)
// and the Clerk sign-out (clears the session client-side then redirects).
//
// Pulled into its own component so the rest of /account can stay a
// Server Component and render the user's plan/stats without any client
// JS at all.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";

export function ManageSubscriptionButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.hint ?? data.error ?? "Couldn't open the billing portal.");
        return;
      }
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openPortal}
        disabled={busy}
        className="w-full bg-emerald text-cream py-3 rounded-xl font-medium hover:bg-emerald/90 disabled:opacity-60 transition"
      >
        {busy ? "Opening…" : "Manage subscription"}
      </button>
      {error && <p className="mt-2 text-sm text-burgundy">{error}</p>}
    </>
  );
}

export function SignOutButton() {
  const { signOut } = useClerk();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
      router.push("/");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={busy}
      className="w-full border border-ink/15 text-ink py-3 rounded-xl font-medium hover:bg-ink/5 disabled:opacity-60 transition"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}

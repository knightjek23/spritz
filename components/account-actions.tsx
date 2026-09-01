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

/**
 * Account deletion. Required in-app by App Store Guideline 5.1.1(v) for any
 * app that supports account creation; a link to a web page does not satisfy
 * it and neither does deactivation.
 *
 * Three deliberate frictions, in order:
 *   1. The control is collapsed. Destructive actions should not sit open
 *      next to Sign out, where a mis-tap costs someone their collection.
 *   2. Store subscribers must tick an acknowledgement. Apple and Google bill
 *      directly and we cannot cancel for them, so an unacknowledged deletion
 *      means somebody keeps paying for an account that no longer exists.
 *      Web (Stripe) subscriptions are cancelled server-side automatically,
 *      so those users see a statement rather than a checkbox.
 *   3. Typed confirmation. Standard for irreversible destruction, and Apple
 *      explicitly permits a confirmation step.
 *
 * What it must NOT do is require an email or a phone call. Apple prohibits
 * routing deletion through a support flow for non-regulated apps.
 */
export function DeleteAccountSection({
  isPro,
  hasWebSubscription,
}: {
  isPro: boolean;
  hasWebSubscription: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pro without a Stripe customer means the subscription came from the App
  // Store or Play, which we cannot touch.
  const hasStoreSubscription = isPro && !hasWebSubscription;
  const canSubmit = phrase.trim() === "DELETE" && (!hasStoreSubscription || ack);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Nothing has been deleted.");
        return;
      }
      // The Clerk session is gone server-side; a hard navigation clears any
      // client-side remnant and lands them somewhere that makes sense.
      window.location.href = "/?deleted=1";
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full border border-burgundy/30 text-burgundy py-3 rounded-xl font-medium hover:bg-burgundy/5 transition"
      >
        Delete account
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-burgundy/30 bg-burgundy/5 p-4">
      <p className="font-medium text-ink mb-2">Delete your account</p>
      <p className="text-sm text-slate leading-relaxed mb-3">
        This removes your account, your collection, and every photo you have
        ever scanned. Your scan records are stripped of any link to you. It
        cannot be undone and your shelf cannot be recovered.
      </p>

      {hasWebSubscription && (
        <p className="text-sm text-slate leading-relaxed mb-3">
          Your Pro subscription will be cancelled as part of this. You will not
          be billed again.
        </p>
      )}

      {hasStoreSubscription && (
        <label className="flex gap-3 items-start mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            className="mt-1 shrink-0 accent-burgundy"
          />
          <span className="text-sm text-ink leading-relaxed">
            I understand my Pro subscription was bought through the App Store or
            Google Play, that Spritz cannot cancel it, and that I need to cancel
            it in my{" "}
            <a
              href="https://apps.apple.com/account/subscriptions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald underline underline-offset-2"
            >
              Apple
            </a>{" "}
            or{" "}
            <a
              href="https://play.google.com/store/account/subscriptions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald underline underline-offset-2"
            >
              Google Play
            </a>{" "}
            subscription settings or I will keep being charged.
          </span>
        </label>
      )}

      <label
        htmlFor="delete-confirm"
        className="block font-mono text-[10px] uppercase tracking-widest text-slate mb-1"
      >
        Type DELETE to confirm
      </label>
      <input
        id="delete-confirm"
        type="text"
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="DELETE"
        className="w-full rounded-lg border border-ink/20 bg-cream px-3 py-2 mb-3 text-ink placeholder:text-mist focus:outline-none focus:ring-2 focus:ring-burgundy/40"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setPhrase("");
            setAck(false);
            setError(null);
          }}
          disabled={busy}
          className="flex-1 border border-ink/15 text-ink py-3 rounded-xl font-medium hover:bg-ink/5 disabled:opacity-60 transition"
        >
          Keep my account
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={!canSubmit || busy}
          className="flex-1 bg-burgundy text-cream py-3 rounded-xl font-medium hover:bg-burgundy/90 disabled:opacity-40 transition"
        >
          {busy ? "Deleting…" : "Delete forever"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-burgundy leading-relaxed">
          {error}
        </p>
      )}
    </div>
  );
}

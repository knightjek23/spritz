"use client";

// Sign-in wall: the first screen a signed-out person sees in the app.
// ChatGPT's structure (wordmark centred, the ways in stacked at the
// bottom, Skip, the legal line) in Spritz's own system: emerald Playfair
// wordmark, mono line under it, square CTAs (no radius), 16/24px spacing.
//
// Who sees it:
//   - only inside the native shell. The website stays open: search engines,
//     affiliate-network reviewers and shared links all land on real pages.
//   - only when signed out, once Clerk has loaded (so a signed-in member
//     never sees a flash of it; on a cold launch the launch screen covers
//     the moment Clerk takes to load).
//   - until they sign in or tap Skip. Skip is remembered on the device, so
//     the wall does not come back; the Shelf, wear log and match still ask
//     for an account when used. Skip is here on purpose: App Store
//     guideline 5.1.1(v) rejects forcing a login for features that do not
//     need an account, and browsing the library does not.
//   - never on the auth pages themselves or the legal pages it links to.
//
// Order of the buttons: Google (emerald) then Apple (ink), same size.
// Guideline 4.8 requires Sign in with Apple wherever Google sign-in is
// offered and that it not be visually subordinate; Apple's button rules
// allow only black or white, so Apple is the ink button at full size.
// Email follows as the outlined secondary. Apple and Google use the existing system
// browser round trip (lib/native-auth.ts); email opens Clerk's own sign-in
// page, which also offers sign-up.
//
// A new account lands on /welcome (the bridge routes it); a returning one
// stays where they are, and the wall simply disappears once signed in.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { isNativeApp } from "@/lib/native";
import {
  NATIVE_AUTH_EVENT,
  beginNativeOAuth,
  type NativeAuthEventDetail,
  type NativeOAuthStrategy,
} from "@/lib/native-auth";

const SKIP_KEY = "spritz.wall.skipped";

/** Routes the wall never covers: signing in, and the pages it links to. */
const OPEN_PREFIXES = ["/sign-in", "/sign-up", "/native-auth", "/legal", "/support"];

type Phase = "idle" | "started" | "exchanging" | "error";

function skipped(): boolean {
  try {
    return window.localStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

export function SignInWall() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [eligible, setEligible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [active, setActive] = useState<NativeOAuthStrategy | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Native and Skip are read after mount so server and first client render
  // agree (the wall is never part of the server HTML).
  useEffect(() => {
    setEligible(isNativeApp() && !skipped());
  }, []);

  const open =
    eligible &&
    !dismissed &&
    isLoaded &&
    !isSignedIn &&
    !OPEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // Progress and errors from the browser round trip.
  useEffect(() => {
    if (!open) return;
    function onEvent(e: Event) {
      const d = (e as CustomEvent<NativeAuthEventDetail>).detail;
      if (d.phase === "error") {
        setError(d.message);
        setPhase("error");
      } else {
        setError(null);
        setPhase(d.phase === "complete" ? "idle" : d.phase);
      }
    }
    window.addEventListener(NATIVE_AUTH_EVENT, onEvent);
    return () => window.removeEventListener(NATIVE_AUTH_EVENT, onEvent);
  }, [open]);

  // Back from the browser without finishing (cancelled): reset the button.
  useEffect(() => {
    if (!open) return;
    function onVisible() {
      if (document.visibilityState === "visible" && phase === "started") {
        setTimeout(() => setPhase((p) => (p === "started" ? "idle" : p)), 1500);
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [open, phase]);

  // Nothing behind the wall scrolls while it is up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const busy = phase === "started" || phase === "exchanging";
  function label(strategy: NativeOAuthStrategy, name: string) {
    if (active === strategy && phase === "started") return `Opening ${name}…`;
    if (active === strategy && phase === "exchanging") return "Signing you in…";
    return `Continue with ${name}`;
  }
  function start(strategy: NativeOAuthStrategy) {
    setActive(strategy);
    setError(null);
    void beginNativeOAuth(strategy);
  }
  function skip() {
    try {
      window.localStorage.setItem(SKIP_KEY, "1");
    } catch {
      // Private mode: dismiss for this launch only.
    }
    setDismissed(true);
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sign-in-wall-title"
      className="fixed inset-0 z-[150] flex flex-col bg-cream text-ink"
      style={{
        paddingTop: "var(--safe-top)",
        paddingBottom: "calc(var(--safe-bottom) + 16px)",
      }}
    >
      {/* Wordmark, centred in the space above the buttons. */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <h1 id="sign-in-wall-title" className="font-display text-[56px] leading-none text-emerald">
          spritz
        </h1>
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-slate">
          Every fragrance, broken down
        </p>
      </div>

      <div className="mx-auto w-full max-w-md px-6 flex flex-col gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => start("oauth_google")}
          className="h-12 w-full flex items-center justify-center gap-3 bg-emerald text-cream text-base font-medium tracking-wide disabled:opacity-60 transition hover:bg-emerald/90"
        >
          {/* The multicolour G on a cream tile, so it reads on emerald. */}
          <span className="w-6 h-6 flex items-center justify-center bg-cream">
            <GoogleMark />
          </span>
          {label("oauth_google", "Google")}
        </button>

        {/* Apple: black, per Apple's button rules (black or white only),
            and the same size as Google so it is not subordinate
            (guideline 4.8). */}
        <button
          type="button"
          disabled={busy}
          onClick={() => start("oauth_apple")}
          className="h-12 w-full flex items-center justify-center gap-3 bg-ink text-cream text-base font-medium tracking-wide disabled:opacity-60 transition hover:bg-ink/90"
        >
          <AppleMark />
          {label("oauth_apple", "Apple")}
        </button>

        <div className="flex items-center gap-3 py-1 font-mono text-[10px] uppercase tracking-widest text-slate" aria-hidden>
          <span className="flex-1 border-t border-ink/10" />
          or
          <span className="flex-1 border-t border-ink/10" />
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => router.push("/sign-in")}
          className="h-12 w-full flex items-center justify-center border border-ink/15 text-ink text-base font-medium tracking-wide disabled:opacity-60 transition hover:bg-ink/5"
        >
          Continue with email
        </button>

        {error && (
          <p role="alert" className="text-sm text-burgundy">
            {error}
          </p>
        )}

        {/* Same treatment as Home's "Or search by name". */}
        <button
          type="button"
          onClick={skip}
          className="mx-auto min-h-[44px] px-4 text-sm text-slate underline underline-offset-4 hover:text-ink transition"
        >
          Skip for now
        </button>

        <p className="text-center font-mono text-[10px] uppercase tracking-widest leading-relaxed text-slate">
          By continuing you agree to our{" "}
          <Link href="/legal/terms" className="text-emerald underline underline-offset-2">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="text-emerald underline underline-offset-2">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>,
    document.body,
  );
}

function AppleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 814 1000" fill="currentColor" aria-hidden>
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

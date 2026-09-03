"use client";

// Social sign-in buttons for the native shell.
//
// Renders nothing on the web. Inside the shell, Clerk's own social buttons
// are hidden by CSS (globals.css, .native-app) because they run OAuth in
// the webview, which Google refuses. These replace them and route through
// the system browser instead (lib/native-auth.ts).
//
// Native detection happens in an effect, not during render, so the server
// and first client render agree and there is no hydration mismatch.

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/native";
import {
  NATIVE_AUTH_EVENT,
  beginNativeOAuth,
  type NativeAuthEventDetail,
} from "@/lib/native-auth";

type Phase = "idle" | "started" | "exchanging" | "error";

export function NativeSocialButtons({ mode }: { mode: "sign-in" | "sign-up" }) {
  const [native, setNative] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNative(isNativeApp());
  }, []);

  useEffect(() => {
    if (!native) return;
    function onEvent(e: Event) {
      const detail = (e as CustomEvent<NativeAuthEventDetail>).detail;
      if (detail.phase === "error") {
        setError(detail.message);
        setPhase("error");
      } else {
        setError(null);
        setPhase(detail.phase === "complete" ? "idle" : detail.phase);
      }
    }
    window.addEventListener(NATIVE_AUTH_EVENT, onEvent);
    return () => window.removeEventListener(NATIVE_AUTH_EVENT, onEvent);
  }, [native]);

  // Coming back from the browser without a callback (the user cancelled)
  // has to reset the button, or it stays on "Opening…" forever.
  useEffect(() => {
    if (!native) return;
    function onVisible() {
      if (document.visibilityState === "visible" && phase === "started") {
        // Give a real callback a beat to arrive before assuming a cancel.
        setTimeout(() => setPhase((p) => (p === "started" ? "idle" : p)), 1500);
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [native, phase]);

  if (!native) return null;

  const busy = phase === "started" || phase === "exchanging";
  const verb = mode === "sign-in" ? "Continue" : "Sign up";

  return (
    <div className="w-full max-w-sm mb-6">
      <button
        type="button"
        disabled={busy}
        onClick={() => beginNativeOAuth("oauth_google")}
        className="w-full h-11 flex items-center justify-center gap-3 border border-ink/20 bg-cream text-ink text-sm font-normal disabled:opacity-60"
      >
        {/* Clerk serves the provider marks it uses in its own buttons. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://img.clerk.com/static/google.svg" alt="" width={18} height={18} aria-hidden />
        <span>
          {phase === "started"
            ? "Opening Google…"
            : phase === "exchanging"
              ? "Signing you in…"
              : `${verb} with Google`}
        </span>
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-burgundy">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3 mt-6 text-xs text-slate" aria-hidden>
        <span className="flex-1 border-t border-ink/10" />
        or
        <span className="flex-1 border-t border-ink/10" />
      </div>
    </div>
  );
}

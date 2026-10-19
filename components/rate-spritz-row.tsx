"use client";

// "Rate Spritz" link on the Account page, native shell only. Opens the
// store's review form in the in-app browser (NativeAuthBridge routes
// external links there). The fallback for anyone the system prompt never
// reached; the prompt itself lives in lib/review-prompt.

import { useEffect, useState } from "react";
import { isNativeApp, nativePlatform } from "@/lib/native";
import { writeReviewUrl } from "@/lib/review-prompt";

export function RateSpritzRow() {
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNativeApp()), []);
  if (!native) return null;
  const store = nativePlatform() === "android" ? "Google Play" : "the App Store";
  return (
    <section className="mb-4">
      <p className="font-mono text-xs uppercase tracking-widest text-slate mb-3">
        Rate Spritz
      </p>
      <a
        href={writeReviewUrl()}
        className="flex items-center justify-between rounded-2xl border border-ink/15 px-4 py-4 text-ink"
      >
        <span>Leave a rating on {store}</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-slate">
          <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
      <p className="mt-2 text-xs text-slate leading-relaxed">
        A rating helps other fragrance people find Spritz.
      </p>
    </section>
  );
}

"use client";

// Ties PostHog events to the signed-in Clerk user, so funnels and retention
// are per person across web, iOS and Android (same Clerk ID everywhere).
// Signing out resets PostHog so the next person on the device starts fresh.
// Renders nothing; no-op when PostHog isn't loaded (no key set).

import { useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";

type PostHogLike = {
  identify: (id: string, props?: Record<string, unknown>) => void;
  reset: () => void;
};

function ph(): PostHogLike | null {
  if (typeof window === "undefined") return null;
  const p = (window as unknown as { posthog?: PostHogLike }).posthog;
  return p && typeof p.identify === "function" ? p : null;
}

export function PostHogIdentify() {
  const { isLoaded, isSignedIn, user } = useUser();
  const identified = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    const posthog = ph();
    if (!posthog) return;

    if (isSignedIn && user) {
      if (identified.current === user.id) return;
      posthog.identify(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName ?? undefined,
      });
      identified.current = user.id;
    } else if (identified.current) {
      // Was signed in on this page and now isn't: a real sign-out.
      posthog.reset();
      identified.current = null;
    }
  }, [isLoaded, isSignedIn, user]);

  return null;
}

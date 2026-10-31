"use client";

// Ties PostHog events to the signed-in Clerk user, so funnels and retention
// are per person across web, iOS and Android (same Clerk ID everywhere).
// Signing out resets PostHog so the next person on the device starts fresh.
// Renders nothing; no-op when PostHog isn't loaded (no key set).

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { notePath } from "@/lib/analytics";
import { nativePlatform } from "@/lib/native";

type PostHogLike = {
  identify: (
    id: string,
    set?: Record<string, unknown>,
    setOnce?: Record<string, unknown>,
  ) => void;
  reset: () => void;
  register: (props: Record<string, unknown>) => void;
};

function ph(): PostHogLike | null {
  if (typeof window === "undefined") return null;
  const p = (window as unknown as { posthog?: PostHogLike }).posthog;
  return p && typeof p.identify === "function" ? p : null;
}

export function PostHogIdentify() {
  const { isLoaded, isSignedIn, user } = useUser();
  const identified = useRef<string | null>(null);
  const pathname = usePathname();

  // Route memory for "where did they come from" (fragrance_viewed.source).
  useEffect(() => {
    if (pathname) notePath(pathname);
  }, [pathname]);

  useEffect(() => {
    if (!isLoaded) return;
    const posthog = ph();
    if (!posthog) return;

    if (isSignedIn && user) {
      if (identified.current === user.id) return;
      const plan = user.publicMetadata?.plan === "pro" ? "pro" : "free";
      posthog.identify(
        user.id,
        {
          email: user.primaryEmailAddress?.emailAddress,
          name: user.fullName ?? undefined,
          // Same source the pricing page reads (Clerk publicMetadata). Known
          // caveat: a hand-edited Supabase plan won't show here.
          plan,
        },
        { first_platform: nativePlatform() },
      );
      identified.current = user.id;
    } else if (identified.current) {
      // Was signed in on this page and now isn't: a real sign-out.
      posthog.reset();
      // reset() clears super properties; put the platform tag back.
      posthog.register({ platform: nativePlatform() });
      identified.current = null;
    }
  }, [isLoaded, isSignedIn, user]);

  return null;
}

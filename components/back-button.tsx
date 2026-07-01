"use client";

// Global back button — sits in the top-left of the nav on any non-tab
// route. Tapping goes back one step in browser history when that
// exists, or falls back to a sensible parent route when the user
// landed directly (deep link, external share, refreshed page, etc.).
//
// Why the fallback matters: router.back() is a no-op when
// window.history.length <= 1. Without a fallback, tapping the back
// button on a direct-landed page silently does nothing — reads as
// broken. The fallback routes each page back to its logical parent.

import { useRouter } from "next/navigation";

interface BackButtonProps {
  /** Route to navigate to when there's no browser history to go back
   *  through (direct link landings). Defaults to '/'. */
  fallbackHref?: string;
  /** Optional aria label override; defaults to "Go back". */
  label?: string;
}

export function BackButton({ fallbackHref = "/", label = "Go back" }: BackButtonProps) {
  const router = useRouter();

  function handleClick() {
    // window.history.length is 1 on a fresh direct landing (only the
    // current entry). Any real prior page adds an entry. Some browsers
    // start at 2 for a newly opened tab so > 1 is the safer floor.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      className="w-9 h-9 -ml-2 flex items-center justify-center text-ink hover:text-emerald transition rounded-full active:bg-ink/5"
    >
      {/* Same double-chevron drawing as public/icons/back.svg, inlined
          so the stroke color inherits from currentColor and picks up
          the button's text color. Two overlapping chevrons give a
          slightly heavier-weight arrow than a single stroke would,
          which reads better at the small size against the glass nav. */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden
      >
        <path
          d="M23 6L9 16L23 26"
          stroke="currentColor"
          strokeWidth="0.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M22.9999 8.54443L13.3076 16.0001L22.9999 23.4557"
          stroke="currentColor"
          strokeWidth="0.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

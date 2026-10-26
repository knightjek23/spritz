"use client";

// Streak toast — shown once, on the first wear log of a day.
//
// Motion: the streak badge (components/streak-badge.tsx) lands at the top
// of the card: ring, laurels growing, the bottle's head pressing and a puff
// of mist, the count rolling from yesterday's number to today's, rays
// bursting out. Then the headline ("Day 4" / "One week") dissolves in and
// the copy line rises beneath. The badge idles (slow rays, a spray every
// few seconds) until the card leaves. Milestones (7, 30, 100, 365) get a
// larger badge with a brass ring, larger type, a brass hairline and a
// longer hold. Keyframes live in app/globals.css under "streak toast" and
// "streak badge". The press-and-mist bottle comes from the earlier
// "D · Breath" prototype.
//
// Dismissal: leaves on its own after the hold (7 s daily, 9 s milestone)
// or earlier via the × / a tap on the card or the dimmed backdrop.
// prefers-reduced-motion collapses everything to a plain fade.
//
// Rendered through a portal onto <body>: the home block it lives in is
// animated with a transform (spritz-rise), which would otherwise turn
// position:fixed into position-relative-to-that-block and swallow the
// card's own fade. The backdrop dims everything else and fades with the
// card. The home block is the only caller.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StreakBadge } from "@/components/streak-badge";
import { streakCopy } from "@/lib/streak";

const HOLD_MS = { daily: 7000, milestone: 9000 } as const;
const OUT_MS = 600;

export function StreakToast({
  streak,
  returning,
  onClose,
}: {
  streak: number;
  returning: boolean;
  onClose: () => void;
}) {
  const copy = streakCopy(streak, returning);
  const [leaving, setLeaving] = useState(false);
  const closed = useRef(false);

  function close() {
    if (closed.current) return;
    closed.current = true;
    setLeaving(true);
    window.setTimeout(onClose, OUT_MS);
  }

  useEffect(() => {
    const t = window.setTimeout(close, copy.milestone ? HOLD_MS.milestone : HOLD_MS.daily);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Line the card's bottom edge up with the bottom of the "Scan a bottle"
  // CTA. Measured after the home block has re-rendered with today's entry
  // (this effect runs in the same commit). Off-screen CTA → centred.
  const [anchorBottom, setAnchorBottom] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!mounted) return;
    // The home CTA, not the bottom nav's Scan tab.
    const cta = [...document.querySelectorAll<HTMLElement>('a[href="/scan"]')].find(
      (a) => !a.closest("nav"),
    );
    if (!cta) return;
    const r = cta.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.bottom > 180 && r.bottom < vh - 24) setAnchorBottom(vh - r.bottom);
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <div className={`streak-layer ${leaving ? "streak-layer--out" : ""}`} onClick={close} data-no-longpress>
    <div
      role="status"
      aria-live="polite"
      onClick={(e) => e.stopPropagation()}
      className={`streak-toast ${copy.milestone ? "streak-toast--milestone" : ""}`}
      style={
        anchorBottom !== null
          ? ({ "--anchor-bottom": `${Math.round(anchorBottom)}px` } as React.CSSProperties)
          : undefined
      }
    >
      <StreakBadge streak={streak} milestone={copy.milestone} size={copy.milestone ? 248 : 220} />

      {/* Badge only on screen. The copy is still announced to screen
          readers, since the badge alone is just a number to them. */}
      <p className="sr-only">
        {copy.title}. {copy.line}
      </p>

      <button
        type="button"
        aria-label="Dismiss"
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
        className="absolute top-2 right-2 w-9 h-9 flex items-center justify-center text-slate hover:text-ink hover:bg-ink/5 transition"
        data-no-longpress
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
    </div>
    </div>,
    document.body,
  );
}

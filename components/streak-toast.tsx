"use client";

// Streak toast — shown once, on the first wear log of a day.
//
// Motion (approved prototype "D · Breath", 2026-10-20): the bottle settles
// in from the left; at 0.5 s the gold head depresses onto the neck and
// springs back; a soft cone of mist widens from the nozzle and holds while
// the headline ("Day 4" / "One week") dissolves into view inside it; the
// copy line rises beneath; the mist trails off over ~3 s. Milestones (7,
// 30, 100, 365) get a larger bottle, larger type, a brass hairline and a
// longer hold. Keyframes live in app/globals.css under "streak toast".
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

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StreakBottle } from "@/components/streak-bottle";
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

  // Nine brass flecks ride the mist; positions chosen once per mount.
  const flecks = useRef(
    Array.from({ length: 9 }, () => {
      const ang = ((Math.random() * 24 - 8) * Math.PI) / 180;
      const len = 60 + Math.random() * 100;
      return {
        r: (0.7 + Math.random() * 0.5).toFixed(2),
        dx: (Math.cos(ang) * len).toFixed(1),
        dy: (Math.sin(ang) * len * 0.5).toFixed(1),
        t: (1.6 + Math.random() * 0.8).toFixed(2),
        d: (0.75 + Math.random() * 0.45).toFixed(2),
      };
    }),
  ).current;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className={`streak-layer ${leaving ? "streak-layer--out" : ""}`} onClick={close} data-no-longpress>
    <div
      role="status"
      aria-live="polite"
      onClick={(e) => e.stopPropagation()}
      className={`streak-toast ${copy.milestone ? "streak-toast--milestone" : ""}`}
    >
      <div className="streak-mark">
        <StreakBottle />
        <svg className="streak-mist" viewBox="0 0 190 48" fill="none" aria-hidden>
          <defs>
            <linearGradient id="streak-mist-g" x1="0" x2="1">
              <stop offset="0" stopColor="#1F3F2E" stopOpacity=".32" />
              <stop offset=".35" stopColor="#1F3F2E" stopOpacity=".13" />
              <stop offset=".72" stopColor="#1F3F2E" stopOpacity=".03" />
              <stop offset=".9" stopColor="#1F3F2E" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            className="streak-cone"
            d="M0 8 C40 0 100 -8 172 -12 C190 -4 192 84 174 94 L0 8 Z"
            fill="url(#streak-mist-g)"
          />
          {flecks.map((f, i) => (
            <circle
              key={i}
              className="streak-fleck"
              cx="0"
              cy="8"
              r={f.r}
              style={
                {
                  "--dx": `${f.dx}px`,
                  "--dy": `${f.dy}px`,
                  "--t": `${f.t}s`,
                  "--d": `${f.d}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </svg>
      </div>

      <div className="min-w-0 -mt-1 pr-6">
        <p
          className={`streak-day font-display text-emerald leading-none ${copy.title.length > 10 ? "streak-day--long" : ""}`}
        >
          {copy.title}
        </p>
        <p className="streak-line font-display text-emerald leading-tight mt-2">{copy.line}</p>
      </div>

      <button
        type="button"
        aria-label="Dismiss"
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
        className="absolute top-2 right-2 w-9 h-9 rounded-full flex items-center justify-center text-slate hover:text-ink hover:bg-ink/5 transition"
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

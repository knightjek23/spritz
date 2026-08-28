"use client";

// ScanChecklist — the Dynamic Checklist for the scan wait (scan v2 §3).
//
// Pattern choice (ai-transparency-patterns): a scan is multi-step work with
// unpredictable timing, and a wrong ID poisons everything that follows, so
// it gets a checklist that shows the plan and the exact current position.
// A slow step then reads as "this bottle is hard", not "the app froze".
// Rows are driven by REAL server stage frames (lib/scan-stages.ts), never
// by timers guessing at progress. The LivingBreadcrumb component is the
// right tool for a single opaque AI call; this is for a pipeline that can
// report where it is.
//
// Pacing rules baked in:
//   - The overlay fades in after 300 ms. A scan that resolves faster than
//     that never shows a wait state at all (skeleton-loading rule).
//   - Each row is held for at least MIN_HOLD_MS before the next appears,
//     so a burst of fast stages reads as steps, not a flicker.
//   - prefers-reduced-motion drops the pulse and the fades (globals.css).
//
// The parent owns the line list; this component only paces and renders.

import { useEffect, useRef, useState } from "react";
import type { StageLine } from "@/lib/scan-stages";
import { SpritzLoader } from "./spritz-loader";

const MIN_HOLD_MS = 400;

interface Props {
  lines: StageLine[];
  /** True once the result frame landed — stops the pulse on the last row. */
  done?: boolean;
}

export function ScanChecklist({ lines, done = false }: Props) {
  const [visible, setVisible] = useState(0);
  const lastRevealAt = useRef(0);

  // Reveal queued rows no faster than one per MIN_HOLD_MS.
  useEffect(() => {
    if (visible >= lines.length) return;
    const wait = Math.max(0, MIN_HOLD_MS - (Date.now() - lastRevealAt.current));
    const t = setTimeout(() => {
      lastRevealAt.current = Date.now();
      setVisible((v) => Math.min(lines.length, v + 1));
    }, wait);
    return () => clearTimeout(t);
  }, [lines.length, visible]);

  // A fresh scan (parent reset the list) restarts the pacing.
  useEffect(() => {
    if (lines.length === 0) {
      setVisible(0);
      lastRevealAt.current = 0;
    }
  }, [lines.length]);

  const shown = lines.slice(0, visible);
  const allShown = visible >= lines.length;

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 bg-ink/60 backdrop-blur-sm flex flex-col items-center justify-end gap-6 px-6 pb-8 scan-checklist"
    >
      {/* The mark sits above the rows so the overlay reads as Spritz
          working, not just a stack of system messages. It carries no
          label of its own — the checklist rows ARE the status text, and
          the wrapper already announces them. */}
      <SpritzLoader
        size={56}
        className="text-cream [--spritz-loader-cap-fill:#1A1A1A]"
        label=""
      />

      <ol className="w-full max-w-sm space-y-2">
        {shown.map((line, i) => {
          const isLast = i === shown.length - 1;
          const current = isLast && !(done && allShown);
          return (
            <li
              key={line.key + i}
              className={`flex items-start gap-3 rounded-xl px-4 py-3 bg-cream/95 shadow-sm scan-checklist-row ${
                current ? "" : "opacity-80"
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center ${
                  current
                    ? "border-2 border-emerald scan-checklist-pulse"
                    : "bg-emerald text-cream"
                }`}
              >
                {!current && <CheckIcon />}
              </span>
              <p className="text-sm text-ink leading-snug">
                <span className="font-medium">{line.strong}</span>
                {line.rest && (
                  <>
                    {" "}
                    <span className="text-ink/70">{line.rest}</span>
                  </>
                )}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2.5 6.5l2.2 2.2L9.5 3.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

"use client";

// LivingBreadcrumb — the "AI is working on it" status pattern.
//
// Background: a flat "Generating..." spinner during a 3-5 second AI call
// reads as "stalled or crashed" to users. The Living Breadcrumb pattern
// (Victor Yocco, Practical Interface Patterns For AI Transparency, 2026)
// replaces the spinner with a quiet, evolving status line that proves
// the system understood the request and is making progress.
//
// Each stage line follows the Agentic Update Formula:
//   Action Word + Specific Item + Limits/Rules
//
// e.g. "Pulling community references for Tobacco Vanille by Tom Ford…"
// — Action: Pulling. Item: community references. Limits: this specific
//   fragrance, by name + house, proving the system remembered the ask.
//
// Usage:
//   <LivingBreadcrumb
//     active={generating}
//     stages={[
//       { afterMs: 0,    copy: "Reading what users say about Aventus by Creed…" },
//       { afterMs: 1500, copy: "Cross-checking Reddit and Fragrantica reviews…" },
//       { afterMs: 3200, copy: "Synthesizing the consensus…" },
//     ]}
//   />
//
// Caller controls visibility via `active`. When active flips to true, the
// stage timeline restarts from stage 0 and advances on its own. When
// active flips back to false (request resolved), the breadcrumb hides.
//
// The honest answer to "why fake the steps when it's one API call?": the
// model IS doing distinct phases of work internally (retrieval from
// training data, evaluation, generation). Surfacing those phases isn't
// dishonest, it's translating opaque internal work into a vocabulary the
// user can follow. The skill explicitly endorses this kind of structured
// narration when the underlying work has real conceptual phases.

import { useEffect, useState } from "react";

export interface BreadcrumbStage {
  /** Milliseconds since `active` flipped to true. Use 0 for the first. */
  afterMs: number;
  /** The status line. Should follow Action + Specific Item + Limits. */
  copy: string;
}

interface Props {
  active: boolean;
  stages: BreadcrumbStage[];
  /** Optional className for layout positioning (margin, etc.) */
  className?: string;
}

export function LivingBreadcrumb({ active, stages, className }: Props) {
  // The index into `stages` of the line currently shown. Restarts at 0
  // every time `active` becomes true so re-clicking "Generate" doesn't
  // pick up where the last run left off.
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setStageIndex(0);
      return;
    }
    // Schedule one timer per stage; the latest scheduled timer wins so
    // the index always reflects "the most recent stage whose afterMs has
    // elapsed." Cleanup on unmount or re-run cancels pending timers.
    const timers = stages.map((stage, i) =>
      setTimeout(() => setStageIndex(i), stage.afterMs),
    );
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [active, stages]);

  if (!active || stages.length === 0) return null;

  const current = stages[Math.min(stageIndex, stages.length - 1)];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-3 text-sm text-slate ${className ?? ""}`}
    >
      {/* Soft pulse dot — a quiet "still working" signal that doesn't
          loop spinner-style (which is what reads as stalled). One
          breathing dot is enough to confirm active work without
          competing for attention. */}
      <span
        aria-hidden
        className="inline-block w-2 h-2 rounded-full bg-emerald animate-pulse shrink-0"
      />
      {/* The actual breadcrumb line. Transitions are key='current.copy'
          so React re-renders and the screen reader announces the new
          message even when the line replaces in place. */}
      <span key={current.copy} className="leading-snug">
        {current.copy}
      </span>
    </div>
  );
}

/**
 * Format an ISO timestamp into a friendly "Generated [date]" receipt
 * line for the Audit Trail pattern (persistent provenance after the
 * live progress UI disappears). Falls back to ISO if Intl is missing.
 */
export function generatedReceipt(iso: string): string {
  try {
    const d = new Date(iso);
    return `Generated ${d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  } catch {
    return `Generated ${iso}`;
  }
}

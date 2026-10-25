"use client";

// The call to action on every Pro gate (design 2026-10-25).
//
// Default: "Try Pro free for 7 days" with the billed amount directly
// beneath it, same size, same ink: App Store guideline 3.1.2(c) requires
// the billed amount be no less conspicuous than the trial. Users who have
// already had a trial (GET /api/trial) see "Unlock with Pro" instead, so
// the gate never promises a free week the store will refuse.
//
// One fetch per page, shared by every gate on it.

import { useEffect, useState } from "react";
import Link from "next/link";
import { TRIAL_CTA } from "@/lib/trial";

let eligibility: Promise<boolean> | null = null;
function trialAvailable(): Promise<boolean> {
  if (!eligibility) {
    eligibility = fetch("/api/trial")
      .then((r) => (r.ok ? r.json() : { used: false }))
      .then((j: { used?: boolean }) => !j.used)
      .catch(() => true);
  }
  return eligibility;
}

export function TrialCta({ className = "" }: { className?: string }) {
  // Optimistic: most people arriving at a gate have never trialed.
  const [available, setAvailable] = useState(true);
  useEffect(() => {
    let live = true;
    trialAvailable().then((v) => live && setAvailable(v));
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className={`flex flex-col items-start gap-2 ${className}`}>
      <Link
        href="/pricing"
        className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-brass text-ink font-medium hover:bg-brass/80 transition"
      >
        {available ? TRIAL_CTA.label : "Unlock with Pro"}
      </Link>
      {available && <p className="text-sm text-ink">{TRIAL_CTA.sub}</p>}
    </div>
  );
}

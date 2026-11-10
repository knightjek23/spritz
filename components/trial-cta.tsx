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
//
// Inside the native apps the amount is the store's own localized price
// (lib/native/store-prices.ts). Until it is known, or if the store has no
// free intro offer, the gate says "Unlock with Pro" with no amount: never
// a USD figure next to a local-currency purchase sheet.

import { useEffect, useState } from "react";
import Link from "next/link";
import { MONTHLY_PRICE, trialCta } from "@/lib/trial";
import { trackProGateCta, type ProFeature } from "@/lib/pro-events";
import { monthlyPriceFor, useStorePrices } from "@/lib/native/store-prices";

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

export function TrialCta({
  className = "",
  feature,
}: {
  className?: string;
  /** Gate this CTA belongs to. Set it only where the gate doesn't already
   *  record its own tap (match and layering wrap theirs), or taps double. */
  feature?: ProFeature;
}) {
  // Optimistic: most people arriving at a gate have never trialed.
  const [available, setAvailable] = useState(true);
  useEffect(() => {
    let live = true;
    trialAvailable().then((v) => live && setAvailable(v));
    return () => {
      live = false;
    };
  }, []);

  const prices = useStorePrices();
  const price = monthlyPriceFor(prices, MONTHLY_PRICE);
  // Native: only offer the trial when the store itself has a free intro offer.
  const storeHasTrial = prices.status !== "ready" || prices.plans.monthly.trial !== null;
  const offer = available && price !== null && storeHasTrial ? trialCta(price) : null;

  return (
    <div className={`flex flex-col items-start gap-2 ${className}`}>
      <Link
        href="/pricing"
        onClick={feature ? () => trackProGateCta(feature) : undefined}
        className="inline-flex items-center gap-2 px-4 py-3 bg-brass text-ink font-medium hover:bg-brass/80 transition"
      >
        {offer ? offer.label : "Unlock with Pro"}
      </Link>
      {offer && <p className="text-sm text-ink">{offer.sub}</p>}
    </div>
  );
}

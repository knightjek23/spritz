"use client";

// Fires `pro_gate_shown` once from a server-rendered gate. Renders nothing.
// Server components can't call PostHog, so they drop this in next to the
// locked copy.

import { useEffect } from "react";
import { trackProGateShown, type ProFeature } from "@/lib/pro-events";

export function ProGateTracker({ feature, state }: { feature: ProFeature; state: string }) {
  useEffect(() => {
    trackProGateShown(feature, { state });
  }, [feature, state]);
  return null;
}

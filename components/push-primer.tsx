"use client";

// Notification primer (D21, D22). Native shell only.
//
// Shown on the scan receipt the first time a native user gets a match,
// before the OS prompt, so the one-shot iOS permission is only ever asked
// of someone who has just said yes to a concrete promise: one notification,
// the day after each scan, about the bottle they scanned.
//
// "Not now" hides it for the session and re-offers on a later scan, up to
// PRIMER_DISMISS_CAP times. After that the person has answered and the
// Account page toggle is the only remaining path.

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/native";
import {
  PRIMER_DISMISS_CAP,
  getPushPermission,
  primerDismissCount,
  recordPrimerDismiss,
  requestPushAndRegister,
} from "@/lib/push";

type State = "hidden" | "offer" | "asking" | "thanks";

export function PushPrimer({ fragranceName }: { fragranceName: string }) {
  const [state, setState] = useState<State>("hidden");

  useEffect(() => {
    if (!isNativeApp()) return;
    if (primerDismissCount() >= PRIMER_DISMISS_CAP) return;
    let cancelled = false;
    getPushPermission().then((p) => {
      if (!cancelled && p === "prompt") setState("offer");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "hidden") return null;

  async function onYes() {
    setState("asking");
    const p = await requestPushAndRegister();
    // Granted: the registration listener in NativeAuthBridge stores the
    // token. Denied at the OS prompt: nothing more to offer, the card goes.
    setState(p === "granted" ? "thanks" : "hidden");
    if (p === "granted") setTimeout(() => setState("hidden"), 2500);
  }

  function onNotNow() {
    recordPrimerDismiss();
    setState("hidden");
  }

  if (state === "thanks") {
    return (
      <p role="status" className="mb-8 text-xs text-slate text-center">
        Done. Look for a note about {fragranceName} tomorrow.
      </p>
    );
  }

  return (
    <div
      role="region"
      aria-label="Notification offer"
      className="mb-8 border border-ink/10 bg-paper px-4 py-4"
    >
      <p className="font-display text-lg leading-snug">
        Want a follow-up on {fragranceName} tomorrow?
      </p>
      <p className="mt-1 text-sm text-slate leading-relaxed">
        One notification, the day after each scan, with how it wears and what to
        compare it to.
      </p>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={onYes}
          disabled={state === "asking"}
          className="h-10 px-4 bg-emerald text-cream text-sm disabled:opacity-60"
        >
          {state === "asking" ? "Asking…" : "Yes, notify me"}
        </button>
        <button
          type="button"
          onClick={onNotNow}
          disabled={state === "asking"}
          className="h-10 px-4 text-sm text-slate"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

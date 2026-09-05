"use client";

// Notifications row on the Account page. Native shell only; renders
// nothing on the web, where there is nothing to toggle.
//
// Two sources of truth, shown honestly:
//   - the OS permission (granted / denied / never asked)
//   - the server's flag (an enabled token exists for this user)
// Off = tell the server to stop; the OS permission is left alone so
// turning it back on needs no trip to Settings. If the OS permission is
// denied, the toggle cannot help and the row says so.

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/native";
import {
  disablePush,
  getPushPermission,
  isPushEnabledOnServer,
  requestPushAndRegister,
  type PushPermission,
} from "@/lib/push";

export function PushSettings() {
  const [native, setNative] = useState(false);
  const [permission, setPermission] = useState<PushPermission>("unavailable");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    setNative(true);
    (async () => {
      const [p, e] = await Promise.all([getPushPermission(), isPushEnabledOnServer()]);
      setPermission(p);
      setEnabled(e);
    })();
  }, []);

  if (!native) return null;

  const on = permission === "granted" && enabled === true;

  async function toggle() {
    setBusy(true);
    try {
      if (on) {
        await disablePush();
        setEnabled(false);
      } else {
        const p = await requestPushAndRegister();
        setPermission(p);
        // The token lands via the bridge's registration listener a moment
        // later; reflect the intent now and let the next load confirm it.
        if (p === "granted") setEnabled(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-8">
      <p className="font-mono text-xs uppercase tracking-widest text-slate mb-3">
        Notifications
      </p>
      <div className="rounded-xl border border-ink/10 px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-ink">Scan follow-ups</p>
          <p className="text-xs text-slate mt-0.5">
            {permission === "denied"
              ? "Turned off in iOS Settings. Enable notifications for Spritz there to turn this on."
              : "One notification the day after each scan."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Scan follow-up notifications"
          disabled={busy || permission === "denied" || enabled === null}
          onClick={toggle}
          className={`relative shrink-0 w-11 h-6 rounded-full transition disabled:opacity-50 ${
            on ? "bg-emerald" : "bg-ink/20"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-cream transition-transform ${
              on ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>
    </section>
  );
}

"use client";

// Inline "we missed this" report form for the /scan no-match flow.
//
// Three states: idle (the trigger button), open (form with prefilled
// brand/name from OCR + send button), submitted (success acknowledgment).
//
// The form is intentionally lightweight — two fields, no captcha, no
// account required. We want the friction-to-signal ratio low because each
// report directly feeds catalog expansion priorities.

import { useState } from "react";

interface Props {
  scanEventId: string;
  /** OCR's best guess at the brand. Prefilled into the brand field. */
  detectedBrand: string | null;
  /** OCR's best guess at the name. Prefilled into the name field. */
  detectedName: string | null;
}

export function ReportMiss({ scanEventId, detectedBrand, detectedName }: Props) {
  const [open, setOpen] = useState(false);
  const [brand, setBrand] = useState(detectedBrand ?? "");
  const [name, setName] = useState(detectedName ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!brand.trim() && !name.trim()) {
      setError("Add at least the brand or the name.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/scan/${scanEventId}/report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brand: brand.trim() || undefined,
          name: name.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "send_failed");
        return;
      }
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  // Final state — short, warm confirmation. Don't keep showing the form
  // so the user can't double-submit.
  if (submitted) {
    return (
      <div className="rounded-xl border border-emerald/30 bg-emerald/5 p-4">
        <p className="font-display text-lg text-emerald mb-1">Got it.</p>
        <p className="text-sm text-ink leading-relaxed">
          Thanks for the heads-up. We use these to prioritize what to add to
          the catalog next. You&apos;ll be able to scan it soon.
        </p>
      </div>
    );
  }

  // Idle trigger — quiet button below the search/retry CTAs.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-center text-sm text-slate hover:text-ink underline underline-offset-2 py-2 transition"
      >
        We missed this — tell us about it
      </button>
    );
  }

  // Open form state.
  return (
    <div className="rounded-xl border border-ink/15 bg-paper/30 p-4">
      <p className="font-display text-lg mb-1">Help us add this one</p>
      <p className="text-sm text-slate leading-relaxed mb-4">
        We&apos;ll log it and add it to the catalog next. Brand alone is fine
        if you don&apos;t remember the exact name.
      </p>

      <label className="block mb-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate">
          Brand / House
        </span>
        <input
          type="text"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder="e.g. Tom Ford"
          autoComplete="off"
          maxLength={120}
          className="mt-1 w-full px-3 py-2 rounded-lg border border-ink/15 bg-cream focus:outline-none focus:border-ink text-sm"
        />
      </label>

      <label className="block mb-4">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate">
          Fragrance name
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Tobacco Vanille"
          autoComplete="off"
          maxLength={120}
          className="mt-1 w-full px-3 py-2 rounded-lg border border-ink/15 bg-cream focus:outline-none focus:border-ink text-sm"
        />
      </label>

      {error && (
        <p className="text-sm text-burgundy mb-3">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 py-2.5 rounded-lg border border-ink/15 text-ink text-sm font-medium hover:bg-ink/5 transition"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="flex-1 py-2.5 rounded-lg bg-emerald text-cream text-sm font-medium hover:bg-emerald/90 transition disabled:opacity-60"
        >
          {submitting ? "Sending…" : "Send report"}
        </button>
      </div>
    </div>
  );
}

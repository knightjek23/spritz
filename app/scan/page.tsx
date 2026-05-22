"use client";

// Scan flow. Day 1 scaffold: file-input camera capture so the page works
// on iOS Safari and Chrome Android out of the box. Day 6 will polish to
// a full-bleed getUserMedia camera with corner-bracket guides.
//
// Signed-out behavior: scanning still works (catalog reads are public),
// but we surface a soft prompt that signing in saves the scan history
// and lets the user add the match to a collection.
//
// No-match flow: we tell the user what was read, offer a search fallback,
// and offer a "still can't find it" path that lets them stash the OCR
// result so we can backfill the catalog later (via the unmatched_scans
// summary view).

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { ReportMiss } from "@/components/report-miss";
import { CameraCapture } from "@/components/camera-capture";
import type { ScanResult } from "@/lib/types";

export default function ScanPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  // Single capture handler — CameraCapture passes raw base64 (already
  // stripped of the data: prefix), so we just POST and dispatch on the
  // ScanResult. Identical contract to the previous file-input flow.
  async function onCapture(base64: string) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: base64 }),
      });
      const data = (await res.json()) as ScanResult | { error: string };

      if (!res.ok) {
        setError("error" in data ? data.error : "scan_failed");
        return;
      }

      const r = data as ScanResult;
      if (r.matched) {
        router.push(`/fragrance/${r.matched.id}`);
        return;
      }
      setResult(r); // disambiguation picker
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <h1 className="font-display text-3xl mb-2">Scan a bottle</h1>
      <p className="text-slate text-sm mb-6">
        Point at the label. We&apos;ll read the brand and name in a second or two.
      </p>

      {/* Live camera viewport with bracket guides + tap-to-capture.
          CameraCapture handles permission flow, fallback to file input,
          and the captured/retake/confirm cycle internally. */}
      <CameraCapture onCapture={onCapture} busy={busy} />

      {/* Soft sign-in nudge — only shown to signed-out users, only before
          they've scanned anything. Non-blocking. */}
      <SignedOut>
        {!busy && !result && !error && (
          <p className="mt-6 text-sm text-slate text-center">
            <Link href="/sign-up" className="text-emerald underline underline-offset-2">
              Sign up free
            </Link>{" "}
            to save scans, track what you own, and build a wishlist.
          </p>
        )}
      </SignedOut>

      {error && (
        <div className="mt-6 p-4 rounded-xl border border-burgundy/30 bg-burgundy/5">
          <p className="text-burgundy text-sm mb-1">
            Couldn&apos;t scan: {error}.
          </p>
          <p className="text-sm text-ink">
            Lighting and angle matter. Try a flatter shot of the label, then{" "}
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-emerald underline underline-offset-2"
            >
              try again
            </button>{" "}
            or{" "}
            <Link href="/search" className="text-emerald underline underline-offset-2">
              search by name
            </Link>
            .
          </p>
        </div>
      )}

      {result && !result.matched && (
        <div className="mt-8">
          <p className="text-sm text-ink mb-3">
            We read{" "}
            <span className="font-medium">
              &ldquo;{result.detected_brand} {result.detected_name}&rdquo;
            </span>
            . Pick the closest match:
          </p>
          <ul className="space-y-2">
            {result.candidates.map((c) => (
              <li key={c.fragrance.id}>
                <Link
                  href={`/fragrance/${c.fragrance.id}`}
                  className="block px-4 py-3 rounded-xl border border-ink/15 hover:bg-ink/5"
                >
                  <div className="font-medium">{c.fragrance.name}</div>
                  <div className="text-xs text-slate">
                    {c.fragrance.house} · {Math.round(c.confidence * 100)}% match
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Either we found zero candidates, OR none of the ones we found
              looked right — give the user a graceful out either way. */}
          <div className="mt-6 pt-6 border-t border-ink/10">
            <p className="text-sm text-ink mb-1 font-medium">
              {result.candidates.length === 0
                ? "Nothing close in our catalog yet."
                : "Not the one?"}
            </p>
            <p className="text-sm text-slate mb-4 leading-relaxed">
              We log every miss and use them to prioritize what to add next.
              In the meantime, you can search by name in case the OCR misread
              something.
            </p>
            <div className="flex flex-col gap-2">
              <Link
                href={`/search?q=${encodeURIComponent(
                  `${result.detected_brand ?? ""} ${result.detected_name ?? ""}`.trim(),
                )}`}
                className="text-center px-4 py-3 rounded-xl bg-emerald text-cream font-medium hover:bg-emerald/90 transition"
              >
                Search the catalog
              </Link>
              <SignedIn>
                <Link
                  href="/scan"
                  className="text-center px-4 py-3 rounded-xl border border-ink/15 text-ink font-medium hover:bg-ink/5 transition"
                  onClick={() => {
                    setResult(null);
                    setError(null);
                  }}
                >
                  Try another bottle
                </Link>
              </SignedIn>
              <SignedOut>
                <Link
                  href="/sign-up"
                  className="text-center text-xs text-slate hover:text-ink transition py-2"
                >
                  Sign up to save your scan history
                </Link>
              </SignedOut>
            </div>

            {/* Catalog gap report. Sits below the primary actions so it
                doesn't compete, but it's the highest-signal input we get
                for what to scrape/write editorial for next. */}
            <div className="mt-6">
              <ReportMiss
                scanEventId={result.scan_event_id}
                detectedBrand={result.detected_brand}
                detectedName={result.detected_name}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

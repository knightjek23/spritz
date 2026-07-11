"use client";

// /scan — full-screen camera takeover.
//
// In the default state, this page mounts the CameraCapture component
// which renders a fixed-position, full-bleed camera UI (matching the
// Figma design). The h1/subtitle that used to live above the camera are
// gone: the camera IS the page.
//
// On a successful scan:
//   - Match           → router.push(`/fragrance/${id}`) inside onCapture,
//                       and CameraCapture is unmounted as the page navigates.
//   - Disambiguation  → `result` is set with candidates; CameraCapture
//                       unmounts and we show the picker beneath the page's
//                       (now-visible) cream surface.
//   - No match        → same picker UI, but the copy and the catalog-gap
//                       report ("we missed this") take over.
//
// CameraCapture stays mounted only while !result, so the live camera
// indicator is properly torn down the moment a scan resolves.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignedOut } from "@clerk/nextjs";
import { ReportMiss } from "@/components/report-miss";
import { CameraCapture } from "@/components/camera-capture";
import type { ScanResult } from "@/lib/types";

// Server error slugs → human copy. Anything unrecognized falls back to a
// generic line rather than leaking a raw code into the UI.
function errorCopy(code: string): string {
  switch (code) {
    case "rate_limited":
      return "You've hit today's scan limit. It resets at midnight UTC — or search by name below.";
    case "invalid_body":
      return "That photo didn't come through right. Try taking it again.";
    case "scan_failed":
    default:
      return "Something went wrong reading the bottle. Give it another try.";
  }
}

export default function ScanPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  // Single capture handler — CameraCapture passes raw base64 (already
  // stripped of the data: prefix), so we just POST and dispatch on the
  // ScanResult shape.
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
      // Defensive parse: a proxy-level 500/502 may have no JSON body, and
      // the raw SyntaxError must never reach the error banner.
      const data = (await res.json().catch(() => null)) as
        | ScanResult
        | { error: string }
        | null;

      if (!res.ok || !data) {
        setError(errorCopy(data && "error" in data ? data.error : "scan_failed"));
        return;
      }

      const r = data as ScanResult;
      if (r.matched) {
        // Direct hand-off to the library page. CameraCapture is
        // unmounted as the navigation completes.
        router.push(`/fragrance/${r.matched.id}`);
        return;
      }
      // Miss → set result so the no-match panel renders and the camera
      // unmounts cleanly.
      setResult(r);
    } catch {
      // Network failure / offline — not a server error code.
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  // ============== Camera mode ==============
  // While there's no result, the camera owns the whole screen. The error
  // banner is overlaid as a sticky-bottom strip so the user can see it
  // without leaving the camera surface.
  if (!result) {
    return (
      <>
        <CameraCapture onCapture={onCapture} busy={busy} />
        {error && (
          <div className="fixed left-0 right-0 bottom-28 mx-auto max-w-sm z-[60] px-4">
            <div className="p-4 rounded-xl border border-burgundy/40 bg-cream shadow-lg">
              <p className="text-burgundy text-sm mb-1">{error}</p>
              <p className="text-sm text-ink">
                Lighting and angle matter. Try a flatter shot, then{" "}
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-emerald underline underline-offset-2"
                >
                  try again
                </button>{" "}
                or{" "}
                <Link
                  href="/search"
                  className="text-emerald underline underline-offset-2"
                >
                  search by name
                </Link>
                .
              </p>
            </div>
          </div>
        )}
      </>
    );
  }

  // ============== Disambiguation / miss panel ==============
  // Shown when the scan returned candidates but none auto-matched, OR
  // when no candidates came back at all. The camera is unmounted at this
  // point — this is a normal scrollable page.
  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-slate mb-2">
          Scan result
        </p>
        <h1 className="font-display text-3xl">
          {result.candidates.length > 0 ? "Pick the closest match" : "We didn’t catch that"}
        </h1>
      </header>

      <p className="text-sm text-ink mb-4">
        We read{" "}
        <span className="font-medium">
          &ldquo;{result.detected_brand} {result.detected_name}&rdquo;
        </span>
        .
      </p>

      {result.candidates.length > 0 && (
        <ul className="space-y-2 mb-6">
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
      )}

      {/* Either zero candidates, or none of the ones we found looked right.
          Either way, give the user a graceful out. */}
      <div className="pt-6 border-t border-ink/10">
        <p className="text-sm text-ink mb-1 font-medium">
          {result.candidates.length === 0
            ? "Nothing close in our catalog yet."
            : "Not the one?"}
        </p>
        <p className="text-sm text-slate mb-4 leading-relaxed">
          We log every miss and use them to prioritize what to add next. In
          the meantime, you can search by name in case the OCR misread
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
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setError(null);
            }}
            className="text-center px-4 py-3 rounded-xl border border-ink/15 text-ink font-medium hover:bg-ink/5 transition"
          >
            Try another bottle
          </button>
          <SignedOut>
            <Link
              href="/sign-up"
              className="text-center text-xs text-slate hover:text-ink transition py-2"
            >
              Sign up to save your scan history
            </Link>
          </SignedOut>
        </div>

        {/* Catalog gap report — highest-signal input for what to scrape /
            write editorial for next. */}
        <div className="mt-6">
          <ReportMiss
            scanEventId={result.scan_event_id}
            detectedBrand={result.detected_brand}
            detectedName={result.detected_name}
          />
        </div>
      </div>
    </div>
  );
}

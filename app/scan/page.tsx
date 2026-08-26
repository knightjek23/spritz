"use client";

// /scan — full-screen camera takeover (scan v2).
//
// The camera IS the page. On capture we POST to /api/scan with
// `Accept: application/x-ndjson` and consume the stage frames as they
// stream (lib/scan-stages.ts):
//   - stage frames   → rows in the Dynamic Checklist overlay
//   - candidates     → router.prefetch() on the top 3 detail pages, so the
//                      final navigation lands on a warm route
//   - result         → match: closing line, then push to /fragrance/[id]
//                      (with ?scan=<event> for the audit-trail receipt)
//                      miss:  the picker / catalog-gap panel below
//   - error          → honest copy naming the real cause (errorCopy)
// If the server answers with plain JSON (older deploy, proxy stripped the
// body stream), the same handler falls back to parsing it whole.
//
// `?event=<scan_event_id>` reopens a past scan's picker (linked from the
// receipt on the detail page: "Not it? See N other close matches").
//
// CameraCapture stays mounted only while !result, so the live camera
// indicator is properly torn down the moment a scan resolves.

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SignedOut } from "@clerk/nextjs";
import { ReportMiss } from "@/components/report-miss";
import { CameraCapture } from "@/components/camera-capture";
import { BottleImage } from "@/components/bottle-image";
import {
  errorCopy,
  resultLine,
  stageLine,
  type ScanFrame,
  type StageLine,
} from "@/lib/scan-stages";
import type { ScanResult } from "@/lib/types";

// How long the "Found it. Opening …" row stays on screen before the push.
// Long enough to read, short enough that the prefetched page feels instant.
const DONE_HOLD_MS = 450;
const PREFETCH_TOP_N = 3;

export default function ScanPage() {
  return (
    // useSearchParams needs a Suspense boundary on a client page or Next
    // bails the whole route out to client rendering.
    <Suspense fallback={null}>
      <ScanPageInner />
    </Suspense>
  );
}

function ScanPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const reopenEventId = params.get("event");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [stages, setStages] = useState<StageLine[] | undefined>(undefined);
  const [stagesDone, setStagesDone] = useState(false);
  const prefetched = useRef(new Set<string>());

  const pushLine = useCallback((line: StageLine | null) => {
    if (!line) return;
    setStages((prev) => {
      const list = prev ?? [];
      // Same stage key twice (e.g. a second "matching" after a web
      // fallback) replaces the row rather than stacking a duplicate.
      const i = list.findIndex((l) => l.key === line.key);
      if (i >= 0) {
        const next = list.slice();
        next[i] = line;
        return next;
      }
      return [...list, line];
    });
  }, []);

  const prefetch = useCallback(
    (id: string) => {
      if (prefetched.current.has(id)) return;
      prefetched.current.add(id);
      router.prefetch(`/fragrance/${id}`);
    },
    [router],
  );

  function handleFrame(frame: ScanFrame): ScanResult | null {
    switch (frame.type) {
      case "stage":
        pushLine(stageLine(frame));
        return null;
      case "candidates":
        frame.items.slice(0, PREFETCH_TOP_N).forEach((c) => prefetch(c.id));
        return null;
      case "result":
        return frame.result;
      case "error":
        throw new ScanFailure(frame.code);
    }
  }

  async function finish(r: ScanResult) {
    pushLine(resultLine(r));
    setStagesDone(true);
    if (r.matched) {
      prefetch(r.matched.id);
      await new Promise((res) => setTimeout(res, DONE_HOLD_MS));
      router.push(`/fragrance/${r.matched.id}?scan=${r.scan_event_id}`);
      return;
    }
    // Miss → set result so the picker renders and the camera unmounts.
    setResult(r);
  }

  async function onCapture(base64: string) {
    setBusy(true);
    setError(null);
    setResult(null);
    setStages([]);
    setStagesDone(false);
    prefetched.current.clear();

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/x-ndjson",
        },
        body: JSON.stringify({ image: base64 }),
      });

      const isStream = (res.headers.get("content-type") ?? "").includes("x-ndjson");

      if (!res.ok || !isStream || !res.body) {
        // Pre-pipeline rejections (400/429) and non-streaming servers
        // answer with one JSON object. Defensive parse: a proxy-level 502
        // may have no JSON body, and a SyntaxError must never reach the UI.
        const data = (await res.json().catch(() => null)) as
          | ScanResult
          | { error: string }
          | null;
        if (!res.ok || !data) {
          throw new ScanFailure(data && "error" in data ? data.error : "scan_failed");
        }
        if ("error" in data) throw new ScanFailure(data.error);
        await finish(data);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let final: ScanResult | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          let frame: ScanFrame;
          try {
            frame = JSON.parse(line) as ScanFrame;
          } catch {
            continue;
          }
          final = handleFrame(frame) ?? final;
        }
      }
      if (!final) throw new ScanFailure("scan_failed");
      await finish(final);
    } catch (err) {
      if (err instanceof ScanFailure) {
        setError(errorCopy(err.code));
      } else {
        // Network failure / offline — not a server error code.
        setError("We couldn’t reach the server. Check your connection and try again.");
      }
      setStages(undefined);
      setStagesDone(false);
    } finally {
      setBusy(false);
    }
  }

  // Reopen a past scan's picker from the detail-page receipt.
  useEffect(() => {
    if (!reopenEventId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/scan/${reopenEventId}`);
      const data = (await res.json().catch(() => null)) as ScanResult | null;
      if (!cancelled && res.ok && data) setResult({ ...data, matched: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [reopenEventId]);

  // ============== Camera mode ==============
  if (!result) {
    return (
      <>
        <CameraCapture
          onCapture={onCapture}
          busy={busy}
          stages={stages}
          stagesDone={stagesDone}
        />
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
                <Link href="/search" className="text-emerald underline underline-offset-2">
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
  const hasCandidates = result.candidates.length > 0;
  const readSomething = !!(result.detected_brand || result.detected_name);
  const labelUnreadable = result.partial === "label_unreadable";

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-slate mb-2">
          Scan result
        </p>
        <h1 className="font-display text-3xl">
          {hasCandidates ? "Pick the one in your hand" : "Couldn’t place this one yet"}
        </h1>
      </header>

      {/* What we actually got from the photo. Partial success is named as
          such, so a shape-only shortlist never poses as a confident read. */}
      <p className="text-sm text-ink mb-4">
        {labelUnreadable ? (
          <>
            The label wasn’t readable, so these are the bottles whose{" "}
            <span className="font-medium">shape and color</span> come closest.
          </>
        ) : readSomething ? (
          <>
            We read{" "}
            <span className="font-medium">
              &ldquo;{[result.detected_brand, result.detected_name].filter(Boolean).join(" ")}&rdquo;
            </span>
            {hasCandidates ? ", but no single bottle was a confident match." : "."}
          </>
        ) : (
          <>We couldn’t read a label or recognise the bottle.</>
        )}
      </p>

      {hasCandidates && (
        <ul className="space-y-2 mb-6">
          {result.candidates.map((c) => (
            <li key={c.fragrance.id}>
              <Link
                href={`/fragrance/${c.fragrance.id}?scan=${result.scan_event_id}`}
                className="group flex items-center gap-4 px-4 py-3 rounded-xl border border-ink/15 hover:bg-ink/5"
              >
                <div className="relative w-12 h-16 shrink-0">
                  <BottleImage
                    src={c.fragrance.bottle_image_url}
                    house={c.fragrance.house}
                    name={c.fragrance.name}
                    sizes="48px"
                  />
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.fragrance.name}</div>
                  <div className="text-xs text-slate">
                    {c.fragrance.house}
                    {c.text_score == null && c.visual_score != null
                      ? " · closest by bottle shape"
                      : ` · ${Math.round(c.confidence * 100)}% match`}
                  </div>
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
          {hasCandidates ? "Not the one?" : "Nothing close in our catalog yet."}
        </p>
        <p className="text-sm text-slate mb-4 leading-relaxed">
          We log every miss and use them to prioritize what to add next. In
          the meantime, you can search by name in case the label was misread.
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
              setStages(undefined);
              if (reopenEventId) router.replace("/scan");
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

class ScanFailure extends Error {
  constructor(public code: string) {
    super(code);
  }
}

"use client";

// ScanReceipt — the persistent "why" under a scanned fragrance's hero.
//
// ai-transparency-patterns, "the attention reality": people tap Scan, look
// away, and judge the app by the page they land on. The live checklist is
// gone by then. This one-liner is the audit trail that survives it:
//   "Matched from your scan by label text + bottle shape · Not it? See 3
//    other close matches"
//
// Client component on purpose: the detail page is ISR-cached and must not
// read searchParams on the server (that would make it dynamic for every
// crawler). We read ?scan=<id> here, fetch the stored event, and render
// nothing at all when the param is absent, so the cached HTML is unchanged.

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { matchMethodLabel } from "@/lib/scan-stages";
import type { ScanResult } from "@/lib/types";

export function ScanReceipt({ fragranceId }: { fragranceId: string }) {
  return (
    <Suspense fallback={null}>
      <ScanReceiptInner fragranceId={fragranceId} />
    </Suspense>
  );
}

function ScanReceiptInner({ fragranceId }: { fragranceId: string }) {
  const params = useSearchParams();
  const scanId = params.get("scan");
  const [event, setEvent] = useState<ScanResult | null>(null);

  useEffect(() => {
    if (!scanId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/scan/${scanId}`);
      const data = (await res.json().catch(() => null)) as ScanResult | null;
      if (!cancelled && res.ok && data) setEvent(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [scanId]);

  if (!scanId || !event) return null;

  const others = event.candidates.filter((c) => c.fragrance.id !== fragranceId).length;
  const wasMatch = event.matched?.id === fragranceId;

  return (
    <p className="-mt-4 mb-8 text-xs text-slate text-center leading-relaxed">
      {wasMatch ? (
        <>Matched from your scan by {matchMethodLabel(event.match_method)}.</>
      ) : (
        <>You picked this from your scan’s close matches.</>
      )}
      {others > 0 && (
        <>
          {" "}
          Not it?{" "}
          <Link
            href={`/scan?event=${scanId}`}
            className="text-emerald underline underline-offset-2 hover:text-ink transition"
          >
            See {others} other close {others === 1 ? "match" : "matches"}
          </Link>
        </>
      )}
    </p>
  );
}

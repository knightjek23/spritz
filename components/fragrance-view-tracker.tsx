"use client";

// Fires `fragrance_viewed` once per fragrance page visit, with where the
// person came from. Renders nothing. Reads the URL in an effect (not
// useSearchParams) so the statically generated page needs no Suspense.

import { useEffect } from "react";
import { pathBefore, track } from "@/lib/analytics";

function sourceFrom(prev: string | null, hasScan: boolean): string {
  if (hasScan) return "scan";
  if (!prev) return "link"; // landed here directly: share, search engine, push
  if (prev.startsWith("/scan")) return "scan";
  if (prev.startsWith("/search")) return "search";
  if (prev.startsWith("/collection")) return "shelf";
  if (prev.startsWith("/fragrance/")) return "fragrance";
  if (prev.startsWith("/compare")) return "compare";
  if (prev === "/") return "home";
  return "browse"; // library, house, family, note, perfumer pages
}

export function FragranceViewTracker({ fragranceId }: { fragranceId: string }) {
  useEffect(() => {
    const here = window.location.pathname;
    const hasScan = new URLSearchParams(window.location.search).has("scan");
    track("fragrance_viewed", {
      fragrance_id: fragranceId,
      source: sourceFrom(pathBefore(here), hasScan),
    });
  }, [fragranceId]);
  return null;
}

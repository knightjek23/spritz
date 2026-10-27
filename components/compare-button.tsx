"use client";

// "Compare with…" on the fragrance page. Tapping reveals the search field
// in picker mode; picking a fragrance opens /compare?a=<this>&b=<picked>.
// The second bottle is chosen here, not on /compare, so the user lands on
// a finished comparison rather than an empty form.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchAutocomplete } from "@/components/search-autocomplete";
import { trackFeatureUsed } from "@/lib/pro-events";
import type { Fragrance } from "@/lib/types";

export function CompareButton({ fragranceId, name, house }: { fragranceId: string; name: string; house: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function pick(f: Fragrance) {
    if (f.id === fragranceId) return;
    trackFeatureUsed("compare", { from: "fragrance_page" });
    router.push(`/compare?a=${encodeURIComponent(fragranceId)}&b=${encodeURIComponent(f.id)}`);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full border border-ink/15 px-4 py-3 text-sm font-medium text-ink hover:bg-paper transition text-left"
      >
        Compare with another fragrance
      </button>
    );
  }

  return (
    <div className="border border-ink/15 p-3">
      <p className="font-mono text-xs uppercase tracking-widest text-slate mb-2">
        Compare {name} by {house} with
      </p>
      <SearchAutocomplete
        autoFocus
        placeholder="Search a fragrance to compare…"
        onPick={pick}
        leading="back"
        onLeadingClick={() => setOpen(false)}
      />
    </div>
  );
}

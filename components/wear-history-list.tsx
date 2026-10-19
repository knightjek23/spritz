"use client";

// Day-grouped wear history with per-entry remove. Client component only
// for the × (DELETE /api/wear); the list itself is rendered from the
// server-fetched entries and updated optimistically.

import { useState } from "react";
import Link from "next/link";
import { BottleImage } from "@/components/bottle-image";
import type { WearEntry } from "@/lib/wear-log";

function dayHeading(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function WearHistoryList({ initial }: { initial: WearEntry[] }) {
  const [entries, setEntries] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(entry: WearEntry) {
    if (busy) return;
    setBusy(entry.id);
    const prev = entries;
    setEntries(prev.filter((e) => e.id !== entry.id));
    try {
      const res = await fetch(`/api/wear?id=${entry.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setEntries(prev);
    } finally {
      setBusy(null);
    }
  }

  // Group by day, preserving the server's newest-first order.
  const days: { day: string; items: WearEntry[] }[] = [];
  for (const e of entries) {
    const last = days[days.length - 1];
    if (last && last.day === e.wornOn) last.items.push(e);
    else days.push({ day: e.wornOn, items: [e] });
  }

  if (days.length === 0) {
    return <p className="text-sm text-slate">Nothing logged yet.</p>;
  }

  return (
    <section className="space-y-8">
      {days.map(({ day, items }) => (
        <div key={day}>
          <h2 className="font-display text-xl mb-3">{dayHeading(day)}</h2>
          <ul className="space-y-2">
            {items.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-3 px-3 py-2 rounded-xl bg-paper border border-ink/10"
              >
                <Link
                  href={`/fragrance/${e.fragrance.id}`}
                  className="flex items-center gap-3 min-w-0 flex-1 hover:brightness-95 transition"
                >
                  <div className="shrink-0 w-10 h-14 relative">
                    <BottleImage
                      src={e.fragrance.bottle_image_url}
                      house={e.fragrance.house}
                      name={e.fragrance.name}
                      sizes="40px"
                      className="object-contain mix-blend-multiply"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{e.fragrance.name}</div>
                    <div className="text-xs text-slate truncate">{e.fragrance.house}</div>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => remove(e)}
                  disabled={busy === e.id}
                  aria-label={`Remove ${e.fragrance.name} from ${dayHeading(day)}`}
                  className="shrink-0 w-8 h-8 rounded-full text-slate hover:text-ink hover:bg-ink/5 disabled:opacity-50 transition"
                  data-no-longpress
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

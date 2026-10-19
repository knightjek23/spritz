"use client";

// "What are you wearing today?" — first block on the signed-in home.
//
// Two states, keyed on whether today already has entries:
//   Prompt: a horizontal scroller of the Owned shelf; tapping a bottle
//           logs it for today (POST /api/wear).
//   Logged: "Today you're wearing X" with the bottle(s), "Add another" to
//           reopen the scroller, and a small Undo per entry.
//
// "Today" is the phone's local calendar day, computed after mount (the
// server cannot know the viewer's timezone). The server passes every
// entry from the last couple of UTC days, and this component keeps the
// ones whose worn_on equals the local day, so no fetch on load and no
// wrong-day logs around midnight.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BottleImage } from "@/components/bottle-image";
import type { OwnedBottle, WearEntry } from "@/lib/wear-log";

function localDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function WearingToday({
  owned,
  recent,
}: {
  owned: OwnedBottle[];
  recent: WearEntry[];
}) {
  const [today, setToday] = useState<string | null>(null);
  const [entries, setEntries] = useState<WearEntry[]>([]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = localDay();
    setToday(d);
    setEntries(recent.filter((e) => e.wornOn === d));
  }, [recent]);

  const dateLabel = useMemo(
    () =>
      today
        ? new Date(`${today}T12:00:00`).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })
        : "",
    [today],
  );

  const loggedIds = new Set(entries.map((e) => e.fragrance.id));

  async function log(fragranceId: string) {
    if (!today || busy) return;
    setBusy(fragranceId);
    setError(null);
    try {
      const res = await fetch("/api/wear", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fragrance_id: fragranceId, worn_on: today }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { entries: WearEntry[] };
      setEntries(json.entries);
      setPicking(false);
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function undo(entry: WearEntry) {
    if (busy) return;
    setBusy(entry.id);
    setError(null);
    const prev = entries;
    setEntries(prev.filter((e) => e.id !== entry.id));
    try {
      const res = await fetch(`/api/wear?id=${entry.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setEntries(prev);
      setError("Couldn't remove that. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (owned.length === 0) return null;

  const showPicker = today !== null && (entries.length === 0 || picking);

  return (
    <section className="spritz-rise spritz-rise-1 mb-10">
      <p className="font-mono text-xs uppercase tracking-widest text-slate mb-1">
        Today{dateLabel ? ` · ${dateLabel}` : ""}
      </p>

      {entries.length === 0 ? (
        <h2 className="font-display text-3xl leading-[0.95] mb-4">What are you wearing?</h2>
      ) : (
        <h2 className="font-display text-3xl leading-[0.95] mb-4">
          You&apos;re wearing{" "}
          <span className="text-emerald">{joinNames(entries.map((e) => e.fragrance.name))}</span>.
        </h2>
      )}

      {entries.length > 0 && (
        <ul className="space-y-2 mb-3">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-paper border border-ink/10">
              <Link href={`/fragrance/${e.fragrance.id}`} className="flex items-center gap-3 min-w-0 flex-1">
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
                onClick={() => undo(e)}
                disabled={busy === e.id}
                className="shrink-0 text-xs text-slate hover:text-ink underline underline-offset-4 disabled:opacity-50"
                data-no-longpress
              >
                Undo
              </button>
            </li>
          ))}
        </ul>
      )}

      {entries.length > 0 && !picking && (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="text-sm text-slate hover:text-ink underline underline-offset-4"
          data-no-longpress
        >
          Add another
        </button>
      )}

      {showPicker && (
        <div className="-mx-6 px-6 scroll-pl-6 overflow-x-auto snap-x snap-mandatory slim-scrollbar">
          <ul className="flex gap-3 pb-2">
            {owned
              .filter((b) => !loggedIds.has(b.id))
              .map((b) => (
                <li key={b.id} className="snap-start shrink-0 w-[112px]">
                  <button
                    type="button"
                    onClick={() => log(b.id)}
                    disabled={busy !== null}
                    className="group w-full text-left disabled:opacity-60"
                    data-no-longpress
                  >
                    <div className="relative w-full aspect-[3/4] rounded-xl bg-paper border border-ink/10 overflow-hidden group-hover:brightness-95 transition">
                      <BottleImage
                        src={b.bottle_image_url}
                        house={b.house}
                        name={b.name}
                        sizes="112px"
                        className="object-contain p-2 mix-blend-multiply"
                      />
                      {busy === b.id && (
                        <div className="absolute inset-0 bg-cream/60 flex items-center justify-center text-xs text-slate">
                          Saving…
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-sm font-medium leading-tight line-clamp-2">{b.name}</div>
                    <div className="text-xs text-slate truncate">{b.house}</div>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}

      {picking && entries.length > 0 && (
        <button
          type="button"
          onClick={() => setPicking(false)}
          className="mt-1 text-xs text-slate hover:text-ink underline underline-offset-4"
          data-no-longpress
        >
          Done
        </button>
      )}

      {error && <p className="mt-2 text-xs text-burgundy">{error}</p>}
    </section>
  );
}

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

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BottleImage } from "@/components/bottle-image";
import { StreakToast } from "@/components/streak-toast";
import { streakEndingOn } from "@/lib/streak";
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
  days,
}: {
  owned: OwnedBottle[];
  recent: WearEntry[];
  /** Every distinct day with an entry (newest first); the streak is computed here against the local day. */
  days: string[];
}) {
  const router = useRouter();
  const [today, setToday] = useState<string | null>(null);
  const [entries, setEntries] = useState<WearEntry[]>([]);
  const [streak, setStreak] = useState(0);
  const [toast, setToast] = useState<{ streak: number; returning: boolean } | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = localDay();
    setToday(d);
    setEntries(recent.filter((e) => e.wornOn === d));
    setStreak(streakEndingOn(days, d));
  }, [recent, days]);

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

  // /?wear=<fragrance id> (from "Wear it today" in Insights) logs that
  // bottle once today is known, then drops the param so a reload or a
  // back-navigation can't log it again.
  const autoLogged = useRef(false);
  useEffect(() => {
    if (!today || autoLogged.current) return;
    const id = new URLSearchParams(window.location.search).get("wear");
    if (!id) return;
    autoLogged.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    if (owned.some((b) => b.id === id) && !loggedIds.has(id)) void log(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

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
      const json = (await res.json()) as {
        entries: WearEntry[];
        streak: number;
        firstToday: boolean;
        returning: boolean;
      };
      setEntries(json.entries);
      setStreak(json.streak);
      // The streak toast fires once per day, on the first log.
      if (json.firstToday) setToast({ streak: json.streak, returning: json.returning });
      setPicking(false);
      // The router keeps a client-side copy of this page from before the
      // log. Without this, tapping away and back to Home served that copy,
      // which still showed the empty picker, so the bottle looked
      // "unchosen" even though the entry was saved and the streak counted.
      router.refresh();
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
    const prevStreak = streak;
    const next = prev.filter((e) => e.id !== entry.id);
    setEntries(next);
    // Undoing the only entry of the day takes today out of the streak.
    // streakEndingOn() returns 0 when today has no entry, so this is 0.
    if (next.length === 0) setStreak(0);
    try {
      const res = await fetch(`/api/wear?id=${entry.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh(); // same reason as in log()
    } catch {
      // Put back exactly what was shown, rather than recomputing from the
      // server's day list: that list predates today's log, so the recompute
      // produced a different number from the one the user had just seen.
      setEntries(prev);
      setStreak(prevStreak);
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
        {streak > 0 && <span className="text-emerald"> · Day {streak}</span>}
      </p>

      {toast && (
        <StreakToast
          streak={toast.streak}
          returning={toast.returning}
          onClose={() => setToast(null)}
        />
      )}

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
            <li key={e.id} className="flex items-center gap-2 pl-3 pr-1 py-1 rounded-xl bg-paper border border-ink/10">
              <Link
                href={`/fragrance/${e.fragrance.id}`}
                className="flex items-center gap-3 min-w-0 flex-1 py-1"
                // Keep the link's touch handling off the Undo button beside it.
                onClick={(ev) => {
                  if (busy) ev.preventDefault();
                }}
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
              {/* Full-height tap target with its own padding, so a thumb
                  landing near "Undo" hits the button and not the row link
                  beside it. Previously the text alone was the target
                  (~30x16px) next to a link filling the rest of the row,
                  and near-misses opened the fragrance page. */}
              <button
                type="button"
                onClick={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  undo(e);
                }}
                disabled={busy === e.id}
                className="shrink-0 min-w-[64px] min-h-[44px] px-3 rounded-lg text-xs text-slate hover:text-ink hover:bg-ink/5 underline underline-offset-4 disabled:opacity-50 transition"
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

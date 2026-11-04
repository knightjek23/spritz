"use client";

// The fragrance list on /note/[slug] and /family/[slug], with "See more".
//
// The server renders the first 50 (BROWSE_PAGE_SIZE) and passes the full
// match count; each tap on "See more" appends the next 50 from
// /api/browse/[kind]/[slug]. The button sits at the end of the list, so
// it is what you reach when you scroll to the bottom, and it says how many
// are left so the tap is never a guess. Rows already on screen are kept on
// failure; the button turns into a retry.

import { useEffect, useState } from "react";
import Link from "next/link";
import { BottleImage } from "@/components/bottle-image";
import { SpritzLoader } from "@/components/spritz-loader";
import type { BrowsePage, BrowseRow } from "@/lib/browse-pages";

const LAYER_LABEL: Record<string, string> = { top: "top", mid: "heart", base: "base" };
const LAYER_PILL: Record<string, string> = {
  top: "bg-brass/40 text-ink",
  mid: "bg-paper text-ink",
  base: "bg-ink/10 text-ink",
};

export function BrowseList({
  kind,
  slug,
  initialRows,
  total,
}: {
  kind: "note" | "family";
  slug: string;
  initialRows: BrowseRow[];
  total: number;
}) {
  const [rows, setRows] = useState(initialRows);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const remaining = Math.max(0, total - rows.length);
  const storeKey = `spritz.browse.${kind}.${slug}`;

  // Keep the "See more" rows for this list for the session, so switching
  // tabs and coming back (lib/tab-memory.ts) restores the list at the
  // length you had loaded, and the saved scroll position still exists.
  // Restored after mount, not in the initial state, so the server and
  // client first render agree. Only reused when it still starts with the
  // same bottles the server sent, i.e. the ordering has not changed.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(storeKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { rows: BrowseRow[] };
      if (
        Array.isArray(saved.rows) &&
        saved.rows.length > initialRows.length &&
        initialRows.every((r, i) => saved.rows[i]?.id === r.id)
      ) {
        setRows(saved.rows);
      }
    } catch {
      // ignore
    }
    // initialRows is server data for this slug; storeKey covers changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);

  useEffect(() => {
    if (rows.length <= initialRows.length) return;
    try {
      window.sessionStorage.setItem(storeKey, JSON.stringify({ rows }));
    } catch {
      // Quota / private mode: the list just starts at 50 again.
    }
  }, [rows, storeKey, initialRows.length]);

  async function loadMore() {
    if (state === "loading") return;
    setState("loading");
    try {
      const res = await fetch(
        `/api/browse/${kind}/${encodeURIComponent(slug)}?offset=${rows.length}`,
      );
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as BrowsePage;
      setRows((prev) => {
        // Belt and braces against a double tap landing twice.
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...page.rows.filter((r) => !seen.has(r.id))];
      });
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <ul className="space-y-2">
        {rows.map((f) => (
          <li key={f.id}>
            <Link
              href={`/fragrance/${f.id}`}
              className="flex items-center gap-3 px-3 py-2 rounded-xl bg-paper border border-ink/10 hover:brightness-95 transition"
            >
              <div className="shrink-0 w-12 h-16 relative">
                <BottleImage
                  src={f.bottle_image_url}
                  house={f.house}
                  name={f.name}
                  sizes="48px"
                  className="object-contain mix-blend-multiply"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{f.name}</div>
                <div className="text-xs text-slate truncate">
                  {f.house}
                  {f.year ? ` · ${f.year}` : ""}
                </div>
              </div>
              {f.layer && (
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider ${
                    LAYER_PILL[f.layer] ?? LAYER_PILL.base
                  }`}
                >
                  {LAYER_LABEL[f.layer] ?? f.layer}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {remaining > 0 && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={state === "loading"}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-ink/15 px-5 text-sm font-medium text-ink transition hover:bg-ink/5 disabled:opacity-60"
          >
            {state === "loading" ? (
              <>
                <SpritzLoader size={20} label="" />
                Loading
              </>
            ) : state === "error" ? (
              "Couldn't load more. Try again"
            ) : (
              "See more"
            )}
          </button>
          <p className="font-mono text-[11px] uppercase tracking-widest text-slate" aria-live="polite">
            Showing {rows.length} of {total}
          </p>
        </div>
      )}
    </>
  );
}

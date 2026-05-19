"use client";

// Typeahead search — Google-style instant suggestions as you type.
//
// Behaviour:
//   - Debounce input by ~180ms before hitting /api/search.
//   - AbortController cancels in-flight requests when the query changes,
//     so the dropdown never flashes a stale older result.
//   - Keyboard: ↓/↑ to move highlight, Enter to navigate, Esc to close.
//   - Mouse: click anywhere outside to close.
//   - First suggestion is auto-highlighted so Enter from the input
//     navigates to the most likely match (matches Google behavior).
//
// Backed by the existing /api/search route (trigram on name + house).
// We slice down to 8 in the UI to keep the dropdown scannable.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Fragrance } from "@/lib/types";

const DEBOUNCE_MS = 180;
const MAX_SUGGESTIONS = 8;
const MIN_QUERY_LEN = 2;

interface Props {
  /** Optional initial value when landing on /search?q=… */
  initialQuery?: string;
  /** Placeholder for the input. */
  placeholder?: string;
  /** When true, autoFocus on mount (use on the /search page; skip in nav). */
  autoFocus?: boolean;
  /**
   * Called whenever the input value changes. The /search page uses this to
   * keep its full-results list in sync with what the user is typing.
   */
  onQueryChange?: (q: string) => void;
  /**
   * Called when the user submits (Enter on the bare input with no highlighted
   * suggestion). The /search page uses this to commit a "show me everything"
   * results render. If unset, we fall through to navigating to
   * /search?q=<query> so this component works as a drop-in nav element too.
   */
  onSubmit?: (q: string) => void;
  /**
   * Picker mode — when provided, selecting a suggestion calls this callback
   * with the picked fragrance instead of navigating to its detail page.
   * Used by the onboarding flow to capture selections without leaving the
   * page. When unset, behavior is link-style: clicks navigate.
   */
  onPick?: (fragrance: Fragrance) => void;
  /**
   * When set, the input is cleared after a successful pick — useful for
   * "pick multiple in a row" interfaces like onboarding.
   */
  clearOnPick?: boolean;
}

export function SearchAutocomplete({
  initialQuery = "",
  placeholder = "Search any fragrance, brand, or note…",
  autoFocus = false,
  onQueryChange,
  onSubmit,
  onPick,
  clearOnPick = false,
}: Props) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<Fragrance[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Debounced fetch ----
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = q.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      setSuggestions([]);
      setLoading(false);
      // Cancel anything in flight from a prior longer query.
      abortRef.current?.abort();
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      // Cancel any prior in-flight request — only the latest matters.
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const data = await res.json();
        const hits: Fragrance[] = (data.results ?? []).slice(0, MAX_SUGGESTIONS);
        setSuggestions(hits);
        setHighlight(0);
        setOpen(true);
      } catch (err: any) {
        // AbortError is expected when the user keeps typing — swallow it.
        if (err?.name !== "AbortError") {
          setSuggestions([]);
        }
      } finally {
        // Only the active controller flips loading off, so a stale finally
        // can't unset loading mid-flight on the new request.
        if (abortRef.current === ctrl) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  // ---- Click outside closes the dropdown ----
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function commit(fragrance?: Fragrance) {
    if (fragrance) {
      // Picker mode: hand the fragrance back to the parent and stay put.
      if (onPick) {
        onPick(fragrance);
        setOpen(false);
        if (clearOnPick) {
          setQ("");
          setSuggestions([]);
          onQueryChange?.("");
          // Keep focus so users can pick another immediately.
          inputRef.current?.focus();
        }
        return;
      }
      router.push(`/fragrance/${fragrance.id}`);
      setOpen(false);
      return;
    }
    const trimmed = q.trim();
    if (trimmed.length < MIN_QUERY_LEN) return;
    if (onSubmit) {
      onSubmit(trimmed);
    } else {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length === 0) return;
      setOpen(true);
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length === 0) return;
      setOpen(true);
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = open && suggestions[highlight] ? suggestions[highlight] : undefined;
      commit(target);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showDropdown =
    open && q.trim().length >= MIN_QUERY_LEN && (loading || suggestions.length > 0);

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Input — combobox per WAI-ARIA 1.2 pattern */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="search-suggestions"
          aria-autocomplete="list"
          aria-activedescendant={
            showDropdown && suggestions[highlight]
              ? `search-suggestion-${suggestions[highlight].id}`
              : undefined
          }
          value={q}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            onQueryChange?.(v);
            if (v.trim().length >= MIN_QUERY_LEN) setOpen(true);
          }}
          onFocus={() => {
            if (q.trim().length >= MIN_QUERY_LEN && suggestions.length > 0) {
              setOpen(true);
            }
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          className="w-full px-4 py-3 pr-10 rounded-xl border border-ink/20 bg-cream focus:outline-none focus:border-ink"
        />
        {/* Loading dot — subtle, no spinner since dropdown stays clean */}
        {loading && (
          <span
            aria-hidden
            className="absolute right-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-emerald animate-pulse"
          />
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <ul
          id="search-suggestions"
          role="listbox"
          className="absolute left-0 right-0 mt-2 bg-cream border border-ink/10 rounded-xl shadow-lg overflow-hidden z-20"
        >
          {suggestions.length === 0 && loading && (
            <li className="px-4 py-3 text-sm text-slate">Searching…</li>
          )}
          {suggestions.map((f, idx) => {
            const inner = (
              <>
                {f.bottle_image_url ? (
                  <div className="shrink-0 w-10 h-14 relative">
                    <Image
                      src={f.bottle_image_url}
                      alt=""
                      fill
                      sizes="40px"
                      className="object-contain mix-blend-multiply"
                    />
                  </div>
                ) : (
                  <div
                    className="shrink-0 w-10 h-14 rounded bg-paper border border-ink/5"
                    aria-hidden
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate text-ink">{f.name}</div>
                  <div className="text-xs text-slate truncate">
                    {f.house}
                    {f.year ? ` · ${f.year}` : ""}
                  </div>
                </div>
                {Array.isArray(f.family) && f.family[0] && (
                  <span className="hidden sm:inline-block font-mono text-[10px] uppercase tracking-wider text-slate shrink-0">
                    {f.family[0]}
                  </span>
                )}
              </>
            );
            const itemClass = `flex items-center gap-3 px-3 py-2.5 transition ${
              idx === highlight ? "bg-paper" : "bg-transparent"
            }`;
            return (
              <li
                key={f.id}
                id={`search-suggestion-${f.id}`}
                role="option"
                aria-selected={idx === highlight}
              >
                {onPick ? (
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => commit(f)}
                    className={`${itemClass} w-full text-left`}
                  >
                    {inner}
                  </button>
                ) : (
                  <Link
                    href={`/fragrance/${f.id}`}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => setOpen(false)}
                    className={itemClass}
                  >
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
          {/* "See all results" footer only makes sense in link mode —
              picker mode users want to keep adding selections, not search. */}
          {suggestions.length > 0 && !onPick && (
            <li className="border-t border-ink/5">
              <button
                type="button"
                onClick={() => commit()}
                className="w-full text-left px-4 py-2.5 text-xs font-mono uppercase tracking-wider text-slate hover:bg-paper transition"
              >
                See all results for &ldquo;{q.trim()}&rdquo;
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

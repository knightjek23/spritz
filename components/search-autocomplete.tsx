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

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cleanBottleImageUrl } from "@/lib/bottle-image";
import { BottleImage } from "@/components/bottle-image";
import type { Fragrance } from "@/lib/types";
import type { SearchResponse, SearchTerm } from "@/lib/search-terms";
import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
  removeRecentSearch,
} from "@/lib/recent-searches";

const DEBOUNCE_MS = 180;
const MAX_SUGGESTIONS = 8;
// When the query is all notes/families, the dropdown splits: most popular
// by those terms first, then name matches.
const MAX_BY_TERMS = 5;
const MAX_NAMES_WITH_TERMS = 3;
const MIN_QUERY_LEN = 2;

// One dropdown row. `matched` is set on keyword hits (which terms the
// fragrance carries) and absent on name hits; that is also how rows are
// grouped into the two sections.
type Row = Fragrance & { matched?: string[]; match_count?: number };

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
  /**
   * Compact variant for the top nav: 40px tall so it sits in a 56px row
   * with 8px above and below. Default (48px) stays for /search and
   * onboarding. Both are square-cornered. Text stays 16px in both: iOS
   * zooms the page when a focused input is smaller than that.
   */
  compact?: boolean;
  /**
   * Leading glyph. "search" is the decorative magnifier; "back" is a
   * button that calls onLeadingClick (the nav uses it to collapse the
   * expanded field). The two cross-fade in place.
   */
  leading?: "search" | "back";
  onLeadingClick?: () => void;
  /** Fires when the input gains focus (the nav expands on this). */
  onFocus?: () => void;
  /**
   * Show the per-device recent-searches list while the field is focused
   * and empty. Queries are recorded on submit and on picking a suggestion.
   */
  recentSearches?: boolean;
  /**
   * Bump to clear the field from outside without focusing it (the nav
   * does this when it collapses).
   */
  resetKey?: number;
}

export function SearchAutocomplete({
  initialQuery = "",
  placeholder = "Search any fragrance, brand, or note…",
  autoFocus = false,
  onQueryChange,
  onSubmit,
  onPick,
  clearOnPick = false,
  compact = false,
  leading = "search",
  onLeadingClick,
  onFocus,
  recentSearches = false,
  resetKey = 0,
}: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [q, setQ] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<Row[]>([]);
  const [terms, setTerms] = useState<SearchTerm[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // Recents: `focused` gates the list (only while the field is active and
  // empty); the list itself is read from localStorage after mount so the
  // server render and the first client render agree.
  const [focused, setFocused] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  useEffect(() => {
    if (recentSearches) setRecents(getRecentSearches());
  }, [recentSearches]);

  // External reset (nav collapse): wipe without refocusing. Skips the
  // initial mount so a fresh /search?q= page keeps its initialQuery.
  const lastResetKey = useRef(resetKey);
  useEffect(() => {
    if (resetKey === lastResetKey.current) return;
    lastResetKey.current = resetKey;
    setQ("");
    setSuggestions([]);
    setOpen(false);
    setHighlight(0);
    setFocused(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    onQueryChange?.("");
    inputRef.current?.blur();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // ---- Debounced fetch ----
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = q.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      setSuggestions([]);
      setTerms(null);
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
        const data = (await res.json()) as SearchResponse;
        const names = (data.results ?? []) as unknown as Row[];
        const byTerms = (data.byTerms ?? []) as unknown as Row[];
        const keyword = data.terms && byTerms.length > 0;
        const hits: Row[] = keyword
          ? [
              ...byTerms.slice(0, MAX_BY_TERMS),
              ...names.slice(0, MAX_NAMES_WITH_TERMS),
            ]
          : names.slice(0, MAX_SUGGESTIONS);
        setTerms(keyword ? data.terms : null);
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

  // ---- Tap outside closes the dropdown, and collapses the nav when
  // the field is expanded (same as the back chevron). pointerdown, not
  // mousedown: iOS only synthesises mouse events for taps on elements
  // it considers clickable, so a tap on plain page content would never
  // arrive as mousedown. ----
  useEffect(() => {
    function handler(e: PointerEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFocused(false);
        if (leading === "back") onLeadingClick?.();
      }
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [leading, onLeadingClick]);

  function remember() {
    if (!recentSearches) return;
    const trimmed = q.trim();
    if (trimmed.length < MIN_QUERY_LEN) return;
    setRecents(addRecentSearch(trimmed));
  }

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
      remember();
      router.push(`/fragrance/${fragrance.id}`);
      setOpen(false);
      return;
    }
    const trimmed = q.trim();
    if (trimmed.length < MIN_QUERY_LEN) return;
    remember();
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
      setFocused(false);
      inputRef.current?.blur();
      if (leading === "back") onLeadingClick?.();
    }
  }

  // Full clear — wipes the input, suggestions, and dropdown state.
  // Refocuses so the user can immediately start a fresh search.
  function clear() {
    setQ("");
    setSuggestions([]);
    setOpen(false);
    setHighlight(0);
    // Cancel any pending debounce or in-flight request so a stale
    // result can't repopulate the dropdown after clearing.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    onQueryChange?.("");
    inputRef.current?.focus();
  }

  const showDropdown =
    open && q.trim().length >= MIN_QUERY_LEN && (loading || suggestions.length > 0);
  const showRecents =
    recentSearches && focused && q.trim().length === 0 && recents.length > 0;

  function runRecent(query: string) {
    setRecents(addRecentSearch(query));
    setFocused(false);
    if (onSubmit) {
      setQ(query);
      onQueryChange?.(query);
      onSubmit(query);
    } else {
      router.push(`/search?q=${encodeURIComponent(query)}`);
    }
  }

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
            setFocused(true);
            onFocus?.();
            if (q.trim().length >= MIN_QUERY_LEN && suggestions.length > 0) {
              setOpen(true);
            }
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          // Right padding reserves the clear-X slot only once there is
          // text to clear; idle, the placeholder gets that room back so
          // it is not truncated in the narrow nav slot.
          className={[
            "w-full pl-9 text-base rounded-none border border-ink/20 bg-cream focus:outline-none focus:border-ink",
            compact ? "h-10 py-0" : "py-3",
            q.length > 0 ? "pr-11" : "pr-4",
          ].join(" ")}
        />
        {/* Right-side affordance — clear-X when the user has typed
            anything, otherwise the loading pulse (only visible in the
            edge case where a fetch is in flight with no text, which
            practically never happens but stays here as a defensive
            indicator). The X takes visual priority so users always have
            a one-tap wipe. */}
        {q.length > 0 ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-ink/50 hover:text-ink transition"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
            >
              <path
                d="M4 4L12 12M12 4L4 12"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : loading ? (
          <span
            aria-hidden
            className="absolute right-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-emerald animate-pulse"
          />
        ) : null}
        {/* Leading slot, 16px in from the left, text starts at 36px (pl-9)
            so there is an 8px gap after the 12px glyph. Two glyphs share
            the slot and cross-fade (150ms): Josh's magnifier (decorative,
            from Downloads/Search Icon.svg re-boxed from its 64-unit canvas
            with the stroke scaled to ~1.3px) and the app's back chevron
            (BackButton's drawing) as a real button when the nav is
            expanded. */}
        <span className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 text-slate">
          <svg
            aria-hidden
            width="12"
            height="12"
            viewBox="8 9.6 48 48"
            fill="none"
            className={`absolute inset-0 transition-opacity duration-150 ${
              leading === "search" ? "opacity-100" : "opacity-0"
            }`}
          >
            <path
              d="M52.7999 54.4L40.3416 41.9417M45.3333 29.8667C45.3333 39.2924 37.6923 46.9334 28.2666 46.9334C18.841 46.9334 11.2 39.2924 11.2 29.8667C11.2 20.4411 18.841 12.8 28.2666 12.8C37.6923 12.8 45.3333 20.4411 45.3333 29.8667Z"
              stroke="currentColor"
              strokeWidth="5.2"
              strokeLinecap="round"
            />
          </svg>
          <button
            type="button"
            aria-label="Close search"
            tabIndex={leading === "back" ? 0 : -1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onLeadingClick}
            className={`absolute -inset-3 flex items-center justify-center text-ink transition-opacity duration-150 ${
              leading === "back" ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            {/* Same double-chevron drawing as BackButton / public/icons/
                back.svg, so the nav's back affordance is one glyph
                everywhere. 20px here (24 in the nav brand slot). */}
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none" aria-hidden>
              <path
                d="M23 6L9 16L23 26"
                stroke="currentColor"
                strokeWidth="0.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M22.9999 8.54443L13.3076 16.0001L22.9999 23.4557"
                stroke="currentColor"
                strokeWidth="0.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </span>
      </div>

      {/* Recent searches: focused + empty. Rows preventDefault on
          mousedown so the input keeps focus until the click lands. */}
      {showRecents && !showDropdown && (
        <div className="absolute left-0 right-0 mt-2 bg-cream border border-ink/10 rounded-none shadow-lg overflow-hidden z-20">
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate">
              Recent
            </span>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setRecents(clearRecentSearches())}
              className="font-mono text-[10px] uppercase tracking-wider text-slate hover:text-ink transition"
            >
              Clear
            </button>
          </div>
          <ul>
            {recents.map((r) => (
              <li key={r} className="flex items-center">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => runRecent(r)}
                  className="flex-1 min-w-0 flex items-center gap-3 px-4 py-2.5 text-left text-ink hover:bg-paper transition"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden
                    className="shrink-0 text-slate"
                  >
                    <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.2" />
                    <path
                      d="M8 4.5V8l2.3 1.6"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="truncate">{r}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${r} from recent searches`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setRecents(removeRecentSearch(r))}
                  className="shrink-0 w-10 h-10 flex items-center justify-center text-ink/50 hover:text-ink transition"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path
                      d="M4 4L12 12M12 4L4 12"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Dropdown */}
      {showDropdown && (
        <ul
          id="search-suggestions"
          role="listbox"
          className="absolute left-0 right-0 mt-2 bg-cream border border-ink/10 rounded-none shadow-lg overflow-hidden z-20"
        >
          {suggestions.length === 0 && loading && (
            <li className="px-4 py-3 text-sm text-slate">Searching…</li>
          )}
          {suggestions.map((f, idx) => {
            const isTerm = Array.isArray(f.matched);
            const firstTerm = isTerm && idx === 0;
            const firstName =
              !isTerm && terms !== null && (idx === 0 || Array.isArray(suggestions[idx - 1]?.matched));
            const inner = (
              <>
                <div className="shrink-0 w-10 h-14 relative">
                  <BottleImage
                    src={f.bottle_image_url}
                    house={f.house}
                    name={f.name}
                    sizes="40px"
                    className="object-contain mix-blend-multiply"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate text-ink">{f.name}</div>
                  <div className="text-xs text-slate truncate">
                    {f.house}
                    {f.year ? ` · ${f.year}` : ""}
                  </div>
                </div>
                {isTerm && terms && terms.length > 1 ? (
                  // "2/3": how many of the typed terms this bottle carries.
                  <span className="font-mono text-[10px] uppercase tracking-wider text-slate shrink-0">
                    {f.match_count}/{terms.length}
                  </span>
                ) : (
                  Array.isArray(f.family) &&
                  f.family[0] && (
                    <span className="hidden sm:inline-block font-mono text-[10px] uppercase tracking-wider text-slate shrink-0">
                      {f.family[0]}
                    </span>
                  )
                )}
              </>
            );
            const header = firstTerm ? (
              <li
                key="h-terms"
                className="px-4 pt-3 pb-1 font-mono text-[10px] uppercase tracking-wider text-slate truncate"
                aria-hidden
              >
                Most popular with {terms!.map((t) => t.label).join(" · ")}
              </li>
            ) : firstName ? (
              <li
                key="h-names"
                className="px-4 pt-3 pb-1 font-mono text-[10px] uppercase tracking-wider text-slate border-t border-ink/5"
                aria-hidden
              >
                Fragrances
              </li>
            ) : null;
            const itemClass = `flex items-center gap-3 px-3 py-2.5 transition ${
              idx === highlight ? "bg-paper" : "bg-transparent"
            }`;
            return (
              <Fragment key={`${isTerm ? "t" : "n"}-${f.id}`}>
              {header}
              <li
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
              </Fragment>
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

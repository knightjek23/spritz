"use client";

// Nav-bar search slot. Renders the compact typeahead inline in the top
// nav, between the brand and the account controls, and takes whatever
// width is left over. On /search, where the page already has a primary,
// focused input, it renders an empty spacer so brand and account stay at
// the row's edges.
//
// Expansion state lives in NavRow; this component just wires it to the
// autocomplete: focus expands, the leading chevron collapses.

import { usePathname } from "next/navigation";
import { SearchAutocomplete } from "./search-autocomplete";

export function NavSearch({
  expanded,
  onExpand,
  onCollapse,
  resetKey,
}: {
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  resetKey: number;
}) {
  const pathname = usePathname();

  if (pathname === "/search") return <div className="flex-1" />;

  return (
    // flex-1 + min-w-0 so the input shrinks instead of pushing the
    // avatar off the row on narrow phones.
    <div className="flex-1 min-w-0">
      <SearchAutocomplete
        placeholder="Fragrances, notes…"
        autoFocus={false}
        compact
        leading={expanded ? "back" : "search"}
        onLeadingClick={onCollapse}
        onFocus={onExpand}
        recentSearches
        resetKey={resetKey}
      />
    </div>
  );
}

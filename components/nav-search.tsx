"use client";

// Nav-bar search slot. Renders the compact typeahead inline in the top
// nav, between the brand and the account controls, and takes whatever
// width is left over. Hides itself on /search, where the page already
// has a primary, focused input.
//
// Why a wrapper: Nav itself is a server component (uses Clerk's
// SignedIn/SignedOut server primitives), so we can't call usePathname
// directly there.

import { usePathname } from "next/navigation";
import { SearchAutocomplete } from "./search-autocomplete";

export function NavSearch() {
  const pathname = usePathname();

  if (pathname === "/search") return null;

  return (
    // flex-1 + min-w-0 so the input shrinks instead of pushing the
    // avatar off the row on narrow phones.
    <div className="flex-1 min-w-0">
      <SearchAutocomplete
        placeholder="Fragrances, notes…"
        autoFocus={false}
        compact
      />
    </div>
  );
}

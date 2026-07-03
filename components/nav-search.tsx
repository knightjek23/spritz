"use client";

// Nav-bar search slot. Renders the typeahead in a compact second row
// of the nav. Hides itself on /search to avoid two identical inputs
// stacked on top of each other.
//
// Why a wrapper: Nav itself is a server component (uses Clerk's
// SignedIn/SignedOut server primitives), so we can't call usePathname
// directly there.

import { usePathname } from "next/navigation";
import { SearchAutocomplete } from "./search-autocomplete";

export function NavSearch() {
  const pathname = usePathname();

  // Don't render on /search — the page already has a primary, focused
  // input. Two synced inputs would just be confusing.
  if (pathname === "/search") return null;

  return (
    // Sticky positioning + z-index dropped — NavScrollWrapper (parent of
    // Nav) now owns the sticky context for the whole top strip and hides
    // this row along with the primary nav on scroll-down.
    <div className="border-b border-ink/10 bg-cream/80 backdrop-blur">
      <div className="mx-auto max-w-md px-6 py-2">
        <SearchAutocomplete
          placeholder="Search fragrances, brands, notes…"
          autoFocus={false}
        />
      </div>
    </div>
  );
}

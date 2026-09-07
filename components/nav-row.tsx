"use client";

// NavRow — the single top-nav row: brand · search · account controls.
// Owns the "expanded search" state (the Gmail pattern): focusing the
// field slides the brand and account slots out and the field takes the
// full row; the leading magnifier becomes a back chevron that collapses
// it again. Any navigation (picking a suggestion, submitting, a recent
// search) also collapses it.
//
// Client component so it can hold state; Nav stays a Server Component
// and passes the brand and trailing slots in as props (Clerk's
// SignedIn/SignedOut/UserButton keep rendering server-side).

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { NavSearch } from "./nav-search";

// Motion: 200ms ease-out-quart, the same curve as the nav's hide-on-
// scroll transform. Only max-width, opacity and margin animate.
const SLOT =
  "shrink-0 overflow-hidden transition-[max-width,opacity,margin] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]";
const OPEN = "max-w-[160px] opacity-100";
const CLOSED = "max-w-0 opacity-0";

export function NavRow({
  brand,
  trailing,
}: {
  brand: ReactNode;
  trailing: ReactNode;
}) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  function collapse() {
    setExpanded(false);
    setResetKey((k) => k + 1);
  }

  // Route change = the search did its job. Collapse.
  useEffect(() => {
    setExpanded(false);
    setResetKey((k) => k + 1);
  }, [pathname]);

  // NavScrollWrapper reads this flag to pause hide-on-scroll while the
  // field is open, so the keyboard sliding up cannot push the nav away.
  useEffect(() => {
    if (expanded) document.documentElement.dataset.navSearch = "open";
    else delete document.documentElement.dataset.navSearch;
    return () => {
      delete document.documentElement.dataset.navSearch;
    };
  }, [expanded]);

  return (
    // Under viewportFit: "cover" the page starts behind the status bar, so
    // the bar's height is added as padding and folded into the row height.
    // Both terms are zero on a device with no top inset, leaving h-14.
    <div
      className="mx-auto max-w-md px-6 flex items-center"
      style={{
        height: "calc(3.5rem + var(--safe-top))",
        paddingTop: "var(--safe-top)",
      }}
    >
      {/* -ml-2 pl-2 so the back button's 8px overhang stays inside the
          clipped slot instead of being cut off. */}
      <div className={`${SLOT} -ml-2 pl-2 ${expanded ? `${CLOSED} mr-0` : `${OPEN} mr-4`}`}>
        {brand}
      </div>
      <NavSearch
        expanded={expanded}
        onExpand={() => setExpanded(true)}
        onCollapse={collapse}
        resetKey={resetKey}
      />
      <div className={`${SLOT} ${expanded ? `${CLOSED} ml-0` : `${OPEN} ml-4`}`}>
        {trailing}
      </div>
    </div>
  );
}

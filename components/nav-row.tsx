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

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { NavSearch } from "./nav-search";

// Motion: the side slots animate their real, measured width (not
// max-width, which stalls until the cap passes the content's size and
// then snaps). 240ms ease-out-quart on width and margin, opacity a bit
// faster so the brand and avatar are gone before the field reaches them.
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function Slot({
  open,
  side,
  children,
}: {
  open: boolean;
  side: "left" | "right";
  children: ReactNode;
}) {
  const inner = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);

  // Measure the content's natural width and keep it current (the brand
  // swaps between the wordmark and a back button per route).
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const collapsed = open && width !== null;
  return (
    <div
      className="shrink-0 overflow-hidden"
      style={{
        width: width === null ? "auto" : collapsed ? 0 : width,
        opacity: collapsed ? 0 : 1,
        // 16px gap to the field; the left slot also carries the back
        // button's -8px overhang, released when collapsed so the field
        // lands exactly on the 24px page edge.
        marginLeft: side === "left" ? (collapsed ? 0 : -8) : collapsed ? 0 : 16,
        marginRight: side === "left" ? (collapsed ? 0 : 16) : 0,
        transition: `width 240ms ${EASE}, margin 240ms ${EASE}, opacity ${
          collapsed ? "120ms" : "200ms 60ms"
        } ease-out`,
      }}
    >
      {/* Inline-flex so the measured width is the content's, not the
          flex container's. pl-2 on the left slot keeps the back button's
          8px overhang inside the clipped box. */}
      <div ref={inner} className={`inline-flex items-center ${side === "left" ? "pl-2" : ""}`}>
        {children}
      </div>
    </div>
  );
}

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
      <Slot open={expanded} side="left">
        {brand}
      </Slot>
      <NavSearch
        expanded={expanded}
        onExpand={() => setExpanded(true)}
        onCollapse={collapse}
        resetKey={resetKey}
      />
      <Slot open={expanded} side="right">
        {trailing}
      </Slot>
    </div>
  );
}

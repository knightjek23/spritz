"use client";

import { track } from "@/lib/analytics";

// Store links on /download. A plain <a> so the tap works before hydration;
// the click is recorded on the way out (PostHog sends with sendBeacon).

export function StoreButton({
  href,
  store,
  position,
  ct,
  className,
  children,
}: {
  href: string;
  store: "ios" | "android";
  position: "hero" | "footer";
  ct: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={() => track("store_button_clicked", { store, position, ct, page: "download" })}
    >
      {children}
    </a>
  );
}

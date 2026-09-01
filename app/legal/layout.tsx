// Shared shell for the /legal/* pages (privacy, terms, affiliate disclosure).
//
// Why these exist: affiliate networks require them. Awin's published rejection
// reasons include an unverifiable site and a promotional space that "lacks
// clarity or supporting content," and approval guides consistently flag
// missing privacy/terms/disclosure pages. Rakuten requires FTC disclosure
// compliance outright. App Store review also requires a reachable privacy
// policy URL.
//
// The prose styling now lives in components/prose-shell.tsx so /support/*
// renders identically. Shared strings live in ./constants.ts, not here — Next
// validates route-file exports and unknown named exports from a layout can
// fail the build.

import { ProseShell } from "@/components/prose-shell";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <ProseShell>{children}</ProseShell>;
}

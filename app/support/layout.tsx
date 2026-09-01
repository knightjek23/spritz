// Shell for /support and /support/delete-account.
//
// These two routes exist for store review, not for marketing:
//   - Apple requires a reachable Support URL on every App Store listing, and
//     review does check that it resolves and reads as genuine support.
//   - Google Play requires a publicly reachable account-deletion URL that
//     works WITHOUT installing the app or signing in, separate from the
//     in-app deletion path Apple requires under Guideline 5.1.1(v).
//
// Both share the legal pages' prose shell on purpose. A support page styled
// unlike the privacy policy reads as an unfinished site to a reviewer.

import { ProseShell } from "@/components/prose-shell";

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return <ProseShell>{children}</ProseShell>;
}

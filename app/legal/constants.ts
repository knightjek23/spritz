// Shared values for the /legal/* documents.
//
// Deliberately NOT exported from layout.tsx: Next validates the exports of
// route files (page/layout/route), and unknown named exports there can fail
// the build. A plain module is unambiguous.

/** Shown as the "Last updated" line on all three legal pages. */
export const LEGAL_LAST_UPDATED = "August 10, 2026";

/** Contact address in all three documents. Set this alias up before launch. */
export const LEGAL_CONTACT = "support@spritzofficial.app";

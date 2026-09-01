// Shared values for the /legal/* and /support/* documents.
//
// Deliberately NOT exported from layout.tsx: Next validates the exports of
// route files (page/layout/route), and unknown named exports there can fail
// the build. A plain module is unambiguous.

/** Shown as the "Last updated" line on the legal and support pages. */
export const LEGAL_LAST_UPDATED = "September 1, 2026";

/**
 * Contact address in every legal and support document, and the address given
 * to App Review as the app's support contact.
 *
 * This MUST be a mailbox that is actually monitored. App Review emails the
 * support address on the listing, and Google reaches developers through the
 * contact addresses on the Play account. A bounced support address is a
 * rejection cause on Apple's side and an account-verification problem on
 * Google's.
 */
export const LEGAL_CONTACT = "josh.knight@spritzofficial.online";

/** Public account-deletion page. Required by Google Play as a standalone URL. */
export const DELETE_ACCOUNT_PATH = "/support/delete-account";

/** Public support page. Used as the App Store listing's Support URL. */
export const SUPPORT_PATH = "/support";

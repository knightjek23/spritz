// Decides what the "Sources" block on a fragrance page may say about where
// the notes came from. Pure and import-free so it can be tested with plain
// node: node scripts/test-notes-source-label.mjs
//
// The rule is that the page only names a source that is true for this row:
//   * notes_status must be 'match' or 'replaced' (set by the verification
//     and import scripts in scraper/src) AND a source URL must be recorded.
//   * Anything else, including every row not yet verified, gets no line.
//
// Scento rows carry a licence condition (CC BY 4.0): the credit must name
// Scento and link https://www.scento.com/perfume-database. That is why the
// Scento label links the database page rather than the per-fragrance page.

export interface NotesSourceLabel {
  /** Text of the link, e.g. "the Scento perfume database" or "dior.com". */
  name: string;
  href: string;
  /** Present only when the source's licence must be shown with the credit. */
  licence: { name: string; href: string } | null;
}

const SCENTO_DATABASE_URL = "https://www.scento.com/perfume-database";
const CC_BY_4_URL = "https://creativecommons.org/licenses/by/4.0/";

export function notesSourceLabel(
  status: string | null | undefined,
  sourceUrl: string | null | undefined,
): NotesSourceLabel | null {
  if (status !== "match" && status !== "replaced") return null;
  if (!sourceUrl) return null;

  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "scento.com" || host.endsWith(".scento.com")) {
    return {
      name: "the Scento perfume database",
      href: SCENTO_DATABASE_URL,
      licence: { name: "CC BY 4.0", href: CC_BY_4_URL },
    };
  }
  // A brand or retailer page the notes were checked against. The host is
  // shown as written so the line never claims more than the record holds.
  return { name: host, href: url.toString(), licence: null };
}

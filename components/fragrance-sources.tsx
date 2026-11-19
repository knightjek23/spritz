// "Sources" block on the fragrance page: where the notes came from.
//
// Server component, no client JS. It only states what is recorded for this
// row (see lib/notes-source-label.ts): a fragrance whose notes have not been
// verified gets no notes line at all.
//
// Rows whose notes come from the Scento dataset MUST show the Scento credit
// and licence here. That attribution is a condition of the dataset's
// CC BY 4.0 licence, so do not remove the line or hide this block for them.
//
// Deliberately quiet: same label and small-text styles as the site footer,
// no card, no icons. External links open through the app's existing
// target="_blank" handling (components/native-auth-bridge.tsx on native).

import { notesSourceLabel } from "@/lib/notes-source-label";

const LINK =
  "underline underline-offset-2 decoration-slate/50 hover:text-ink hover:decoration-ink transition-colors";

export function FragranceSources({
  notesStatus,
  notesSourceUrl,
}: {
  notesStatus: string | null | undefined;
  notesSourceUrl: string | null | undefined;
}) {
  const notes = notesSourceLabel(notesStatus, notesSourceUrl);
  if (!notes) return null;

  return (
    <section className="mb-6" aria-labelledby="fragrance-sources-heading">
      <h2
        id="fragrance-sources-heading"
        className="font-mono text-xs uppercase tracking-widest text-slate mb-2"
      >
        Sources
      </h2>
      <ul className="space-y-1 text-xs text-slate leading-relaxed">
        <li>
          Notes from{" "}
          <a href={notes.href} target="_blank" rel="noopener noreferrer" className={LINK}>
            {notes.name}
          </a>
          {notes.licence && (
            <>
              , licensed{" "}
              <a
                href={notes.licence.href}
                target="_blank"
                rel="noopener noreferrer"
                className={LINK}
              >
                {notes.licence.name}
              </a>
            </>
          )}
          .
        </li>
      </ul>
    </section>
  );
}

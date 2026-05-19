// /notes — encyclopedia index. Every editorial note we have, grouped by
// fragrance family (citrus, floral, woody, etc.). Each card links into
// the per-note page.
//
// Server Component. Filesystem read happens at build time and revalidates
// on a daily cycle since the editorial corpus changes manually.

import type { Metadata } from "next";
import Link from "next/link";
import { loadAllNotes, groupNotesByFamily } from "@/lib/notes";
import { FAMILY_ORDER, FAMILY_BLURB } from "@/lib/families";

export const revalidate = 86400; // once a day

export const metadata: Metadata = {
  title: "Notes encyclopedia · Spritz",
  description:
    "Every fragrance note, what it smells like, and the bottles that feature it. Citrus, floral, woody, oriental, and beyond.",
};

export default async function NotesIndexPage() {
  const notes = await loadAllNotes();
  const grouped = groupNotesByFamily(notes);

  // Sort families per FAMILY_ORDER, then anything not in the list goes
  // alphabetically at the end (defensive — editorial files are consistent
  // but a future writer could introduce a new family).
  const ordered = [
    ...FAMILY_ORDER.filter((f) => grouped[f]),
    ...Object.keys(grouped).filter((f) => !FAMILY_ORDER.includes(f)).sort(),
  ];

  return (
    <article className="mx-auto max-w-md px-6 py-10">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          Encyclopedia · {notes.length} notes
        </p>
        <h1 className="font-display text-5xl mt-2 leading-[0.95]">
          The notes
        </h1>
        <p className="text-slate text-base mt-3 max-w-xs leading-relaxed">
          What every ingredient smells like, and the fragrances that feature it.
        </p>
      </header>

      {ordered.map((family) => (
        <section key={family} className="mb-10">
          <div className="mb-4">
            <h2 className="font-display text-2xl capitalize">{family}</h2>
            {FAMILY_BLURB[family] && (
              <p className="text-sm text-slate mt-1">{FAMILY_BLURB[family]}</p>
            )}
          </div>
          <ul className="flex flex-wrap gap-2">
            {grouped[family].map((n) => (
              <li key={n.slug}>
                <Link
                  href={`/note/${n.slug}`}
                  className="px-3 py-1.5 bg-paper hover:bg-brass/40 text-ink text-sm rounded-full transition capitalize"
                >
                  {n.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {notes.length === 0 && (
        <p className="text-sm text-slate">
          No editorial notes loaded. Check that{" "}
          <code className="font-mono text-xs">editorial/notes/</code> exists at
          the project root.
        </p>
      )}
    </article>
  );
}

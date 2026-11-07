// /note/[slug] — library entry for a single note.
//
// Two halves:
//   1. Editorial: the flavor profile, aliases, and family — read from
//      editorial/notes/<slug>.md.
//   2. Catalog: every fragrance in our database that includes this note,
//      ordered by popularity, badged by which layer it appears in. First
//      50 here, then "See more" loads 50 at a time (components/browse-list).
//
// Server Component — both sources are read at request time and revalidated
// on a 5-minute cycle (notes don't churn fast).

import type { Metadata } from "next";
import Link from "next/link";
import { loadNote, loadAllNotes } from "@/lib/notes";
import { fetchNotePage } from "@/lib/browse-pages";
import { BrowseList } from "@/components/browse-list";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const note = await loadNote(params.slug);
  if (!note) return { title: "Note not found" };
  return {
    title: note.name,
    description: note.body.split("\n").slice(0, 2).join(" ").slice(0, 160),
    alternates: { canonical: `/note/${params.slug}` },
  };
}

export default async function NotePage({ params }: { params: { slug: string } }) {
  const note = await loadNote(params.slug);

  // First page of the catalog list (50, popularity order) plus the full
  // match count. Candidate names (trademark marks, spacing variants,
  // catalog typos) are unioned in one query; see lib/browse-pages.ts.
  // "See more" in BrowseList fetches the next 50 from the same function.
  const { rows: fragrances, total } = await fetchNotePage(params.slug);
  const queryName = note?.name ?? params.slug.replace(/-/g, " ");

  // Soft-404: neither editorial nor any variant matched. Render a
  // recovery page (search + return-to-notes CTAs) instead of the raw
  // Next.js 404. Route-level notFound() reserved for genuinely
  // unreachable URLs.
  if (!note && fragrances.length === 0) {
    return <NoteNotFound slug={params.slug} />;
  }

  return (
    <article className="mx-auto max-w-md px-6 pt-4 pb-10">
      {/* Crumb back to the index */}
      <p className="mb-4">
        <Link
          href="/notes"
          className="font-mono text-xs uppercase tracking-widest text-slate hover:text-ink"
        >
          ← All notes
        </Link>
      </p>

      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          {note?.family ?? "note"}
          {total > 0 && (
            <span> · in {total} fragrance{total === 1 ? "" : "s"}</span>
          )}
        </p>
        <h1 className="font-display text-5xl mt-2 leading-[0.95] capitalize">
          {note?.name ?? queryName}
        </h1>
      </header>

      {note ? (
        <section className="mb-6">
          <p className="text-ink leading-relaxed whitespace-pre-line">
            {note.body}
          </p>
          {note.aliases.length > 0 && (
            <p className="mt-6 font-mono text-xs uppercase tracking-widest text-slate">
              Also known as:{" "}
              <span className="text-ink normal-case font-sans tracking-normal">
                {note.aliases.join(", ")}
              </span>
            </p>
          )}
        </section>
      ) : (
        <section className="mb-6 border-l-2 border-brass pl-4">
          <p className="text-slate text-sm leading-relaxed italic">
            We don&apos;t have a flavor profile written for this note yet. Below
            are the fragrances in our catalog that feature it.
          </p>
        </section>
      )}

      {fragrances.length > 0 && (
        <section className="mb-6">
          <h2 className="font-display text-2xl mb-4">Fragrances featuring it</h2>
          <BrowseList kind="note" slug={params.slug} initialRows={fragrances} total={total} />
        </section>
      )}
    </article>
  );
}

// Soft 404 — renders when neither the editorial nor any RPC candidate
// found this note. Better UX than a hard notFound() (the user can
// recover in-page, and SEO stays intact with meaningful content).
function NoteNotFound({ slug }: { slug: string }) {
  const displayName = slug.replace(/-/g, " ");
  return (
    <article className="mx-auto max-w-md px-6 pt-4 pb-10">
      <p className="mb-4">
        <Link
          href="/notes"
          className="font-mono text-xs uppercase tracking-widest text-slate hover:text-ink"
        >
          ← All notes
        </Link>
      </p>
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          Note not found
        </p>
        <h1 className="font-display text-5xl mt-2 leading-[0.95] capitalize">
          {displayName}
        </h1>
      </header>
      <section className="mb-6 rounded-xl border border-dashed border-ink/15 p-6">
        <p className="text-sm text-slate leading-relaxed mb-4">
          We don&apos;t have a page for <span className="italic">{displayName}</span> yet
          — either the spelling is uncommon or no fragrance in our catalog uses
          that exact name. Try browsing all notes or searching for the
          fragrance you had in mind.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/notes"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald text-cream text-sm font-medium hover:bg-emerald/90 transition"
          >
            Browse notes
          </Link>
          <Link
            href="/search"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-ink/15 text-ink text-sm font-medium hover:bg-ink/5 transition"
          >
            Search the catalog
          </Link>
        </div>
      </section>
    </article>
  );
}

// Pre-render the most popular notes at build time. The rest fall through
// to on-demand ISR with revalidate = 300.
export async function generateStaticParams() {
  const notes = await loadAllNotes();
  return notes.slice(0, 50).map((n) => ({ slug: n.slug }));
}

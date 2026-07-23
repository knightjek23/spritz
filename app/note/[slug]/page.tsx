// /note/[slug] — library entry for a single note.
//
// Two halves:
//   1. Editorial: the flavor profile, aliases, and family — read from
//      editorial/notes/<slug>.md.
//   2. Catalog: every fragrance in our database that includes this note,
//      ordered by popularity, badged by which layer it appears in.
//
// Server Component — both sources are read at request time and revalidated
// on a 5-minute cycle (notes don't churn fast).

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { cleanBottleImageUrl } from "@/lib/bottle-image";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadNote, loadAllNotes } from "@/lib/notes";
import { resolveNoteQueries } from "@/lib/note-aliases";
import type { Fragrance } from "@/lib/types";

export const revalidate = 300;

const LAYER_LABEL: Record<string, string> = {
  top: "top",
  mid: "heart",
  base: "base",
};

const LAYER_PILL: Record<string, string> = {
  top: "bg-brass/40 text-ink",
  mid: "bg-paper text-ink",
  base: "bg-ink/10 text-ink",
};

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

  // Try every candidate query name in sequence (see lib/note-aliases.ts
  // for resolution rules — covers trademark suffixes, spelling
  // variants, and canonical synonyms). Union results across variants
  // so a page for "oud" shows fragrances stored under BOTH "oud" AND
  // "agarwood (oud)". Dedupe by fragrance id, cap at 60.
  //
  // Public read — note browsing is unauthenticated, RPC has a grant to
  // anon. Admin client used only because the @supabase/ssr typed
  // client's .rpc() overload selection is finicky with hand-rolled
  // Database types; functionally identical for read-only queries.
  const supabase = createAdminClient();
  const candidateNames = resolveNoteQueries(params.slug, note?.name);
  const seenFragranceIds = new Set<string>();
  const collected: Array<Fragrance & { layer: "top" | "mid" | "base" }> = [];
  for (const name of candidateNames) {
    if (collected.length >= 60) break;
    const { data } = await supabase.rpc("find_fragrances_by_note", {
      p_note: name,
      p_limit: 60,
    });
    if (!data) continue;
    for (const row of data as Array<Fragrance & { layer: "top" | "mid" | "base" }>) {
      if (seenFragranceIds.has(row.id)) continue;
      seenFragranceIds.add(row.id);
      collected.push(row);
      if (collected.length >= 60) break;
    }
  }
  const fragrances = collected;
  const queryName = note?.name ?? params.slug.replace(/-/g, " ");

  // Soft-404: neither editorial nor any variant matched. Render a
  // recovery page (search + return-to-notes CTAs) instead of the raw
  // Next.js 404. Route-level notFound() reserved for genuinely
  // unreachable URLs.
  if (!note && fragrances.length === 0) {
    return <NoteNotFound slug={params.slug} />;
  }

  return (
    <article className="mx-auto max-w-md px-6 py-10">
      {/* Crumb back to the index */}
      <p className="mb-4">
        <Link
          href="/notes"
          className="font-mono text-xs uppercase tracking-widest text-slate hover:text-ink"
        >
          ← All notes
        </Link>
      </p>

      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          {note?.family ?? "note"}
          {fragrances.length > 0 && (
            <span> · in {fragrances.length} fragrance{fragrances.length === 1 ? "" : "s"}</span>
          )}
        </p>
        <h1 className="font-display text-5xl mt-2 leading-[0.95] capitalize">
          {note?.name ?? queryName}
        </h1>
      </header>

      {note ? (
        <section className="mb-10">
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
        <section className="mb-10 border-l-2 border-brass pl-4">
          <p className="text-slate text-sm leading-relaxed italic">
            We don&apos;t have a flavor profile written for this note yet. Below
            are the fragrances in our catalog that feature it.
          </p>
        </section>
      )}

      {fragrances.length > 0 && (
        <section className="mb-10">
          <h2 className="font-display text-2xl mb-4">Fragrances featuring it</h2>
          <ul className="space-y-2">
            {fragrances.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/fragrance/${f.id}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl bg-paper border border-ink/10 hover:brightness-95 transition"
                >
                  {cleanBottleImageUrl(f.bottle_image_url) ? (
                    <div className="shrink-0 w-12 h-16 relative">
                      <Image
                        src={cleanBottleImageUrl(f.bottle_image_url)!}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-contain mix-blend-multiply"
                      />
                    </div>
                  ) : (
                    <div className="shrink-0 w-12 h-16 rounded bg-paper" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{f.name}</div>
                    <div className="text-xs text-slate truncate">
                      {f.house}
                      {f.year ? ` · ${f.year}` : ""}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider ${
                      LAYER_PILL[f.layer] ?? LAYER_PILL.base
                    }`}
                  >
                    {LAYER_LABEL[f.layer] ?? f.layer}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
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
    <article className="mx-auto max-w-md px-6 py-10">
      <p className="mb-4">
        <Link
          href="/notes"
          className="font-mono text-xs uppercase tracking-widest text-slate hover:text-ink"
        >
          ← All notes
        </Link>
      </p>
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          Note not found
        </p>
        <h1 className="font-display text-5xl mt-2 leading-[0.95] capitalize">
          {displayName}
        </h1>
      </header>
      <section className="mb-10 rounded-xl border border-dashed border-ink/15 p-6">
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

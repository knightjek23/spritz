// Branded 404 — every notFound() call and dead link lands here instead of
// Next's unstyled grey default. Mirrors the NoteNotFound soft-404 pattern:
// give the user a way back into the catalog.

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          404 · Page not found
        </p>
        <h1 className="font-display text-5xl mt-2 leading-[0.95]">
          Nothing here.
        </h1>
      </header>
      <section className="mb-10 rounded-xl border border-dashed border-ink/15 p-6">
        <p className="text-sm text-slate leading-relaxed mb-4">
          This page doesn&apos;t exist — the link may be old, or the fragrance
          may have moved. The catalog is still all here.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/search"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald text-cream text-sm font-medium hover:bg-emerald/90 transition"
          >
            Search fragrances
          </Link>
          <Link
            href="/library"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-ink/15 text-ink text-sm font-medium hover:bg-ink/5 transition"
          >
            Browse the library
          </Link>
        </div>
      </section>
    </div>
  );
}

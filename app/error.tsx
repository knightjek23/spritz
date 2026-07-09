"use client";

// Root error boundary — branded recovery page instead of Next's unstyled
// default. Server-side render errors on any route land here.

import { useEffect } from "react";
import Link from "next/link";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces in browser devtools + any client-side error tracking.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          Something went wrong
        </p>
        <h1 className="font-display text-5xl mt-2 leading-[0.95]">
          That didn&apos;t work.
        </h1>
      </header>
      <section className="mb-10 rounded-xl border border-dashed border-ink/15 p-6">
        <p className="text-sm text-slate leading-relaxed mb-4">
          Something broke on our end — not yours. It&apos;s usually temporary.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald text-cream text-sm font-medium hover:bg-emerald/90 transition"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-ink/15 text-ink text-sm font-medium hover:bg-ink/5 transition"
          >
            Back home
          </Link>
        </div>
      </section>
    </div>
  );
}

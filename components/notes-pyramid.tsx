"use client";

// Notes pyramid — top / heart / base. Each chip is a tap-to-expand
// flavor description AND a link to the full note encyclopedia entry.
//
// Interaction model:
//   - First tap: expand the inline description (if we have one) — fast
//     answer for the most common question ("what does X smell like?").
//   - Long-press / chevron: navigate to /note/[slug] for the full entry,
//     including every fragrance featuring that note.
//
// On mobile the chevron icon makes the secondary action discoverable
// without competing with the primary tap target.

import { useState } from "react";
import Link from "next/link";
import type { Fragrance, Note } from "@/lib/types";
// Import from lib/slugs (zero deps) NOT lib/notes (pulls in node:fs/promises
// and breaks the client bundle build).
import { noteSlug } from "@/lib/slugs";
import { noteSwatch } from "@/lib/swatches";

export function NotesPyramid({ fragrance }: { fragrance: Fragrance }) {
  // notes_descriptions is a jsonb { [normalized_name]: "flavor description" }
  // Pro-gated rendering happens server-side; here we just render what's passed.
  const descriptions =
    ((fragrance as unknown) as { notes_descriptions?: Record<string, string> })
      .notes_descriptions ?? {};

  const layers: Array<{ label: string; notes: Note[] }> = [
    { label: "Top", notes: fragrance.top_notes ?? [] },
    { label: "Heart", notes: fragrance.mid_notes ?? [] },
    { label: "Base", notes: fragrance.base_notes ?? [] },
  ];

  return (
    <div className="space-y-5">
      {layers.map(
        (layer) =>
          layer.notes.length > 0 && (
            <Layer
              key={layer.label}
              label={layer.label}
              notes={layer.notes}
              descriptions={descriptions}
            />
          ),
      )}
    </div>
  );
}

function Layer({
  label,
  notes,
  descriptions,
}: {
  label: string;
  notes: Note[];
  descriptions: Record<string, string>;
}) {
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-slate mb-2">
        {label}
      </p>
      <ul className="flex flex-wrap gap-2">
        {notes.map((n) => (
          <NoteChip
            key={n.name}
            note={n}
            description={descriptions[n.name.toLowerCase()] ?? null}
          />
        ))}
      </ul>
    </div>
  );
}

function NoteChip({
  note,
  description,
}: {
  note: Note;
  description: string | null;
}) {
  const [open, setOpen] = useState(false);
  const hasDescription = !!description;
  const slug = noteSlug(note.name);
  // Color-coded chip — citrus yellow, woody amber, floral pink, etc.
  // All swatches pass 4.5:1 against ink text by a comfortable margin
  // (verified in lib/swatches.ts). When the chip is open (expanded
  // description), we invert to ink + cream so the active state stays
  // visually distinct from the resting color.
  const swatch = noteSwatch(note.name);
  const restingStyle: React.CSSProperties = open
    ? {}
    : { backgroundColor: swatch.bg, color: swatch.text };

  return (
    <li className="inline-block">
      <div
        className="inline-flex items-center rounded-full overflow-hidden"
        style={restingStyle}
      >
        {/* Primary tap target — expand description if we have one,
            otherwise act like a label (no-op). Active state inverts to
            ink/cream so the user knows which chip is expanded. */}
        <button
          type="button"
          onClick={() => hasDescription && setOpen((v) => !v)}
          className={`px-3 py-1.5 text-sm transition ${
            open
              ? "bg-ink text-cream"
              : hasDescription
              ? "hover:brightness-95 cursor-pointer"
              : "cursor-default"
          }`}
          aria-expanded={hasDescription ? open : undefined}
          title={hasDescription ? "Tap for flavor profile" : note.name}
        >
          {note.name}
        </button>
        {/* Secondary action — link to the encyclopedia entry. Inherits
            the swatch background but adds a soft ink-tinted divider so
            the two tap targets stay visually distinct on color. */}
        <Link
          href={`/note/${slug}`}
          aria-label={`View encyclopedia entry for ${note.name}`}
          className={`px-2 py-1.5 text-xs transition border-l border-ink/10 ${
            open
              ? "bg-ink text-cream/80 hover:text-cream"
              : "text-ink/70 hover:brightness-95 hover:text-ink"
          }`}
        >
          →
        </Link>
      </div>
      {open && description && (
        <p className="mt-2 mb-1 text-sm text-slate italic max-w-full">
          {description}{" "}
          <Link
            href={`/note/${slug}`}
            className="not-italic font-mono text-xs uppercase tracking-wider text-emerald hover:underline ml-1"
          >
            Read more →
          </Link>
        </p>
      )}
    </li>
  );
}

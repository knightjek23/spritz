// Encyclopedia detail page — the visual + UX hero of Spritz.
// Lead with what the bottle IS, not with what to buy instead.

import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { SimilarSection } from "@/components/similar-section";
import { SaveButton } from "@/components/save-button";
import { NotesPyramid } from "@/components/notes-pyramid";
import { KnownDupes } from "@/components/known-dupes";
import { houseSlug } from "@/lib/houses";
import { familySlug } from "@/lib/families";
import type { Fragrance } from "@/lib/types";

export const revalidate = 60;

export default async function FragrancePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: f } = await supabase
    .from("fragrances")
    .select("*")
    .eq("id", params.id)
    .maybeSingle<Fragrance>();
  if (!f) notFound();

  const hasPerformanceData =
    f.longevity_score !== null || f.sillage_score !== null;
  const wear = f.wear_guidance ?? {};
  const hasWearGuidance = !!(wear.how_to_wear || wear.layering_notes || (wear.occasions && wear.occasions.length > 0));

  return (
    <article className="mx-auto max-w-md px-6 py-10">
      {/* Bottle hero — the one place we use glassmorphism per design direction.
          Soft frosted card, gentle gradient backdrop, centered bottle. */}
      {f.bottle_image_url && (
        <section className="mb-8 relative">
          {/* Backdrop wash — provides the "depth" the glass effect refracts against */}
          <div
            aria-hidden
            className="absolute inset-0 -inset-x-6 rounded-3xl bg-gradient-to-br from-emerald/10 via-brass/10 to-paper/40 blur-xl -z-10"
          />
          <div className="rounded-3xl bg-cream/40 backdrop-blur-xl border border-ink/5 shadow-sm py-8 px-6 flex items-center justify-center">
            <div className="relative w-[200px] h-[267px]">
              <Image
                src={f.bottle_image_url}
                alt={`${f.name} by ${f.house}`}
                fill
                sizes="(max-width: 768px) 200px, 280px"
                className="object-contain mix-blend-multiply"
                priority
              />
            </div>
          </div>
        </section>
      )}

      {/* Title block — name + house + year + gender. Family lives below.
          House name links into the house encyclopedia entry. */}
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          <Link
            href={`/house/${houseSlug(f.house)}`}
            className="hover:text-ink transition"
          >
            {f.house}
          </Link>
          {f.year && <span> · {f.year}</span>}
          {f.gender && <span> · {f.gender}</span>}
        </p>
        <h1 className="font-display text-5xl mt-2 leading-[0.95]">{f.name}</h1>
      </header>

      {/* Action row — Save + Buy (single Buy CTA, this fragrance only) */}
      <section className="grid grid-cols-2 gap-3 mb-10">
        <div className="grid grid-cols-3 col-span-2 gap-2">
          <SaveButton fragranceId={f.id} status="own" label="Own" />
          <SaveButton fragranceId={f.id} status="tried" label="Tried" />
          <SaveButton fragranceId={f.id} status="wishlist" label="Wishlist" />
        </div>
        <Link
          href={`/api/buy/${f.id}`}
          className="col-span-2 bg-emerald text-cream py-3 rounded-xl text-center font-medium hover:bg-emerald/90 transition"
        >
          Buy this fragrance
        </Link>
      </section>

      {/* Family / accords — own section, clearly labeled. Not the same as notes.
          Chips link into /family/[slug] for browse-by-family discovery. */}
      {f.family.length > 0 && (
        <section className="mb-10">
          <h2 className="font-display text-2xl mb-4">Family</h2>
          <div className="flex flex-wrap gap-2">
            {f.family.map((fam) => (
              <Link
                key={fam}
                href={`/family/${familySlug(fam)}`}
                className="px-3 py-1.5 bg-paper hover:bg-brass/40 text-ink text-sm rounded-full capitalize transition"
              >
                {fam}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Notes pyramid — each note is tappable to expand the flavor description */}
      <section className="mb-10">
        <h2 className="font-display text-2xl mb-4">Notes</h2>
        <NotesPyramid fragrance={f} />
      </section>

      {/* Known dupes — promoted up the page per Session 01 feedback. Sits
          right after Notes so the natural reading order is "what's in it"
          → "what's a cheaper version of this". The Pro upsell case still
          renders here for free users but is now the second visible
          content block, not buried after editorial. */}
      <KnownDupes fragranceId={f.id} initialDupes={f.dupes} />

      {/* Longevity + sillage — only render when we actually have data */}
      {hasPerformanceData && (
        <section className="grid grid-cols-2 gap-6 mb-10">
          <ScoreBar
            label="Longevity"
            value={f.longevity_score}
            confidence={f.longevity_confidence}
            unit="hours"
          />
          <ScoreBar
            label="Sillage"
            value={f.sillage_score}
            confidence={f.sillage_confidence}
          />
        </section>
      )}

      {/* Season + occasion guidance — only when populated */}
      {(f.season_tags?.length > 0 || f.time_tags?.length > 0) && (
        <section className="mb-10">
          <h2 className="font-display text-2xl mb-4">When to wear it</h2>
          <div className="flex flex-wrap gap-2">
            {f.season_tags?.map((s) => (
              <span
                key={s}
                className="px-3 py-1.5 bg-paper text-ink text-sm rounded-full capitalize"
              >
                {s}
              </span>
            ))}
            {f.time_tags?.map((t) => (
              <span
                key={t}
                className="px-3 py-1.5 bg-paper text-ink text-sm rounded-full capitalize"
              >
                {t}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Perfumer + house */}
      {(f.perfumer || f.house_history) && (
        <section className="mb-10">
          {f.perfumer && (
            <div className="mb-6">
              <p className="font-mono text-xs uppercase tracking-widest text-slate mb-1">
                Perfumer
              </p>
              <p className="font-display text-xl">{f.perfumer}</p>
            </div>
          )}
          {f.house_history && (
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-slate mb-2">
                The house
              </p>
              <p className="text-ink leading-relaxed">{f.house_history}</p>
            </div>
          )}
        </section>
      )}

      {/* How to wear it — only when an editorial entry exists for this fragrance */}
      {hasWearGuidance && (
        <section className="mb-10">
          <h2 className="font-display text-2xl mb-4">How to wear it</h2>
          {wear.how_to_wear && (
            <p className="text-ink leading-relaxed mb-3">{wear.how_to_wear}</p>
          )}
          {wear.layering_notes && (
            <p className="text-slate text-sm leading-relaxed mb-3">
              <span className="font-mono uppercase tracking-wider text-xs">Layering: </span>
              {wear.layering_notes}
            </p>
          )}
          {wear.occasions && wear.occasions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {wear.occasions.map((o) => (
                <span
                  key={o}
                  className="px-3 py-1 bg-brass/40 text-ink text-xs rounded-full capitalize"
                >
                  {o}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Editorial commentary — the hand-written take on this specific fragrance */}
      {f.editorial_notes && (
        <section className="mb-10 border-l-2 border-emerald pl-4">
          <p className="text-ink leading-relaxed italic">{f.editorial_notes}</p>
        </section>
      )}

      {/* Similar fragrances — collapsed, opt-in, algorithmic note-vector similarity */}
      <section className="mt-12 pt-8 border-t border-ink/10">
        <SimilarSection fragranceId={f.id} />
      </section>
    </article>
  );
}

function ScoreBar({
  label,
  value,
  confidence,
  unit,
}: {
  label: string;
  value: number | null;
  confidence?: number | null;
  unit?: string;
}) {
  const pct = value !== null ? Math.min(100, Math.round((value / 10) * 100)) : 0;
  const confidenceLabel =
    confidence == null
      ? null
      : confidence >= 0.75
      ? "consensus"
      : confidence >= 0.5
      ? "mixed"
      : "varies a lot";
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-slate mb-2">
        {label}
      </p>
      <div className="h-2 bg-ink/10 rounded-full overflow-hidden mb-2">
        <div className="h-full bg-emerald" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-ink">
        {value !== null ? (
          <>
            <span className="font-medium">{value.toFixed(1)}</span>
            <span className="text-slate"> / 10{unit ? ` (${unit})` : ""}</span>
          </>
        ) : (
          <span className="text-slate">Not measured</span>
        )}
      </p>
      {confidenceLabel && (
        <p className="font-mono text-xs text-slate mt-1 lowercase">{confidenceLabel}</p>
      )}
    </div>
  );
}

// Encyclopedia detail page — the visual + UX hero of Spritz.
// Lead with what the bottle IS, not with what to buy instead.

import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SimilarSection } from "@/components/similar-section";
import { SaveButton } from "@/components/save-button";
import { NotesPyramid } from "@/components/notes-pyramid";
import { KnownDupes } from "@/components/known-dupes";
import { KnownConsensus } from "@/components/known-consensus";
import { FamilyPills } from "@/components/family-pills";
import { houseSlug } from "@/lib/houses";
import {
  CONCENTRATION_LABEL,
  CONCENTRATION_SHORT,
  CONCENTRATION_DESCRIPTION,
} from "@/lib/concentrations";
import type { CollectionStatus, Fragrance } from "@/lib/types";

// Force dynamic rendering. The page reads Clerk auth() to hydrate the
// current user's Own/Tried/Wishlist status, so the same URL renders
// different HTML per user — cannot be cached at the edge. Without this,
// Next.js 14 would still ISR-cache the page per URL and serve one
// user's collection state to every subsequent visitor of the same
// fragrance (visible bug: your ✓ Own appears on someone else's screen,
// or nothing appears on yours because a signed-out user's render is
// cached first).
export const dynamic = "force-dynamic";

export default async function FragrancePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: f } = await supabase
    .from("fragrances")
    .select("*")
    .eq("id", params.id)
    .maybeSingle<Fragrance>();
  if (!f) notFound();

  // Hydrate the Own / Tried / Wishlist buttons with the current user's
  // existing collection entries for this fragrance, so returning to a
  // page you've already saved shows the status immediately without a
  // client-side round-trip. Also captures the collection_item id per
  // status so SaveButton can toggle off (DELETE) with a second tap.
  //
  // Admin client bypasses RLS same as the /api/collection route.
  const { userId: clerkUserId } = auth();
  const savedItemIds: Partial<Record<CollectionStatus, string>> = {};
  if (clerkUserId) {
    const admin = createAdminClient();
    const { data: appUser } = await admin
      .from("users")
      .select("id")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();
    if (appUser) {
      const { data: existing } = await admin
        .from("collection_items")
        .select("id, status")
        .eq("user_id", appUser.id)
        .eq("fragrance_id", f.id);
      for (const row of existing ?? []) {
        savedItemIds[row.status as CollectionStatus] = row.id;
      }
    }
  }

  const hasPerformanceData =
    f.longevity_score !== null || f.sillage_score !== null;
  const wear = f.wear_guidance ?? {};
  const hasWearGuidance = !!(wear.how_to_wear || wear.layering_notes || (wear.occasions && wear.occasions.length > 0));

  return (
    <article className="mx-auto max-w-md px-6 py-10">
      {/* Bottle hero — opaque cream card so the bottle photo's white
          background can cleanly multiply into the cream backdrop. The
          previous glassmorphism (bg-cream/40 + backdrop-blur-xl) made
          the blend target non-uniform, leaving a visible white square
          around the bottle. Soft outer wash + border + shadow retain
          the depth that the glass effect used to give. */}
      {f.bottle_image_url && (
        <section className="mb-8 relative">
          {/* Backdrop wash — subtle color halo behind the card. */}
          <div
            aria-hidden
            className="absolute inset-0 -inset-x-6 rounded-3xl bg-gradient-to-br from-emerald/10 via-brass/10 to-paper/40 blur-xl -z-10"
          />
          <div className="rounded-3xl bg-cream border border-ink/5 shadow-sm py-8 px-6 flex items-center justify-center isolate">
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

      {/* Title block — name + house + year + gender + concentration.
          Family lives below. House name links into the house
          encyclopedia entry. Concentration (EDT/EDP/Parfum/Extrait)
          sits at the end of the metadata line for glanceability; the
          full plain-English description gets its own section below
          Notes so people who want the "what does that mean?" answer
          get it without cluttering the header. */}
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
          {f.concentration && (
            <span> · {CONCENTRATION_SHORT[f.concentration]}</span>
          )}
        </p>
        <h1 className="font-display text-5xl mt-2 leading-[0.95]">{f.name}</h1>
      </header>

      {/* Action row — Save + Buy (single Buy CTA, this fragrance only).
          initialItemId hydrates each SaveButton with the user's existing
          collection_items row (if any) so status persists across page
          loads and the button can toggle off with a second tap. */}
      <section className="grid grid-cols-2 gap-3 mb-10">
        <div className="grid grid-cols-3 col-span-2 gap-2">
          <SaveButton
            fragranceId={f.id}
            status="own"
            label="Own"
            initialItemId={savedItemIds.own ?? null}
          />
          <SaveButton
            fragranceId={f.id}
            status="tried"
            label="Tried"
            initialItemId={savedItemIds.tried ?? null}
          />
          <SaveButton
            fragranceId={f.id}
            status="wishlist"
            label="Wishlist"
            initialItemId={savedItemIds.wishlist ?? null}
          />
        </div>
        <Link
          href={`/api/buy/${f.id}`}
          className="col-span-2 bg-emerald text-cream py-3 rounded-xl text-center font-medium hover:bg-emerald/90 transition"
        >
          Buy this fragrance
        </Link>
      </section>

      {/* Family / accords — own section, clearly labeled. Not the same as
          notes. Pills tap to open a bottom sheet with the family's
          definition (per Session 01: "make families have pop-up
          descriptions"). The CTA inside the sheet routes to
          /family/[slug] for users who want the full browse view.
          Defensive `?? []` because the DB column can be null on rows
          where the scraper didn't extract accords. */}
      {(f.family ?? []).length > 0 && (
        <section className="mb-10">
          <h2 className="font-display text-2xl mb-4">Family</h2>
          <FamilyPills families={f.family ?? []} />
        </section>
      )}

      {/* Notes pyramid — each note is tappable to expand the flavor description */}
      <section className="mb-10">
        <h2 className="font-display text-2xl mb-4">Notes</h2>
        <NotesPyramid fragrance={f} />
      </section>

      {/* Concentration / strength — plain-English explainer for what
          "EDT" / "EDP" / "Parfum" / "Extrait" means. Only renders when
          the backfill parsed one from the fragrance name. Positioned
          before Known Dupes so users grasp the strength context before
          diving into performance and alternatives. */}
      {f.concentration && (
        <section className="mb-10">
          <h2 className="font-display text-2xl mb-3">Concentration</h2>
          <p className="text-ink font-medium mb-2">
            {CONCENTRATION_LABEL[f.concentration]}
          </p>
          <p className="text-sm text-ink/85 leading-relaxed">
            {CONCENTRATION_DESCRIPTION[f.concentration]}
          </p>
        </section>
      )}

      {/* Known dupes — promoted up the page per Session 01 feedback. Sits
          right after Notes so the natural reading order is "what's in it"
          → "what's a cheaper version of this". The Pro upsell case still
          renders here for free users but is now the second visible
          content block, not buried after editorial. */}
      <KnownDupes
        fragranceId={f.id}
        fragranceName={f.name}
        fragranceHouse={f.house}
        initialDupes={f.dupes}
      />

      {/* Community consensus — Pro AI feature, sits right after dupes so
          the natural reading order is: notes (what's in it) → dupes
          (cheaper version?) → consensus (worth buying this one OR a
          dupe?). Same Pro-gate + Living Breadcrumb pattern as dupes. */}
      <KnownConsensus fragrance={f} />

      {/* Longevity + projection — bars give the numeric quantification,
          descriptions translate it into plain English ("Wears a full
          day"). Renders when EITHER the numeric scores are present OR
          a description is. Sillage column renamed to Projection in the
          UI per Session 01 — sillage is industry jargon. */}
      {(hasPerformanceData || f.longevity_description || f.projection_description) && (
        <section className="grid grid-cols-1 gap-6 mb-10">
          <div className="grid grid-cols-2 gap-6">
            <ScoreBar
              label="Longevity"
              value={f.longevity_score}
              confidence={f.longevity_confidence}
              unit="hours"
            />
            <ScoreBar
              label="Projection"
              value={f.sillage_score}
              confidence={f.sillage_confidence}
            />
          </div>
          {(f.longevity_description || f.projection_description) && (
            <div className="grid grid-cols-1 gap-3 text-sm text-ink/85 leading-relaxed">
              {f.longevity_description && (
                <p>
                  <span className="font-mono uppercase tracking-wider text-[10px] text-slate mr-2">
                    Longevity
                  </span>
                  {f.longevity_description}
                </p>
              )}
              {f.projection_description && (
                <p>
                  <span className="font-mono uppercase tracking-wider text-[10px] text-slate mr-2">
                    Projection
                  </span>
                  {f.projection_description}
                </p>
              )}
            </div>
          )}
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

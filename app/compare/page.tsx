// /compare?a=<id>&b=<id> — two fragrances side by side.
//
// Server Component, signed-in only. Notes are laid out by tier with shared
// notes highlighted, then longevity and projection, families, seasons and
// price tier. Pro users also get both match scores (lib/match.ts).
//
// Free tier: 2 distinct pairs a week (lib/feature-uses, key = sorted ids,
// so a↔b and b↔a are one pair). Over the cap, the page renders the gate
// instead of the comparison; the data never reaches the browser.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAppUser } from "@/lib/users";
import { spendUse } from "@/lib/feature-uses";
import { tasteProfile, profileReady, TASTE_COLUMNS, type TasteRow } from "@/lib/taste";
import { scoreMatch, type MatchResult } from "@/lib/match";
import { BottleImage } from "@/components/bottle-image";
import { ProLocked } from "@/components/pro-locked";
import { ProGateTracker } from "@/components/pro-gate-tracker";
import type { Fragrance, Note } from "@/lib/types";

export const metadata: Metadata = { title: "Compare fragrances", robots: { index: false } };
export const dynamic = "force-dynamic";

type Row = TasteRow &
  Pick<
    Fragrance,
    | "bottle_image_url"
    | "longevity_score"
    | "sillage_score"
    | "price_tier"
    | "year"
    | "concentrations"
    | "longevity_description"
    | "projection_description"
  >;

const COLUMNS = `${TASTE_COLUMNS}, bottle_image_url, longevity_score, sillage_score, price_tier, year, concentrations, longevity_description, projection_description`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function names(notes: Note[] | null | undefined): string[] {
  return (notes ?? []).map((n) => (typeof n === "string" ? n : n.name)).filter(Boolean);
}

export default async function ComparePage({ searchParams }: { searchParams: { a?: string; b?: string } }) {
  const { userId } = auth();
  const a = searchParams.a ?? "";
  const b = searchParams.b ?? "";
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent(`/compare?a=${a}&b=${b}`)}`);
  if (!UUID.test(a) || !UUID.test(b) || a === b) {
    return (
      <article className="mx-auto max-w-md px-6 py-10">
        <h1 className="font-display text-3xl mb-3">Compare fragrances</h1>
        <p className="text-sm text-slate leading-relaxed">
          Open any fragrance and tap “Compare with another fragrance” to pick the second bottle.
        </p>
        <Link href="/search" className="mt-4 inline-block text-sm text-emerald underline underline-offset-4">
          Find a fragrance
        </Link>
      </article>
    );
  }

  const user = await ensureAppUser(userId);
  if (!user) redirect("/sign-in");
  const isPro = user.plan === "pro";

  const supabase = createAdminClient();
  const { data: rows } = await supabase.from("fragrances").select(COLUMNS).in("id", [a, b]);
  const fa = (rows ?? []).find((r) => r.id === a) as unknown as Row | undefined;
  const fb = (rows ?? []).find((r) => r.id === b) as unknown as Row | undefined;
  if (!fa || !fb) {
    return (
      <article className="mx-auto max-w-md px-6 py-10">
        <h1 className="font-display text-3xl mb-3">Compare fragrances</h1>
        <p className="text-sm text-slate">One of those fragrances isn’t in the library.</p>
      </article>
    );
  }

  if (!isPro) {
    const key = [a, b].sort().join(":");
    const today = new Date().toISOString().slice(0, 10);
    const use = await spendUse(user.id, "compare", key, today);
    if (!use.allowed) {
      return (
        <article className="mx-auto max-w-md px-6 py-10">
          <ProGateTracker feature="compare" state="locked" />
          <p className="font-mono text-xs uppercase tracking-widest text-slate mb-2">Compare</p>
          <h1 className="font-display text-3xl mb-6">
            {fa.name} <span className="text-slate">vs</span> {fb.name}
          </h1>
          <ProLocked
            body={`You've used your ${use.cap} free comparisons this week. Pro compares any two fragrances, as often as you like, with your match score on both.`}
          />
          <Link href={`/fragrance/${a}`} className="text-sm text-emerald underline underline-offset-4">
            Back to {fa.name}
          </Link>
        </article>
      );
    }
  }

  let matches: [MatchResult, MatchResult] | null = null;
  if (isPro) {
    const profile = await tasteProfile(user.id);
    if (profileReady(profile)) matches = [scoreMatch(profile, fa), scoreMatch(profile, fb)];
  }

  const tiers: Array<{ label: string; a: string[]; b: string[] }> = [
    { label: "Top", a: names(fa.top_notes), b: names(fb.top_notes) },
    { label: "Heart", a: names(fa.mid_notes), b: names(fb.mid_notes) },
    { label: "Base", a: names(fa.base_notes), b: names(fb.base_notes) },
  ];
  const allA = new Set(tiers.flatMap((t) => t.a.map((n) => n.toLowerCase())));
  const allB = new Set(tiers.flatMap((t) => t.b.map((n) => n.toLowerCase())));
  const shared = [...allA].filter((n) => allB.has(n));

  return (
    <article className="mx-auto max-w-md px-6 py-10">
      <p className="mb-4">
        <Link href={`/fragrance/${a}`} className="font-mono text-xs uppercase tracking-widest text-slate hover:text-ink">
          ← {fa.name}
        </Link>
      </p>
      <h1 className="font-display text-3xl mb-6 leading-tight">
        {fa.name} <span className="text-slate">vs</span> {fb.name}
      </h1>

      {/* Heads */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {[fa, fb].map((f) => (
          <Link key={f.id} href={`/fragrance/${f.id}`} className="group block">
            <div className="relative aspect-square bg-paper mb-2">
              <BottleImage src={f.bottle_image_url} house={f.house} name={f.name} sizes="200px" />
            </div>
            <p className="font-mono text-xs uppercase tracking-widest text-slate truncate">{f.house}</p>
            <p className="font-display text-lg leading-tight">{f.name}</p>
            {f.year && <p className="text-xs text-slate mt-0.5">{f.year}</p>}
          </Link>
        ))}
      </div>

      {/* Match */}
      <CompareRow label="Your match">
        {matches ? (
          matches.map((m, i) => (
            <div key={i}>
              <p className="font-display text-3xl leading-none">{m.score}%</p>
              <p className="text-xs text-ink mt-1">{m.label}</p>
            </div>
          ))
        ) : isPro ? (
          <p className="col-span-2 text-sm text-slate">Add 3 bottles you own or have tried to see your match.</p>
        ) : (
          <div className="col-span-2">
            <ProGateTracker feature="compare" state="match_locked" />
            <p className="text-sm text-slate">
              Pro shows how well each one fits your shelf.{" "}
              <Link href="/pricing" className="text-emerald underline underline-offset-4">
                See match scores
              </Link>
            </p>
          </div>
        )}
      </CompareRow>

      {/* Notes */}
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-2xl">Notes</h2>
          <p className="text-xs text-slate">
            {shared.length === 0 ? "no shared notes" : `${shared.length} shared, highlighted`}
          </p>
        </div>
        {tiers.map(
          (t) =>
            (t.a.length > 0 || t.b.length > 0) && (
              <div key={t.label} className="mb-4">
                <p className="font-mono text-xs uppercase tracking-widest text-slate mb-2">{t.label}</p>
                <div className="grid grid-cols-2 gap-4">
                  {[t.a, t.b].map((list, i) => (
                    <ul key={i} className="flex flex-wrap gap-1.5">
                      {list.length === 0 && <li className="text-xs text-mist">—</li>}
                      {list.map((n) => {
                        const isShared = allA.has(n.toLowerCase()) && allB.has(n.toLowerCase());
                        return (
                          <li
                            key={n}
                            className={`px-2 py-1 text-xs border ${
                              isShared ? "border-emerald bg-emerald/10 text-emerald font-medium" : "border-ink/10 text-ink"
                            }`}
                          >
                            {n}
                          </li>
                        );
                      })}
                    </ul>
                  ))}
                </div>
              </div>
            ),
        )}
      </section>

      {/* Performance */}
      <CompareRow label="Longevity">
        {[fa, fb].map((f) => <Bar key={f.id} value={f.longevity_score} unit="h" />)}
      </CompareRow>
      <CompareRow label="Projection">
        {[fa, fb].map((f) => <Bar key={f.id} value={f.sillage_score} />)}
      </CompareRow>

      <CompareRow label="Family">
        {[fa, fb].map((f) => (
          <p key={f.id} className="text-sm text-ink capitalize">
            {(f.family ?? []).slice(0, 3).join(", ") || "—"}
          </p>
        ))}
      </CompareRow>
      <CompareRow label="Season">
        {[fa, fb].map((f) => (
          <p key={f.id} className="text-sm text-ink capitalize">
            {(f.season_tags ?? []).join(", ") || "—"}
          </p>
        ))}
      </CompareRow>
      <CompareRow label="Price tier">
        {[fa, fb].map((f) => (
          <p key={f.id} className="text-sm text-ink capitalize">
            {f.price_tier ?? "—"}
          </p>
        ))}
      </CompareRow>
    </article>
  );
}

function CompareRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <p className="font-mono text-xs uppercase tracking-widest text-slate mb-2">{label}</p>
      <div className="grid grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

function Bar({ value, unit }: { value: number | null; unit?: string }) {
  const pct = value !== null ? Math.min(100, Math.round((value / 10) * 100)) : 0;
  return (
    <div>
      <div className="h-2 bg-ink/10 overflow-hidden mb-1">
        <div className="h-full bg-emerald" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-ink">{value !== null ? `${value.toFixed(1)}${unit ? ` ${unit}` : " / 10"}` : "no data"}</p>
    </div>
  );
}

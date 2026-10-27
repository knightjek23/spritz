// Pro "Insights" block on /account/history. Server component; the page
// decides whether to render this or the gate, so nothing here leaks to
// free users. Every sub-section hides itself when there's no data behind
// it, so a new Pro user with three logged days sees one or two cards, not
// four empty ones.

import Link from "next/link";
import { BottleImage } from "@/components/bottle-image";
import { dollars, type CostPerWear, type Complimented, type Neglected, type SeasonPattern } from "@/lib/wear-insights";

interface Props {
  cost: CostPerWear[];
  complimented: Complimented[];
  seasons: SeasonPattern[];
  neglected: Neglected[];
  pricedCount: number;
  ownedCount: number;
}

export function WearInsights({ cost, complimented, seasons, neglected, pricedCount, ownedCount }: Props) {
  const worn = cost.filter((c) => c.centsPerWear !== null);
  const seasonsWithData = seasons.filter((s) => s.topFamily && s.days >= 3);
  const nothing = worn.length === 0 && complimented.length === 0 && seasonsWithData.length === 0 && neglected.length === 0;

  return (
    <section className="mb-10">
      <h2 className="font-display text-2xl mb-1">Insights</h2>
      <p className="text-sm text-slate mb-5">What your log says about how you actually wear your shelf.</p>

      {nothing && (
        <p className="text-sm text-ink leading-relaxed">
          Keep logging. After a couple of weeks this fills in with cost per wear, your most complimented bottles,
          and what you reach for each season.
        </p>
      )}

      {worn.length > 0 && (
        <div className="mb-8">
          <h3 className="font-mono text-xs uppercase tracking-widest text-slate mb-3">Cost per wear</h3>
          <ul className="divide-y divide-ink/10">
            {worn.slice(0, 5).map((c) => (
              <li key={c.fragranceId} className="flex items-center gap-3 py-2">
                <div className="relative h-12 w-9 shrink-0">
                  <BottleImage src={c.bottle_image_url} house={c.house} name={c.name} sizes="36px" className="object-contain mix-blend-multiply" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{c.name}</p>
                  <p className="text-xs text-slate">
                    {dollars(c.pricePaidCents)} · {c.days} {c.days === 1 ? "day" : "days"} worn
                  </p>
                </div>
                <p className="font-display text-xl shrink-0">{dollars(c.centsPerWear as number)}</p>
              </li>
            ))}
          </ul>
          {pricedCount < ownedCount && (
            <p className="text-xs text-slate mt-3">
              {ownedCount - pricedCount} of your bottles {ownedCount - pricedCount === 1 ? "has" : "have"} no price yet.
              Add one from the ••• menu in{" "}
              <Link href="/collection" className="text-emerald underline underline-offset-4">
                your collection
              </Link>
              .
            </p>
          )}
        </div>
      )}

      {worn.length === 0 && pricedCount === 0 && ownedCount > 0 && !nothing && (
        <p className="text-xs text-slate mb-8">
          Add what you paid for a bottle (••• menu in{" "}
          <Link href="/collection" className="text-emerald underline underline-offset-4">
            your collection
          </Link>
          ) to see cost per wear here.
        </p>
      )}

      {complimented.length > 0 && (
        <div className="mb-8">
          <h3 className="font-mono text-xs uppercase tracking-widest text-slate mb-3">Most complimented</h3>
          <ul className="grid grid-cols-3 gap-3">
            {complimented.map((c) => (
              <li key={c.fragrance.id}>
                <Link href={`/fragrance/${c.fragrance.id}`} className="group block">
                  <div className="relative w-full aspect-[3/4] bg-paper border border-ink/10 overflow-hidden">
                    <BottleImage src={c.fragrance.bottle_image_url} house={c.fragrance.house} name={c.fragrance.name} sizes="120px" className="object-contain p-2 mix-blend-multiply" />
                  </div>
                  <p className="mt-2 text-sm font-medium leading-tight line-clamp-2">{c.fragrance.name}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-slate mt-0.5">
                    {c.compliments} {c.compliments === 1 ? "compliment" : "compliments"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {seasonsWithData.length > 0 && (
        <div className="mb-8">
          <h3 className="font-mono text-xs uppercase tracking-widest text-slate mb-3">By season</h3>
          <ul className="grid grid-cols-2 gap-3">
            {seasonsWithData.map((s) => (
              <li key={s.season} className="border border-ink/10 p-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-slate">{s.season}</p>
                <p className="font-display text-lg capitalize leading-tight mt-1">{s.topFamily}</p>
                <p className="text-xs text-slate mt-1">
                  {Math.round(s.share * 100)}% of {s.days} days
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {neglected.length > 0 && (
        <div className="mb-2">
          <h3 className="font-mono text-xs uppercase tracking-widest text-slate mb-3">Gathering dust</h3>
          <ul className="divide-y divide-ink/10">
            {neglected.map((n) => (
              <li key={n.fragranceId} className="flex items-center gap-3 py-2">
                <div className="relative h-12 w-9 shrink-0">
                  <BottleImage src={n.bottle_image_url} house={n.house} name={n.name} sizes="36px" className="object-contain mix-blend-multiply" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{n.name}</p>
                  <p className="text-xs text-slate">
                    {n.daysSince === null ? "never logged" : `last worn ${n.daysSince} days ago`}
                  </p>
                </div>
                <Link href={`/?wear=${n.fragranceId}`} className="text-xs text-emerald underline underline-offset-4 shrink-0">
                  Wear it today
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

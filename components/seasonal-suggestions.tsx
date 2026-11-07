// Seasonal Suggestions: in-season picks with a Men / Women toggle. Pro only.
// Server half: loads both sides once, hands them to the client toggle.
// Strictly in-season and switches on the first day of a new season
// (lib/discovery/lists). Hides entirely if both sides are empty.
//
// Pro gate (2026-10-31): free and signed-out users see the section heading
// with the standard locked state (ProLocked: 7-day trial CTA, plus "Already
// Pro? Sign in" when signed out). The check runs BEFORE the lists load, so
// the picks never reach a non-Pro page payload. isProUser reads users.plan
// in Supabase, the source of truth (lib/entitlement.ts), and is false for
// signed-out users without a database call.

import { getSeasonalPicks } from "@/lib/discovery/lists";
import { seasonFor } from "@/lib/discovery/season";
import { isProUser } from "@/lib/entitlement";
import { ProLocked } from "./pro-locked";
import { ProGateTracker } from "./pro-gate-tracker";
import { GenderToggle } from "./gender-toggle";

export async function SeasonalSuggestions() {
  if (!(await isProUser())) {
    const season = seasonFor(new Date());
    return (
      <section className="w-full mt-6">
        <h2 className="font-display text-2xl px-1 mb-2">{headingFor(season)}</h2>
        <div className="px-1">
          <ProLocked feature="seasonal" body="Ten in-season picks for men and women, refreshed every few days and switched over each season. Pro feature." />
        </div>
        <ProGateTracker feature="seasonal" state="locked" />
      </section>
    );
  }

  const [men, women] = await Promise.all([getSeasonalPicks("men"), getSeasonalPicks("women")]);
  if (men.rows.length === 0 && women.rows.length === 0) return null;
  return (
    <GenderToggle
      heading={headingFor(men.season)}
      subline="What people are reaching for this season."
      men={men.rows}
      women={women.rows}
    />
  );
}

function headingFor(season: string): string {
  return `${season[0].toUpperCase()}${season.slice(1)} picks`;
}

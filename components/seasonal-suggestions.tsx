// Seasonal Suggestions: in-season picks with a Men / Women toggle.
// Server half: loads both sides once, hands them to the client toggle.
// Strictly in-season and switches on the first day of a new season
// (lib/discovery/lists). Hides entirely if both sides are empty.

import { getSeasonalPicks } from "@/lib/discovery/lists";
import { SeasonalToggle } from "./seasonal-toggle";

export async function SeasonalSuggestions() {
  const [men, women] = await Promise.all([getSeasonalPicks("men"), getSeasonalPicks("women")]);
  if (men.rows.length === 0 && women.rows.length === 0) return null;
  const season = men.season;
  const heading = `${season[0].toUpperCase()}${season.slice(1)} picks`;
  return <SeasonalToggle heading={heading} men={men.rows} women={women.rows} />;
}

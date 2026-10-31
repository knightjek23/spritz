// Season and rotation-window arithmetic for the discovery lists. Pure.
//
// Days are Pacific calendar days, matching the rest of the app's day
// boundaries, so a list never flips at 4 PM local time because UTC rolled
// over. Seasons are meteorological, Northern Hemisphere: Dec-Feb winter,
// Mar-May spring, Jun-Aug summer, Sep-Nov fall. Seasonal picks are strictly
// in-season (approved 2026-10-31): no lead-in to the next season.

export type Season = "spring" | "summer" | "fall" | "winter";

const TZ = "America/Los_Angeles";
const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Pacific calendar date as YYYY-MM-DD. */
export function pacificDate(date: Date): string {
  return fmt.format(date);
}

/** Whole days since 1970-01-01 for a Pacific calendar date. */
function dayNumber(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

const MONTH_SEASON: Season[] = [
  "winter", "winter", // Jan, Feb
  "spring", "spring", "spring", // Mar-May
  "summer", "summer", "summer", // Jun-Aug
  "fall", "fall", "fall", // Sep-Nov
  "winter", // Dec
];

export function seasonFor(date: Date): Season {
  const month = Number(pacificDate(date).slice(5, 7));
  return MONTH_SEASON[month - 1];
}

/** Rotation windows are 3 Pacific days long, counted from this date. */
export const WINDOW_EPOCH = "2026-11-01";
export const WINDOW_DAYS = 3;
const EPOCH_DAY = dayNumber(WINDOW_EPOCH);

export function windowIndex(date: Date): number {
  return Math.floor((dayNumber(pacificDate(date)) - EPOCH_DAY) / WINDOW_DAYS);
}

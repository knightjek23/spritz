// Wear streak: consecutive local days with at least one wear_log entry,
// ending on a given day, plus the copy the toast shows for each count.
//
// Pure functions, shared by the API (which knows the day the client just
// logged) and the home client (which knows its own local today). Nothing
// here touches the clock: every "day" is a YYYY-MM-DD string the caller
// chose, so a late-night log in California never counts toward tomorrow.
//
// Grace: one skipped day does not break the streak (Duolingo's Streak
// Freeze finding: a little slack raises daily actives rather than
// encouraging days off). Two skipped days in a row reset it.

export const GRACE_DAYS = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

function shift(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  return new Date(d.getTime() + delta * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Streak length ending on `today`, given every day the user has an entry
 * (any order, duplicates fine). 0 when today has no entry.
 */
export function streakEndingOn(days: Iterable<string>, today: string): number {
  const set = new Set(days);
  if (!set.has(today)) return 0;
  let count = 0;
  let cursor = today;
  let skipped = 0;
  for (;;) {
    if (set.has(cursor)) {
      count += 1;
      skipped = 0;
    } else {
      skipped += 1;
      if (skipped > GRACE_DAYS) break;
    }
    cursor = shift(cursor, -1);
    if (count > 10_000) break; // defensive
  }
  return count;
}

/** True when `today` had no entry before this log, i.e. the toast fires. */
export function isFirstLogOfDay(daysBefore: Iterable<string>, today: string): boolean {
  for (const d of daysBefore) if (d === today) return false;
  return true;
}

export interface StreakCopy {
  /** Headline: "Day 4", "One week", … */
  title: string;
  /** One line beneath it. */
  line: string;
  /** Milestones get the bigger card and the longer hold. */
  milestone: boolean;
}

const MILESTONES: Record<number, [string, string]> = {
  7: ["One week", "Seven days, seven bottles' worth of intention. This is how a signature starts."],
  30: ["One month", "Thirty days of showing up scented. Habits are built this way; so are wardrobes."],
  100: ["One hundred days", "Most people have a fragrance. You have a practice."],
  365: ["One year", "Three hundred and sixty-five mornings, each one chosen. Very few people can say that."],
};

// Rotation for ordinary days. {n} is the count in words, {N} in digits.
// Keyed on the count so the same day always shows the same line.
const DAILY: string[] = [
  "{n} days, {n} good decisions.",
  "{n} days without a scentless morning.",
  "{n} days, dressed to the last note.",
  "{n} days. The streak has a sillage of its own.",
  "{n} mornings, never once unscented.",
  "{n} days. The nose knows.",
];

const SMALL = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** 4 → "Four", 23 → "Twenty-three", 140 → "140" (digits past 99 read better). */
export function countWord(n: number): string {
  if (n < 20) return cap(SMALL[n]);
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    const o = n % 10;
    return cap(o ? `${t}-${SMALL[o]}` : t);
  }
  return String(n);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Copy for a streak of `n` days. `returning` marks a Day 1 that follows a
 * broken streak (vs. a user's very first log ever).
 */
export function streakCopy(n: number, returning = false): StreakCopy {
  if (n <= 1) {
    return {
      title: "Day 1",
      line: returning ? "Welcome back. Every streak starts here." : "Every streak starts here.",
      milestone: false,
    };
  }
  const m = MILESTONES[n];
  if (m) return { title: m[0], line: m[1], milestone: true };
  const word = countWord(n);
  const tpl = DAILY[n % DAILY.length];
  // "Four days, four good decisions." — second occurrence lowercase.
  let first = true;
  const line = tpl.replace(/\{n\}/g, () => {
    const w = first ? word : word.toLowerCase();
    first = false;
    return w;
  });
  return { title: `Day ${n}`, line, milestone: false };
}

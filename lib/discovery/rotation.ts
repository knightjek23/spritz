// Rotation for the discovery lists. Pure: pool and window in, ids out.
//
// Every 3-day window shows `size` picks drawn from a scored pool:
//   - Anchors (the top `anchors` by score) may appear in any window but sit
//     out at least one window in every three, so the best bottles recur
//     about two windows out of three.
//   - Everything else sits out `cooldown` windows after appearing.
//   - Draws are weighted (score ** power) without replacement, seeded from
//     the list key and window number, so every visitor sees the same picks
//     for the whole window.
// Cooldowns need to know what earlier windows showed, so the function
// replays every window from a fixed origin (window 0, the epoch in
// season.ts) up to the requested one. A fixed origin matters: replaying
// only the last few windows gives each call its own history, and then
// window N as seen while computing N+1 is not the window N visitors saw,
// which breaks cooldowns. At ~120 windows a year x 30 items this is
// trivial, and callers cache per window anyway.

export interface PoolItem {
  id: string;
  score: number;
  unisex: boolean;
}

export interface RotateOpts {
  size?: number;
  anchors?: number;
  cooldown?: number;
  power?: number;
  /** Most unisex picks allowed per window. Never relaxed. */
  maxUnisex?: number;
  /** First window of the shared timeline. Defaults to 0 (the epoch). */
  origin?: number;
}

const DEFAULTS = { size: 10, anchors: 3, cooldown: 2, power: 1.5, origin: 0 };

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawWindow(
  sorted: PoolItem[],
  anchorIds: Set<string>,
  history: string[][],
  listKey: string,
  k: number,
  o: Required<Omit<RotateOpts, "maxUnisex">> & { maxUnisex?: number },
): string[] {
  const recent = (n: number) => history.slice(-n);
  const cooled = new Set(recent(o.cooldown).flat());
  const lastTwo = recent(2);
  const anchorResting = (id: string) =>
    lastTwo.length === 2 && lastTwo.every((w) => w.includes(id));

  const excluded = (p: PoolItem) =>
    anchorIds.has(p.id) ? anchorResting(p.id) : cooled.has(p.id);

  const rand = mulberry32(fnv1a(`${listKey}:${k}`));
  const picks: PoolItem[] = [];
  let unisex = 0;
  const canTake = (p: PoolItem) => !p.unisex || o.maxUnisex === undefined || unisex < o.maxUnisex;
  const take = (p: PoolItem) => {
    picks.push(p);
    if (p.unisex) unisex++;
  };

  const candidates = sorted.filter((p) => !excluded(p));
  while (picks.length < o.size) {
    const open = candidates.filter((p) => !picks.includes(p) && canTake(p));
    if (open.length === 0) break;
    const weights = open.map((p) => Math.max(p.score, 1e-6) ** o.power);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rand() * total;
    let idx = 0;
    while (idx < open.length - 1 && r >= weights[idx]) {
      r -= weights[idx];
      idx++;
    }
    take(open[idx]);
  }

  // Not enough eligible: top up by score, relaxing the cooldown but never
  // the unisex cap.
  for (const p of sorted) {
    if (picks.length >= o.size) break;
    if (!picks.includes(p) && canTake(p)) take(p);
  }

  return picks.sort((a, b) => b.score - a.score).map((p) => p.id);
}

export function rotate(
  pool: PoolItem[],
  listKey: string,
  window: number,
  opts: RotateOpts = {},
): string[] {
  if (pool.length === 0) return [];
  const o = { ...DEFAULTS, ...opts };
  const sorted = [...pool].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const anchorIds = new Set(sorted.slice(0, o.anchors).map((p) => p.id));

  const history: string[][] = [];
  let current: string[] = [];
  for (let k = Math.min(o.origin, window); k <= window; k++) {
    current = drawWindow(sorted, anchorIds, history, listKey, k, o);
    history.push(current);
  }
  return current;
}

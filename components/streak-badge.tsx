"use client";

// Streak badge: the centrepiece of the streak toast.
//
// Structure follows the reference badge (sunburst rays, ring, laurel
// wreath, count at the top of the face) in Spritz colours, with the brand
// bottle in the middle where the reference had a match flame. The flame's
// job (the thing that is alive) is done by the bottle: its gold head
// presses and a puff of mist leaves the nozzle.
//
// Choreography, plays once (keyframes in globals.css under "streak badge"):
//     0–480ms  badge lands: 85% -> overshoot -> 100%. Never an empty ring;
//              the face arrives already populated.
//   250–750ms  laurel leaves grow up both sides, staggered.
//      450ms   the head presses, mist puffs from the nozzle, brass flecks.
//   600–1100ms the count rolls from yesterday's number to today's. This
//              is the payoff, so it gets the most time.
//      700ms   rays burst outward, then settle.
//   afterwards idle only: rays turn slowly and the bottle sprays again
//              every few seconds. The entrance never replays.
//
// Milestones (7, 30, 100, 365) get a brass ring, longer rays and more
// flecks. prefers-reduced-motion shows the finished badge with no motion.

import { useId, useMemo } from "react";
import { StreakBottle } from "@/components/streak-bottle";

// Style-guide colours (tailwind.config.ts). Gold is ALWAYS brass: the ring,
// laurels, rays and flecks all use it, so the badge reads as one metal.
const BRASS = "#C9A961";
const EMERALD = "#1F3F2E";

const C = 120; // centre of the 240x240 viewBox
const RING_R = 68;
const LAUREL_R = 45;
const LEAF_RX = 4.2;
const LEAF_RY = 9;

function polar(r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
}

export function StreakBadge({
  streak,
  milestone = false,
  size = 168,
}: {
  streak: number;
  milestone?: boolean;
  size?: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const prev = Math.max(0, streak - 1);

  const rays = useMemo(() => {
    const n = milestone ? 48 : 40;
    return Array.from({ length: n }, (_, i) => {
      const deg = (360 / n) * i;
      const long = i % 2 === 0;
      const a = polar(RING_R + 9, deg);
      const b = polar(long ? (milestone ? 118 : 113) : 100, deg);
      return { a, b, long };
    });
  }, [milestone]);

  // Two branches rising from the bottom of the face and stopping short of
  // the top, leaving room for the count. Each step carries a pair of leaves
  // that point UP the branch, one tipped toward the ring and one toward the
  // centre, which is what makes it read as a wreath rather than tick marks.
  // SVG angles run clockwise from +x, so 90deg is straight down; the ellipse
  // is drawn pointing local -y, which after rotate(r) faces angle r - 90.
  const leaves = useMemo(() => {
    const out: { x: number; y: number; rot: number; delay: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const off = 30 + i * 19;
      for (const side of [1, -1]) {
        // side 1 = left branch (angle grows clockwise up the left side).
        const deg = 90 + side * off;
        const p = polar(LAUREL_R, deg);
        const tangent = side === 1 ? deg + 90 : deg - 90; // direction of growth
        for (const tilt of [32, -32]) {
          out.push({
            x: p.x,
            y: p.y,
            rot: tangent + tilt + 90,
            delay: 260 + i * 65 + (side === 1 ? 0 : 30) + (tilt > 0 ? 0 : 20),
          });
        }
      }
    }
    return out;
  }, []);

  const stemL = (() => {
    const a = polar(LAUREL_R, 100);
    const b = polar(LAUREL_R, 90 + 30 + 5 * 19 + 6);
    return `M${a.x} ${a.y} A${LAUREL_R} ${LAUREL_R} 0 0 1 ${b.x} ${b.y}`;
  })();
  const stemR = (() => {
    const a = polar(LAUREL_R, 80);
    const b = polar(LAUREL_R, 90 - 30 - 5 * 19 - 6);
    return `M${a.x} ${a.y} A${LAUREL_R} ${LAUREL_R} 0 0 0 ${b.x} ${b.y}`;
  })();

  const flecks = useMemo(
    () =>
      Array.from({ length: milestone ? 10 : 6 }, (_, i) => ({
        dx: 22 + ((i * 37) % 32),
        // Centred on the nozzle's line so the flecks don't drift upward.
        dy: -9 + ((i * 23) % 19),
        r: 1.3 + ((i * 7) % 5) / 8,
        d: 470 + i * 45,
      })),
    [milestone],
  );

  // Bottle: 59x73 artwork scaled to ~37x46, centred slightly low so the
  // count has room above it. Nozzle (cap's right edge) lands at NOZZLE.
  const BOTTLE_SCALE = 0.64;
  const BX = C - (59 * BOTTLE_SCALE) / 2;
  const BY = C + 6 - (73 * BOTTLE_SCALE) / 2;
  const NOZZLE = { x: BX + 40 * BOTTLE_SCALE, y: BY + 5 * BOTTLE_SCALE };

  const digits = String(streak).length;
  const numSize = digits >= 4 ? 17 : digits === 3 ? 20 : 23;

  return (
    <svg
      className={`sb-badge ${milestone ? "sb-badge--milestone" : ""}`}
      width={size}
      height={size}
      viewBox="0 0 240 240"
      role="img"
      aria-label={`${streak} day streak`}
    >
      <defs>
        <radialGradient id={`${uid}-face`} cx="50%" cy="42%" r="60%">
          <stop offset="0" stopColor="#FFFDF8" />
          <stop offset="1" stopColor="#F4EFE6" />
        </radialGradient>
        <linearGradient id={`${uid}-mist`} x1="0" x2="1">
          <stop offset="0" stopColor="#1F3F2E" stopOpacity=".55" />
          <stop offset=".45" stopColor="#1F3F2E" stopOpacity=".22" />
          <stop offset="1" stopColor="#1F3F2E" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${uid}-num`}>
          <rect x={C - 40} y={58} width={80} height={27} />
        </clipPath>
      </defs>

      {/* Sunburst: the burst wrapper scales in once; the inner group turns forever. */}
      <g className="sb-rays">
        <g className="sb-rays-spin">
          {rays.map((r, i) => (
            <line
              key={i}
              x1={r.a.x}
              y1={r.a.y}
              x2={r.b.x}
              y2={r.b.y}
              stroke={BRASS}
              strokeOpacity={r.long ? 0.7 : 0.4}
              strokeWidth={r.long ? 1.8 : 1.3}
              strokeLinecap="round"
            />
          ))}
        </g>
      </g>

      {/* Ring + face */}
      <g className="sb-body">
        <circle cx={C} cy={C} r={RING_R} fill={`url(#${uid}-face)`} stroke={BRASS} strokeWidth={7} />
        {/* Milestones: the ring is brass every day now, so milestones are
            marked with an inner emerald hairline instead. */}
        {milestone && (
          <circle cx={C} cy={C} r={RING_R - 6} fill="none" stroke={EMERALD} strokeOpacity=".5" strokeWidth={1.2} />
        )}

        {/* Laurels */}
        <path className="sb-stem" d={stemL} stroke={BRASS} strokeWidth={1.4} fill="none" strokeLinecap="round" />
        <path className="sb-stem" d={stemR} stroke={BRASS} strokeWidth={1.4} fill="none" strokeLinecap="round" />
        {leaves.map((l, i) => (
          <g key={i} transform={`translate(${l.x} ${l.y}) rotate(${l.rot})`}>
            <ellipse
              className="sb-leaf"
              cx={0}
              cy={-LEAF_RY}
              rx={LEAF_RX}
              ry={LEAF_RY}
              fill={BRASS}
              style={{ animationDelay: `${l.delay}ms` }}
            />
          </g>
        ))}

        {/* Count: yesterday's number rolls up and out, today's rolls in. */}
        <g clipPath={`url(#${uid}-num)`}>
          <g className="sb-roll">
            {[prev, streak].map((n, i) => (
              <text
                key={i}
                x={C}
                y={80 + i * 27}
                textAnchor="middle"
                fontSize={numSize}
                fontWeight={700}
                fill="#1F3F2E"
                style={{ fontFamily: 'var(--font-playfair), "Playfair Display", Georgia, serif' }}
              >
                {n}
              </text>
            ))}
          </g>
        </g>

        {/* Bottle, with its own head-press keyframes (see .sb-badge .streak-cap). */}
        <g transform={`translate(${BX} ${BY}) scale(${BOTTLE_SCALE})`}>
          <StreakBottle className="sb-bottle" />
        </g>

        {/* Mist from the nozzle, angled slightly up, plus brass flecks. */}
        {/* Level with the nozzle, symmetric top to bottom: the spray goes
            straight out. */}
        <g transform={`translate(${NOZZLE.x} ${NOZZLE.y})`}>
          <path
            className="sb-mist"
            d="M0 0 C12 -4 30 -10 50 -15 C59 -7 59 7 50 15 C30 10 12 4 0 0 Z"
            fill={`url(#${uid}-mist)`}
          />
          {flecks.map((f, i) => (
            <circle
              key={i}
              className="sb-fleck"
              cx={0}
              cy={0}
              r={f.r}
              style={
                {
                  "--dx": `${f.dx}px`,
                  "--dy": `${f.dy}px`,
                  animationDelay: `${f.d}ms`,
                } as React.CSSProperties
              }
            />
          ))}
        </g>
      </g>
    </svg>
  );
}

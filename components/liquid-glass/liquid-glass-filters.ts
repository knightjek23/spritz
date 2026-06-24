/**
 * liquid-glass-filters.ts
 *
 * Builds the SVG <filter> defs for the glass refraction — the displacement that
 * makes the backdrop bend like real glass. Technique: a low-frequency fractal
 * noise drives an feDisplacementMap on the blurred backdrop. Strength scales
 * with element size: a big surface wants a large displacement, a thin bar
 * wants a small one, or it smears.
 *
 * Verbatim from the liquid-glass skill (assets/liquid-glass-filters.ts).
 */

export interface DisplaceVariant {
  /** Filter id, referenced as filter: url(#id). */
  id: string;
  /** Noise frequency [x, y]. Low = large, smooth waves. Keep near 0.003–0.008. */
  baseFrequency: [number, number];
  /** Displacement strength in px. ~40 thin bars · ~100 cards · ~180 big surfaces. */
  scale: number;
  /** Octaves of noise. 1 is smooth; 2 adds finer detail. */
  octaves?: number;
}

function displaceFilter(v: DisplaceVariant): string {
  const oct = v.octaves ?? 1;
  const [bx, by] = v.baseFrequency;
  // A generous filter region so the displaced backdrop isn't clipped at edges.
  return `
  <filter id="${v.id}" x="-20%" y="-20%" width="140%" height="140%" filterUnits="objectBoundingBox">
    <feTurbulence type="fractalNoise" baseFrequency="${bx} ${by}" numOctaves="${oct}" result="turbulence"/>
    <feDisplacementMap in="SourceGraphic" in2="turbulence" scale="${v.scale}"
      xChannelSelector="R" yChannelSelector="G"/>
  </filter>`;
}

/** Default variants used by the presets. */
export const DEFAULT_VARIANTS: DisplaceVariant[] = [
  { id: "lg-glass-subtle", baseFrequency: [0.004, 0.008], scale: 40 },
  { id: "lg-glass", baseFrequency: [0.003, 0.007], scale: 100 },
  { id: "lg-glass-strong", baseFrequency: [0.003, 0.007], scale: 180 },
];

/** Build the full <svg> defs string for the given variants. */
export function buildLiquidGlassFilters(
  variants: DisplaceVariant[] = DEFAULT_VARIANTS,
): string {
  return `<svg width="0" height="0" aria-hidden="true" focusable="false"
    style="position:absolute;width:0;height:0;overflow:hidden">
  <defs>${variants.map(displaceFilter).join("\n")}</defs>
</svg>`;
}

export const LIQUID_GLASS_FILTERS_ID = "liquid-glass-filter-defs";

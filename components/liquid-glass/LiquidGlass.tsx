"use client";

/**
 * LiquidGlass.tsx
 *
 * Reusable liquid-glass (iOS-26 / Apple) skin: three stacked layers — bend
 * (backdrop blur + displacement), face (lift shadow), edge (inset rim
 * highlight). Wrap any element to give it a frosted, refracting glass surface.
 *
 *   <LiquidGlass preset="bottom-nav" className="fixed bottom-0 inset-x-0">…</LiquidGlass>
 *
 * Render <LiquidGlassDefs /> once near the app root so the displacement
 * filters exist in the document. If you forget, ensureDefs() injects them
 * lazily on the first mount.
 *
 * Verbatim from the liquid-glass skill (assets/LiquidGlass.tsx) with minor
 * import path adjustments for this project.
 */

import {
  forwardRef,
  useEffect,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";
import {
  buildLiquidGlassFilters,
  DEFAULT_VARIANTS,
  LIQUID_GLASS_FILTERS_ID,
  type DisplaceVariant,
} from "./liquid-glass-filters";

export type LiquidGlassPreset =
  | "nav"
  | "bottom-nav"
  | "search"
  | "card"
  | "modal"
  | "button";

interface PresetDef {
  filter: string; // displacement variant id
  blur: number; // backdrop blur px
  radius: number; // px; 999 → pill
  edge: number; // rim highlight opacity 0..1
}

export const PRESETS: Record<LiquidGlassPreset, PresetDef> = {
  nav: { filter: "lg-glass-subtle", blur: 2, radius: 0, edge: 0.45 },
  "bottom-nav": { filter: "lg-glass-subtle", blur: 2, radius: 32, edge: 0.45 },
  search: { filter: "lg-glass-subtle", blur: 2, radius: 999, edge: 0.45 },
  card: { filter: "lg-glass", blur: 3, radius: 24, edge: 0.45 },
  modal: { filter: "lg-glass", blur: 4, radius: 28, edge: 0.4 },
  button: { filter: "lg-glass-subtle", blur: 2, radius: 16, edge: 0.5 },
};

// --- filter defs (inject once) ---

export function LiquidGlassDefs({
  variants = DEFAULT_VARIANTS,
}: {
  variants?: DisplaceVariant[];
}) {
  const [render, setRender] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById(LIQUID_GLASS_FILTERS_ID)) return;
    setRender(true);
  }, []);
  if (!render) return null;
  return (
    <div
      id={LIQUID_GLASS_FILTERS_ID}
      aria-hidden
      style={{
        position: "absolute",
        width: 0,
        height: 0,
        overflow: "hidden",
      }}
      dangerouslySetInnerHTML={{ __html: buildLiquidGlassFilters(variants) }}
    />
  );
}

function ensureDefs() {
  if (typeof document === "undefined") return;
  if (document.getElementById(LIQUID_GLASS_FILTERS_ID)) return;
  const host = document.createElement("div");
  host.id = LIQUID_GLASS_FILTERS_ID;
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:absolute;width:0;height:0;overflow:hidden";
  host.innerHTML = buildLiquidGlassFilters();
  document.body.appendChild(host);
}

function usePrefersReducedTransparency() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-transparency: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

// --- component ---

export interface LiquidGlassProps {
  children?: ReactNode;
  preset?: LiquidGlassPreset;
  /** Displacement variant id; overrides the preset. '' disables the wobble. */
  filter?: string;
  blur?: number;
  radius?: number;
  /** Rim highlight opacity 0..1. */
  edge?: number;
  /** Rim highlight RGB triplet as "R, G, B" — default "255, 255, 255" (white).
   *  Use to color-match the rim to the surrounding tint, e.g.
   *  edgeColor="250, 246, 237" for a cream-toned rim on a cream nav. */
  edgeColor?: string;
  /** Optional translucent fill over the glass, e.g. 'rgba(255,255,255,0.06)'. */
  tint?: string;
  /** Face-layer drop shadow. Pass a custom boxShadow string to override
   *  the default; pass `false` to disable it entirely for a flatter,
   *  edge-only surface (useful on the top nav where the default lift
   *  reads too heavy against the LiquidGlass rim). */
  shadow?: string | false;
  className?: string;
  style?: CSSProperties;
  as?: keyof JSX.IntrinsicElements;
  // Pass-through attributes that some elements (nav, header) need.
  role?: string;
  "aria-label"?: string;
}

export const LiquidGlass = forwardRef<HTMLElement, LiquidGlassProps>(
  function LiquidGlass(props, ref) {
    const {
      children,
      preset = "card",
      filter,
      blur,
      radius,
      edge,
      edgeColor,
      tint,
      shadow,
      className,
      style,
      as: Tag = "div",
      role,
      "aria-label": ariaLabel,
    } = props;

    // Default face-layer shadow — used unless the caller explicitly
    // overrides or disables it via the `shadow` prop.
    const DEFAULT_SHADOW =
      "0 4px 4px rgba(0,0,0,0.15), 0 0 12px rgba(0,0,0,0.08)";
    const shadowValue =
      shadow === false ? null : shadow ?? DEFAULT_SHADOW;

    const p = PRESETS[preset];
    const filterId = filter ?? p.filter;
    const blurPx = blur ?? p.blur;
    const radiusPx =
      (radius ?? p.radius) >= 999 ? 9999 : radius ?? p.radius;
    const edgeOp = edge ?? p.edge;
    const edgeRgb = edgeColor ?? "255, 255, 255";

    const reduced = usePrefersReducedTransparency();
    useEffect(() => {
      ensureDefs();
    }, []);

    // Cast Tag to a generic ElementType so TypeScript stops trying to
    // unify the ref union across every keyof JSX.IntrinsicElements (the
    // union explodes and trips the strict checker with "union type too
    // complex to represent" during the prod build).
    const TagComponent = Tag as ElementType;

    // Outer container: just the border-radius + any caller-provided style.
    // Crucially, we do NOT set `position` here — that lets the caller use
    // `sticky top-0`, `fixed bottom-0`, `absolute`, etc. via className
    // without being overridden by inline styles (inline always wins over
    // CSS classes, so setting position:relative here would clobber every
    // sticky/fixed caller silently).
    const container: CSSProperties = {
      borderRadius: radiusPx,
      ...style,
    };

    // Inner wrapper carries the position:relative that the glass layers
    // need as their containing block. Because it's a child of Tag, it
    // doesn't affect Tag's own positioning (Tag can be sticky/fixed/
    // anything). `borderRadius: inherit` makes the inner share Tag's
    // rounded shape so the layers clip correctly.
    const wrapper: CSSProperties = {
      position: "relative",
      borderRadius: "inherit",
    };

    const fill: CSSProperties = {
      position: "absolute",
      inset: 0,
      borderRadius: "inherit",
      pointerEvents: "none",
    };

    if (reduced) {
      return (
        <TagComponent
          ref={ref}
          data-liquid-glass-root
          className={className}
          role={role}
          aria-label={ariaLabel}
          style={{ ...container, background: "rgba(28,28,32,0.9)" }}
        >
          <div style={wrapper}>{children}</div>
        </TagComponent>
      );
    }

    return (
      <TagComponent
        ref={ref}
        data-liquid-glass-root
        className={className}
        role={role}
        aria-label={ariaLabel}
        style={container}
      >
        <div style={wrapper}>
          {/* bend: backdrop blur + liquid displacement */}
          <div
            style={{
              ...fill,
              backdropFilter: `blur(${blurPx}px)`,
              WebkitBackdropFilter: `blur(${blurPx}px)`,
              filter: filterId ? `url(#${filterId})` : undefined,
              zIndex: 0,
            }}
          />
          {/* optional tint */}
          {tint && (
            <div style={{ ...fill, background: tint, zIndex: 1 }} />
          )}
          {/* face: lift shadow — skipped entirely when shadow={false}
              (some callers, like the top nav, want a flatter surface
              without the drop). */}
          {shadowValue && (
            <div
              style={{
                ...fill,
                boxShadow: shadowValue,
                zIndex: 2,
              }}
            />
          )}
          {/* edge: beveled rim highlight. Color comes from the edgeColor
              prop so callers can match the rim to the tint (cream nav →
              cream rim) instead of the default stark white. */}
          <div
            style={{
              ...fill,
              boxShadow: `inset 3px 3px 3px 0 rgba(${edgeRgb},${edgeOp}), inset -3px -3px 3px 0 rgba(${edgeRgb},${edgeOp})`,
              zIndex: 3,
            }}
          />
          {/* content */}
          <div style={{ position: "relative", zIndex: 4 }}>{children}</div>
        </div>
      </TagComponent>
    );
  },
);

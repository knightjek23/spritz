// Spritz loading mark — the brand bottle giving a little spray.
//
// Replaces the generic border-spinner in transient wait states (search,
// scan submit, buy-link resolution). It reuses the exact bottle geometry
// from bottle-placeholder.tsx (cap 88,16 / neck 98,44 / body 56,60) so the
// loader and the "photo coming soon" bottle read as the same drawn object,
// plus an atomizer spout and three spray lines that puff out on each pump.
//
// Pure SVG + CSS keyframes (in app/globals.css) — no JS timers, no raster
// assets, no layout shift, and it inherits color from the parent via
// currentColor so it works on cream, paper, or an emerald surface.
//
//   <SpritzLoader />                        // 40px, emerald, "Loading"
//   <SpritzLoader size={20} />              // inline, next to button text
//   <SpritzLoader size={72} label="Reading the label…" showLabel />

export function SpritzLoader({
  size = 40,
  label = "Loading",
  showLabel = false,
  className = "",
}: {
  /** Rendered height in px. Width follows the 148:214 viewBox ratio.
   *  Below ~24px the spray stops reading — use a plain dot spinner there. */
  size?: number;
  /** Announced to screen readers; also the visible caption when showLabel.
   *  Pass "" when the mark sits inside something that already announces
   *  the wait (a role="status" overlay, a checklist) — the wrapper then
   *  goes aria-hidden instead of nesting a second live region. */
  label?: string;
  /** Show the label under the bottle (full-screen / section waits). */
  showLabel?: boolean;
  /** Extra classes on the wrapper. Set a text color here to recolor the
   *  mark — every stroke is currentColor. Defaults to emerald. */
  className?: string;
}) {
  // An empty label means the caller owns the announcement, so this
  // instance is purely decorative — no role, no second live region.
  const decorative = label === "";

  // Only fall back to emerald when the caller hasn't set a text color.
  // Tailwind emits color utilities in config order, not in the order they
  // appear in the class attribute, so a hardcoded `text-emerald` here
  // would beat a caller's `text-cream` in the cascade and the mark would
  // vanish on every dark surface.
  const tint = /(^|\s)text-/.test(className) ? "" : "text-emerald";

  return (
    <span
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "status", "aria-live": "polite" as const })}
      className={`inline-flex flex-col items-center gap-3 ${tint} ${className}`}
    >
      <svg
        // Window covers the bottle (x 56-163, y 16-203) plus the full travel
        // of the spray off the spout, with room for the 5-unit stroke.
        viewBox="48 -3 148 214"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ height: size, width: (size * 148) / 214 }}
        aria-hidden="true"
        focusable="false"
      >
        {/* Liquid sitting in the base — the only thing that glows. Its
            fill-opacity is animated, not its color, so the wash stays in
            whatever emerald currentColor resolves to and reads as pale
            sage deepening to full emerald and back. */}
        {/* Drawn as a path, not a rect: a rect's rx rounds all four
            corners, and a liquid surface has to be flat. Bottom corners
            follow the bottle; the sides and floor run 1-2 units PAST the
            glass's inner wall so they finish underneath the 5-wide
            outline instead of leaving a hairline of cream at the seam. */}
        <path
          d="M57 148 H162 V198 A4 4 0 0 1 158 202 H61 A4 4 0 0 1 57 198 Z"
          fill="currentColor"
          fillOpacity="0.2"
          className="spritz-loader-liquid"
        />

        {/* Bottle outline */}
        <rect x="56" y="60" width="107" height="143" rx="7.5" stroke="currentColor" strokeWidth="5" />
        <rect x="98" y="44" width="23" height="15" stroke="currentColor" strokeWidth="5" />

        {/* Cap + spout press down together on each pump. Filled with the
            page background (not transparent) so the cap travels DOWN over
            the neck and hides it, the way a real atomizer collar does —
            override --spritz-loader-cap-fill on a dark surface. */}
        <g className="spritz-loader-cap">
          <rect
            x="88" y="16" width="43" height="27" rx="1.5"
            fill="var(--spritz-loader-cap-fill, var(--bg-base, #F4EFE6))"
            stroke="currentColor" strokeWidth="5"
          />
          <rect
            x="131" y="24" width="12" height="9" rx="1.5"
            fill="var(--spritz-loader-cap-fill, var(--bg-base, #F4EFE6))"
            stroke="currentColor" strokeWidth="5"
          />
        </g>

        {/* Spray — three lines fanning off the spout */}
        <g className="spritz-loader-spray" stroke="currentColor" strokeWidth="5" strokeLinecap="round">
          <path d="M150.5 20 L169.3 13.2" />
          <path d="M152 28.5 L172 28.5" />
          <path d="M150.5 37 L169.3 43.8" />
        </g>

        {/* Droplets — each one sits on the extension of its own spray line,
            a beat behind it, so the mist reads as one continuous throw */}
        <g className="spritz-loader-mist" fill="currentColor">
          <circle cx="177.8" cy="10.1" r="2.8" />
          <circle cx="180" cy="28.5" r="2.8" />
          <circle cx="177.8" cy="46.9" r="2.8" />
        </g>
      </svg>

      {showLabel && label ? (
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate">
          {label}
        </span>
      ) : decorative ? null : (
        <span className="sr-only">{label}</span>
      )}
    </span>
  );
}

export default SpritzLoader;

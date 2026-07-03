import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // 2026 boutique-editorial palette — Playfair + Roboto + emerald/cream
        // Replaces the prior Consumer/Startup combo (Cloud Dancer/Electric Blue/Acid Yellow).
        cream: "#F4EFE6",      // Base canvas — warmer than Cloud Dancer
        paper: "#F0EADE",      // Surface elevation — creamy warm beige, lifted from prior #E8E1D4 so slate text passes WCAG AA (4.55:1)
        emerald: "#1F3F2E",    // Primary brand — deep forest green
        ink: "#1A1A1A",        // Primary text — deeper black for cream contrast
        slate: "#6B6960",      // Secondary text — warm slate harmonizing with cream
        mist: "#A8A49A",       // Disabled, dividers
        periwinkle: "#5A85C5", // Accent line, subtle highlights
        brass: "#C9A961",      // Saved confirmations — warm gold (replaces acid yellow)
        burgundy: "#8B3A3A",   // Error / destructive (replaces neon coral)

        // Backwards-compat aliases so any leftover bone/electric/acid/teal/coral
        // class still renders sensibly during migration. Remove once sweep is verified.
        bone: "#F4EFE6",
        electric: "#1F3F2E",
        acid: "#C9A961",
        teal: "#1F3F2E",
        coral: "#8B3A3A",
      },
      fontFamily: {
        // Display — Playfair Display (loaded via next/font/google → --font-playfair)
        display: ["var(--font-playfair)", '"Playfair Display"', "Georgia", "serif"],
        // Body — Roboto (loaded via next/font/google → --font-roboto)
        sans: ["var(--font-roboto)", '"Roboto"', "system-ui", "sans-serif"],
        // "Mono" is now a STYLE category, not a literal monospace family.
        // Use Roboto Light at small sizes with uppercase + tracking utilities.
        mono: ["var(--font-roboto)", '"Roboto"', "system-ui", "sans-serif"],
      },
      fontSize: {
        // Type scale matching the Figma typography page (May 2026)
        // [size, { lineHeight, letterSpacing }]
        hero: ["56px", { lineHeight: "1.05", letterSpacing: "-0.01em" }],
        section: ["30px", { lineHeight: "1.15", letterSpacing: "-0.005em" }],
        body: ["16px", { lineHeight: "1.55" }],
        small: ["13px", { lineHeight: "1.5" }],
        meta: ["11px", { lineHeight: "1.3", letterSpacing: "0.18em" }],
        match: ["14px", { lineHeight: "1.4" }],
      },
    },
  },
  plugins: [],
};

export default config;

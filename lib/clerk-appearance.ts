// Shared Clerk appearance — skins the hosted <SignIn>/<SignUp>/<UserButton>
// components so they match Spritz's boutique-editorial design system.
//
// Tokens mirror app/globals.css (:root) and tailwind.config:
//   Cream canvas   #F4EFE6   Emerald (primary) #1F3F2E
//   Warm surface   #F0EADE   Brass  (accent)   #C9A961
//   Ink text       #1A1A1A   Slate  (muted)    #6B6960
//   Error          #8B3A3A   Periwinkle line   #5A85C5
//   Fonts: Playfair Display (headings), Roboto (body) via CSS variables.
//
// Note on corners: globals.css forces border-radius:0 on every element
// (except the bottom nav) via an !important reset, so Clerk's rendered
// nodes are already sharp-edged. borderRadius below is set to match for
// any inline-styled internals, but the global reset is the source of truth.

import type { Appearance } from "@clerk/types";

// Spritz brand palette (kept local so this file has no runtime imports).
const emerald = "#1F3F2E";
const emeraldHover = "#183123"; // ~15% darker for hover/active
const cream = "#F4EFE6";
const surface = "#F0EADE";
const ink = "#1A1A1A";
const slate = "#6B6960";
const brass = "#C9A961";
const error = "#8B3A3A";

const fontBody = "var(--font-roboto), Roboto, system-ui, sans-serif";
const fontDisplay = 'var(--font-playfair), "Playfair Display", Georgia, serif';

export const spritzClerkAppearance: Appearance = {
  variables: {
    colorPrimary: emerald,
    colorText: ink,
    colorTextSecondary: slate,
    colorTextOnPrimaryBackground: cream,
    colorBackground: surface,
    colorInputBackground: cream,
    colorInputText: ink,
    colorDanger: error,
    colorSuccess: emerald,
    colorNeutral: ink,
    fontFamily: fontBody,
    fontFamilyButtons: fontBody,
    fontWeight: { normal: 300, medium: 500, bold: 600 },
    borderRadius: "0",
    spacingUnit: "1rem",
  },
  elements: {
    // Card: warm paper surface, hairline ink border, no glossy shadow.
    card: {
      backgroundColor: surface,
      border: `1px solid rgba(26, 26, 26, 0.10)`,
      boxShadow: "none",
    },
    // The container behind the card (Clerk renders a wrapper) stays transparent
    // so the page's cream canvas shows through.
    rootBox: { width: "100%" },
    cardBox: { boxShadow: "none", border: "none" },

    // Header — Playfair display serif to match h1–h4.
    headerTitle: {
      fontFamily: fontDisplay,
      fontWeight: 400,
      letterSpacing: "-0.01em",
      color: ink,
    },
    headerSubtitle: { color: slate },

    // Primary button — emerald with cream text, matching site CTAs.
    formButtonPrimary: {
      backgroundColor: emerald,
      color: cream,
      fontFamily: fontBody,
      fontWeight: 500,
      textTransform: "none",
      boxShadow: "none",
      "&:hover, &:focus, &:active": { backgroundColor: emeraldHover },
    },

    // Social / OAuth + secondary buttons — outlined on cream.
    socialButtonsBlockButton: {
      backgroundColor: cream,
      border: `1px solid rgba(26, 26, 26, 0.12)`,
      color: ink,
      "&:hover": { backgroundColor: surface },
    },
    socialButtonsBlockButtonText: { fontWeight: 400, color: ink },

    // Inputs.
    formFieldInput: {
      backgroundColor: cream,
      border: `1px solid rgba(26, 26, 26, 0.15)`,
      color: ink,
      "&:focus": { borderColor: emerald, boxShadow: `0 0 0 1px ${emerald}` },
    },
    formFieldLabel: { color: slate, fontWeight: 400 },

    // Links / actions — periwinkle-free ink→emerald for on-brand contrast.
    footerActionLink: {
      color: emerald,
      fontWeight: 500,
      "&:hover": { color: emeraldHover },
    },
    identityPreviewEditButtonIcon: { color: emerald },
    formResendCodeLink: { color: emerald },

    // Dividers + brass accent on the "or" separator line.
    dividerLine: { backgroundColor: "rgba(26, 26, 26, 0.10)" },
    dividerText: { color: slate },

    // Hide Clerk's development badge look-alike if present; keep footer subtle.
    footer: { "& + div": {} },
    badge: { backgroundColor: brass, color: ink },
  },
};

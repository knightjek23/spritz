import "@/lib/env"; // fail fast on missing env vars in production
import type { Metadata, Viewport } from "next";
import { Playfair_Display, Roboto } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { spritzClerkAppearance } from "@/lib/clerk-appearance";
import { Nav } from "@/components/nav";
import { BottomNav } from "@/components/bottom-nav";
import { Footer } from "@/components/footer";
import { Analytics } from "@/components/analytics";
import { LiquidGlassDefs } from "@/components/liquid-glass/LiquidGlass";
import { PageTransition } from "@/components/page-transition";
import "./globals.css";

// Playfair Display — high-contrast serif for hero / section headings.
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-playfair",
  display: "swap",
});

// Roboto — body, small, metadata. Light + Extra Light per the Figma type spec.
const roboto = Roboto({
  subsets: ["latin"],
  weight: ["100", "300", "400", "500"],
  variable: "--font-roboto",
  display: "swap",
});

export const metadata: Metadata = {
  // Resolves relative OG/Twitter image URLs against the real domain
  // instead of localhost / the raw *.vercel.app deployment URL.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Spritz: know what you're wearing",
    // Child pages set just their own title; the template appends the brand.
    template: "%s · Spritz",
  },
  description: "Scan a bottle. See its full profile, perfumer, and how to wear it.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Spritz", statusBarStyle: "black-translucent" },
  // Icons: 32px favicon for browser tabs, 180px apple-touch-icon for iOS
  // home screen. The 192/512 PWA icons are referenced from manifest.webmanifest.
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Spritz: know what you're wearing",
    description:
      "The fragrance library. Scan any bottle to read its full story: notes, perfumer, longevity, how to wear it.",
    siteName: "Spritz",
    type: "website",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Spritz" }],
  },
  twitter: {
    card: "summary",
    title: "Spritz: know what you're wearing",
    description: "The fragrance library, in your pocket.",
    images: ["/icon-512.png"],
  },
  // Affiliate network site-ownership verification. Rendered into <head> on
  // every page (FlexOffers checks the home page). Safe to remove once the
  // network shows the site as verified, but harmless to leave.
  //
  // These MUST go through the Metadata API. A hand-written <head> in an App
  // Router root layout is unsupported: it silently fails to render, and the
  // networks' own snippets use value="..." which is not a valid React prop on
  // <meta> and fails the type check.
  //
  // The IDs are re-issued each time you re-add the site in the network's
  // dashboard. If verification fails, compare the GUID in the dialog against
  // what production is actually serving BEFORE debugging anything else — on
  // 2026-08-17 Impact rejected a perfectly-rendered tag simply because it
  // carried a superseded ID from an earlier attempt.
  other: {
    "fo-verify": "325b1f7f-146e-4fbd-90c6-12c94bcf614d",
    // Re-issued 2026-08-17; replaced e550c991-0845-4bc1-b011-eed13c9b978b.
    "impact-site-verification": "15430c52-c79f-4a74-99ed-cfffdc13ebb1",
  },
};

export const viewport: Viewport = {
  themeColor: "#1F3F2E", // Emerald — matches the new brand color
  width: "device-width",
  initialScale: 1,
  // Full-bleed layout on notched devices. Without this the WKWebView lays
  // the page out inside the safe area and paints theme-colored bands above
  // and below it, which reads as a wrapped website — the exact impression
  // Guideline 4.2 punishes. With it, backgrounds run edge to edge and the
  // insets become our problem: every fixed element uses the --safe-* and
  // --nav-clearance tokens in globals.css. Never hardcode a bottom offset.
  viewportFit: "cover",
  // No maximumScale / userScalable lock: blocking pinch-zoom fails
  // WCAG 1.4.4 (Android respects the lock; low-vision users can't zoom).
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider appearance={spritzClerkAppearance}>
      <html lang="en" className={`${playfair.variable} ${roboto.variable}`}>
        <body className="min-h-screen flex flex-col font-sans">
          {/* SVG <defs> for the liquid-glass displacement filters. Mounted
              once near the root so any <LiquidGlass> in the tree can
              reference url(#lg-glass-subtle) etc. by id. Component is
              client-only and renders nothing visible. */}
          <LiquidGlassDefs />
          <Nav />
          {/* --nav-clearance reserves space for the floating-pill bottom
              nav: 72px pill + 24px bottom offset + 16px breathing room,
              plus the home-indicator inset on notched devices. Was a flat
              pb-28 (112px), which is what --nav-clearance still resolves to
              when the inset is zero. Nav stays visible on /scan too (the
              camera caps at the same token), and the padding is universal
              so every page has identical clearance. */}
          <main className="flex-1" style={{ paddingBottom: "var(--nav-clearance)" }}>
            {/* PageTransition wraps every route so non-tab routes fade
                + slide in on navigation (iOS-app pattern). Tab-root
                switches stay instant. */}
            <PageTransition>{children}</PageTransition>
            {/* Sits inside <main> so the pb-28 bottom-nav clearance still
                applies below it. Makes /legal/* reachable from every route,
                which is what affiliate reviewers and App Store review check
                for, and carries the one-line FTC disclosure. */}
            <Footer />
          </main>
          <BottomNav />
          {/* PostHog — renders nothing unless NEXT_PUBLIC_POSTHOG_KEY is set. */}
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}

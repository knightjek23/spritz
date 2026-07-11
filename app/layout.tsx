import "@/lib/env"; // fail fast on missing env vars in production
import type { Metadata, Viewport } from "next";
import { Playfair_Display, Roboto } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Nav } from "@/components/nav";
import { BottomNav } from "@/components/bottom-nav";
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
};

export const viewport: Viewport = {
  themeColor: "#1F3F2E", // Emerald — matches the new brand color
  width: "device-width",
  initialScale: 1,
  // No maximumScale / userScalable lock: blocking pinch-zoom fails
  // WCAG 1.4.4 (Android respects the lock; low-vision users can't zoom).
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${playfair.variable} ${roboto.variable}`}>
        <body className="min-h-screen flex flex-col font-sans">
          {/* SVG <defs> for the liquid-glass displacement filters. Mounted
              once near the root so any <LiquidGlass> in the tree can
              reference url(#lg-glass-subtle) etc. by id. Component is
              client-only and renders nothing visible. */}
          <LiquidGlassDefs />
          <Nav />
          {/* pb-28 reserves space for the floating-pill bottom nav
              (72px tall + 24px bottom offset = 96px occupied). pb-28
              (112px) gives 16px breathing room above the pill. Nav
              stays visible on /scan too (camera caps at bottom-28),
              padding is universal so all pages have consistent clearance. */}
          <main className="flex-1 pb-28">
            {/* PageTransition wraps every route so non-tab routes fade
                + slide in on navigation (iOS-app pattern). Tab-root
                switches stay instant. */}
            <PageTransition>{children}</PageTransition>
          </main>
          <BottomNav />
          {/* PostHog — renders nothing unless NEXT_PUBLIC_POSTHOG_KEY is set. */}
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}

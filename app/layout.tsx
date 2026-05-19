import type { Metadata, Viewport } from "next";
import { Playfair_Display, Roboto } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Nav } from "@/components/nav";
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
  title: "Spritz — know what you're wearing",
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
    title: "Spritz — know what you're wearing",
    description:
      "The fragrance encyclopedia. Scan any bottle to read its full story — notes, perfumer, longevity, how to wear it.",
    siteName: "Spritz",
    type: "website",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Spritz" }],
  },
  twitter: {
    card: "summary",
    title: "Spritz — know what you're wearing",
    description: "The fragrance encyclopedia, in your pocket.",
    images: ["/icon-512.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#1F3F2E", // Emerald — matches the new brand color
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${playfair.variable} ${roboto.variable}`}>
        <body className="min-h-screen flex flex-col font-sans">
          <Nav />
          <main className="flex-1">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}

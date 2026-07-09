// Metadata for the client-component welcome/onboarding page. Post-signup
// flow — noindex.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Welcome",
  robots: { index: false },
};

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}

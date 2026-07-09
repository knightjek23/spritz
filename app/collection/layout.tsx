// Metadata for the client-component collection page. User-specific and
// thin for crawlers — noindex.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your shelf",
  robots: { index: false },
};

export default function CollectionLayout({ children }: { children: React.ReactNode }) {
  return children;
}

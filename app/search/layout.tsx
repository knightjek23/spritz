// Metadata for the client-component search page ("use client" pages can't
// export metadata, so it lives in this pass-through layout).

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search fragrances",
  description:
    "Search every fragrance in the Spritz library by name or house.",
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}

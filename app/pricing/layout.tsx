// Metadata for the client-component pricing page ("use client" pages can't
// export metadata, so it lives in this pass-through layout).

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Spritz is free to use. Pro adds AI dupes, community consensus, and unlimited scans.",
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}

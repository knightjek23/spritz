// Metadata for the client-component scan page ("use client" pages can't
// export metadata, so it lives in this pass-through layout).

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scan a bottle",
  description:
    "Point your camera at any fragrance bottle and get its full profile: notes, longevity, projection, and cheaper alternatives.",
};

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return children;
}

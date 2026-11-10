"use client";

// Fallback for "How did you hear about Spritz?": a bottom sheet after a
// signed-in person's first shelf add, for anyone who skipped /welcome (where
// the question is normally asked). Never shows once the question has been
// answered or skipped. Mounted once from app/layout.tsx; portaled to <body>
// because PageTransition's transform would otherwise capture position:fixed.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { acquisitionAsked, onShelfAdd } from "@/lib/acquisition";
import { AcquisitionQuestion } from "@/components/acquisition-question";

// Let the save confirmation land before the sheet comes up.
const OPEN_DELAY_MS = 900;

export function AcquisitionPrompt() {
  const { isLoaded, isSignedIn, user } = useUser();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    // /welcome asks the question itself, after its own shelf adds.
    if (pathname === "/welcome") return;
    let timer: number | null = null;
    const off = onShelfAdd(() => {
      if (acquisitionAsked(user) || timer !== null) return;
      timer = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
    });
    return () => {
      off();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [isLoaded, isSignedIn, user, pathname]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="How did you hear about Spritz?" data-no-longpress>
      <div className="absolute inset-0 bg-ink/45" aria-hidden />
      <div
        className="relative bg-cream px-6 pt-6 shadow-[0_-12px_40px_rgba(26,26,26,0.18)]"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 16px)" }}
      >
        <div className="mx-auto max-w-md">
          <AcquisitionQuestion where="shelf_add" onDone={() => setOpen(false)} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

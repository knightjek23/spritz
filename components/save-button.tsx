"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import type { CollectionStatus } from "@/lib/types";

export function SaveButton({
  fragranceId,
  status,
  label,
}: {
  fragranceId: string;
  status: CollectionStatus;
  label: string;
}) {
  const router = useRouter();
  const { isSignedIn } = useUser();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "cap" | "error">("idle");

  async function onClick() {
    if (!isSignedIn) {
      router.push("/sign-up");
      return;
    }
    setState("saving");
    const res = await fetch("/api/collection", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fragrance_id: fragranceId, status }),
    });
    if (res.ok) setState("saved");
    else if (res.status === 402) setState("cap");
    else if (res.status === 409) setState("saved");
    else setState("error");
  }

  const text =
    state === "saving" ? "…" :
    state === "saved" ? "✓ " + label :
    state === "cap" ? "Upgrade" :
    state === "error" ? "Try again" :
    label;

  // Acid-yellow on saved state — matches the design system's "confirmation pop" use case.
  const className =
    state === "saved"
      ? "px-3 py-3 rounded-xl bg-brass text-ink text-center font-medium text-sm"
      : "px-3 py-3 rounded-xl border border-ink/15 text-center font-medium text-sm hover:bg-ink/5 transition disabled:opacity-60";

  return (
    <button
      onClick={onClick}
      disabled={state === "saving" || state === "saved"}
      className={className}
    >
      {text}
    </button>
  );
}

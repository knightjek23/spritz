// Locked state for whole pages behind Pro (the perfumer index and detail
// pages). Server component: rendered instead of the content, so locked
// data never reaches the browser at all. Matches the inline upsell used by
// KnownConsensus.

import Link from "next/link";
import { TrialCta } from "@/components/trial-cta";
import { SignedOut } from "@clerk/nextjs";

export function ProLocked({ body }: { body: string }) {
  return (
    <section className="mb-10">
      <p className="text-sm text-slate mb-4 leading-relaxed">{body}</p>
      <div className="flex flex-col items-start gap-3">
        <TrialCta />
        <SignedOut>
          <Link
            href="/sign-in"
            className="text-sm text-emerald underline underline-offset-4 hover:text-emerald/80"
          >
            Already Pro? Sign in
          </Link>
        </SignedOut>
      </div>
    </section>
  );
}

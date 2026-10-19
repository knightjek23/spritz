// Step 2b of the native OAuth round trip. Runs in the SYSTEM BROWSER.
// The work is in native-auth-go.tsx (client). This wrapper exists because
// useSearchParams() needs a Suspense boundary above it or Next 14 refuses
// to prerender the route.

import { Suspense } from "react";
import { SpritzLoader } from "@/components/spritz-loader";
import { NativeAuthGo } from "./native-auth-go";

export const dynamic = "force-dynamic";

export default function NativeAuthGoPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[80vh] flex items-center justify-center px-6">
          <SpritzLoader size={72} label="Opening sign-in" showLabel />
        </div>
      }
    >
      <NativeAuthGo />
    </Suspense>
  );
}

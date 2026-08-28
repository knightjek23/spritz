// Sign-up page. Routes new accounts to /welcome (first-run onboarding)
// rather than the home page. /welcome self-skips for users who already
// have a populated collection, so it's safe even if a returning user
// lands here for a second time.
//
// ClerkLoading/ClerkLoaded covers the cold-cache gap before Clerk's
// widget mounts with the Spritz mark — see the sign-in page.

import { ClerkLoaded, ClerkLoading, SignUp } from "@clerk/nextjs";
import { spritzClerkAppearance } from "@/lib/clerk-appearance";
import { SpritzLoader } from "@/components/spritz-loader";

export default function SignUpPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6">
      <ClerkLoading>
        <SpritzLoader size={72} label="Preparing sign-up" showLabel />
      </ClerkLoading>
      <ClerkLoaded>
        <SignUp
          appearance={spritzClerkAppearance}
          signInUrl="/sign-in"
          forceRedirectUrl="/welcome"
          fallbackRedirectUrl="/welcome"
        />
      </ClerkLoaded>
    </div>
  );
}

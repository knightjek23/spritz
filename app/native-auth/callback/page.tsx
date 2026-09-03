// Step 3 of the native OAuth round trip. Runs in the SYSTEM BROWSER.
//
// Clerk's control component finishes the OAuth leg here: it swaps the
// provider's code for a Clerk session, and if the Google account has no
// Spritz user yet it transfers the attempt to sign-up and completes that
// instead. Both force URLs point at /native-auth/complete so a brand-new
// user ends up in the same place as a returning one, rather than at the
// web app's /welcome page inside a browser they are about to leave.

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { SpritzLoader } from "@/components/spritz-loader";

const COMPLETE_PATH = "/native-auth/complete";

export default function NativeAuthCallbackPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6">
      <SpritzLoader size={72} label="Finishing sign-in" showLabel />
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl={COMPLETE_PATH}
        signUpForceRedirectUrl={COMPLETE_PATH}
      />
    </div>
  );
}

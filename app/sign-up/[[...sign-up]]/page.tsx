// Sign-up page. Routes new accounts to /welcome (first-run onboarding)
// rather than the home page. /welcome self-skips for users who already
// have a populated collection, so it's safe even if a returning user
// lands here for a second time.

import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6">
      <SignUp
        signInUrl="/sign-in"
        forceRedirectUrl="/welcome"
        fallbackRedirectUrl="/welcome"
      />
    </div>
  );
}

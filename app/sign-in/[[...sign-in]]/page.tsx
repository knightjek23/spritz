// Sign-in page.
//
// Clerk's widget is a client bundle that has to download and mount before
// anything appears, which on a cold cache is a second or two of empty
// page. ClerkLoading/ClerkLoaded covers that gap with the Spritz mark so
// the wait belongs to the app instead of reading as a broken route.

//
// Inside the native shell, Clerk's own social buttons are hidden (they run
// OAuth in the webview, which Google refuses) and <NativeSocialButtons>
// takes their place above the form, routing through the system browser.
// On the web that component renders nothing and the page is unchanged.

import { ClerkLoaded, ClerkLoading, SignIn } from "@clerk/nextjs";
import { spritzClerkAppearance } from "@/lib/clerk-appearance";
import { SpritzLoader } from "@/components/spritz-loader";
import { NativeSocialButtons } from "@/components/native-social-buttons";

export default function SignInPage() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-6">
      <ClerkLoading>
        <SpritzLoader size={72} label="Preparing sign-in" showLabel />
      </ClerkLoading>
      <ClerkLoaded>
        <NativeSocialButtons mode="sign-in" />
        <SignIn appearance={spritzClerkAppearance} />
      </ClerkLoaded>
    </div>
  );
}

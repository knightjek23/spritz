import { SignIn } from "@clerk/nextjs";
import { spritzClerkAppearance } from "@/lib/clerk-appearance";

export default function SignInPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6">
      <SignIn appearance={spritzClerkAppearance} />
    </div>
  );
}

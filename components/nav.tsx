import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { NavSearch } from "./nav-search";

export function Nav() {
  return (
    <>
      <nav className="border-b border-ink/10 bg-cream/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-md px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-display text-2xl tracking-tight text-ink">
            spritz
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <SignedIn>
              <Link href="/collection" className="text-slate hover:text-ink">
                Shelf
              </Link>
              <Link href="/account" className="text-slate hover:text-ink">
                Account
              </Link>
              {/* Clerk's UserButton stays for quick sign-out + identity
                  (email/password) management — those live in Clerk's hosted
                  surface, not in our /account page. */}
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
            <SignedOut>
              <Link href="/pricing" className="text-slate hover:text-ink">
                Pro
              </Link>
              <Link
                href="/sign-in"
                className="text-emerald font-medium hover:underline underline-offset-4"
              >
                Sign in
              </Link>
            </SignedOut>
          </div>
        </div>
      </nav>
      {/* Second row: typeahead search, sticks below the nav.
          Self-hides on /search so we don't double up. */}
      <NavSearch />
    </>
  );
}

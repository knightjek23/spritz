import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { NavSearch } from "./nav-search";
import { LiquidGlass } from "./liquid-glass/LiquidGlass";

export function Nav() {
  return (
    <>
      {/* Liquid-glass top nav. Preset 'nav' = radius 0 (full-width edge to
          edge), 2px backdrop blur, subtle displacement filter, rim
          highlight. A faint cream tint keeps text legible against scrolled
          page content underneath. */}
      <LiquidGlass
        as="nav"
        preset="nav"
        // Override the preset's filter + blur for mobile visibility. The
        // subtle preset (scale 40) was nearly invisible on cream; the
        // custom lg-glass-nav (scale 70, tighter noise) gives a visible
        // wobble without smearing the bar text. Blur bumped to 4px to
        // soften the displacement edges.
        filter="lg-glass-nav"
        blur={4}
        // Tint dropped from 0.55 → 0.35 so more of what's underneath
        // shows through and the refraction is actually visible.
        tint="rgba(250,246,237,0.35)"
        // Cream-toned rim matches the tint RGB so the glass edge reads
        // as part of the bar instead of a stark white highlight against
        // the warmer page color.
        edgeColor="250, 246, 237"
        // Inline positioning so sticky always wins — Tailwind's `sticky
        // top-0` was getting clobbered by something in the new flex
        // layout + body height stack. Inline style is the surest path.
        style={{ position: "sticky", top: 0 }}
        className="border-b border-ink/10 z-10"
      >
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
      </LiquidGlass>
      {/* Second row: typeahead search, sticks below the nav.
          Self-hides on /search so we don't double up. */}
      <NavSearch />
    </>
  );
}

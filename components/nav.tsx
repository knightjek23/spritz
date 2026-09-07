import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { NavRow } from "./nav-row";
import { LiquidGlass } from "./liquid-glass/LiquidGlass";
import { NavBrand } from "./nav-brand";
import { NavScrollWrapper } from "./nav-scroll-wrapper";

export function Nav() {
  return (
    // NavScrollWrapper handles sticky positioning for the top nav and
    // hides it when the user scrolls down, restoring it the instant they
    // scroll back up. Transform-only animation, GPU-composited, 280ms ease-out-quart.
    <NavScrollWrapper>
      {/* Liquid-glass top nav. Preset 'nav' = radius 0 (full-width edge to
          edge), 2px backdrop blur, subtle displacement filter, rim
          highlight. A faint cream tint keeps text legible against scrolled
          page content underneath. Sticky positioning moved to the parent
          wrapper so scroll direction can drive the show/hide transform on
          the whole nav strip. */}
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
        // No drop shadow on the top nav — the default lift felt too
        // heavy under the LiquidGlass rim for the sleeker aesthetic.
        // Bottom nav still uses the default shadow for its floating pill.
        shadow={false}
        className="border-b border-ink/10"
      >
        {/* NavRow (client) owns the expanding-search state and the row
            layout; NavBrand and the account cluster are passed in so this
            file stays a Server Component. */}
        <NavRow
          brand={<NavBrand />}
          trailing={
            <div className="flex items-center text-sm">
              <SignedIn>
                {/* Clerk's UserButton stays for quick sign-out + identity
                    (email/password) management — those live in Clerk's
                    hosted surface, not in our /account page. */}
                <UserButton afterSignOutUrl="/" />
              </SignedIn>
              <SignedOut>
                <Link
                  href="/sign-in"
                  className="text-emerald font-medium hover:underline underline-offset-4"
                >
                  Sign in
                </Link>
              </SignedOut>
            </div>
          }
        />
      </LiquidGlass>
    </NavScrollWrapper>
  );
}

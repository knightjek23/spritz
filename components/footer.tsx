// Site footer. Exists mainly to make the legal pages reachable from every
// route, which is what affiliate network reviewers and App Store review look
// for. Kept deliberately quiet so it doesn't compete with the bottom nav.
//
// The affiliate disclosure link is the one that has to be here: the FTC
// expects a material-connection disclosure to be findable, not buried.

import Link from "next/link";

const YEAR_STARTED = 2026;

export function Footer() {
  return (
    <footer className="mt-16 px-6 pt-8 border-t border-ink/10">
      <nav
        aria-label="Legal and support"
        className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4"
      >
        <Link
          href="/legal/privacy"
          className="font-mono text-[10px] uppercase tracking-widest text-slate hover:text-ink transition-colors"
        >
          Privacy
        </Link>
        <Link
          href="/legal/terms"
          className="font-mono text-[10px] uppercase tracking-widest text-slate hover:text-ink transition-colors"
        >
          Terms
        </Link>
        <Link
          href="/legal/affiliate-disclosure"
          className="font-mono text-[10px] uppercase tracking-widest text-slate hover:text-ink transition-colors"
        >
          Affiliate Disclosure
        </Link>
        {/* Support has to be reachable from every route: Apple checks the
            listing's Support URL resolves, and Play expects the deletion
            page (linked from Support) to be publicly findable. */}
        <Link
          href="/support"
          className="font-mono text-[10px] uppercase tracking-widest text-slate hover:text-ink transition-colors"
        >
          Support
        </Link>
      </nav>

      {/* Short-form FTC disclosure. The full page is linked above, but a
          one-line notice on every page is the safer reading of "clear and
          conspicuous" now that buy links are live. */}
      <p className="text-xs text-slate leading-relaxed mb-2">
        Some retailer links earn us a commission at no extra cost to you.
      </p>
      <p className="text-xs text-slate leading-relaxed">
        Fragrance and brand names are the property of their respective owners.
        Spritz is an independent reference and is not affiliated with any
        fragrance house or retailer.
      </p>

      <p className="font-mono text-[10px] uppercase tracking-widest text-slate mt-4">
        &copy; {YEAR_STARTED} Spritz
      </p>
    </footer>
  );
}

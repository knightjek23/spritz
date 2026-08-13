import type { Metadata } from "next";
import { LEGAL_LAST_UPDATED, LEGAL_CONTACT } from "../constants";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The agreement between you and Spritz.",
};

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="font-mono text-[10px] uppercase tracking-widest text-slate">
        Last updated {LEGAL_LAST_UPDATED}
      </p>

      <p>
        These terms are the agreement between you and Spritz. By using the app
        you accept them. We have tried to write them in plain English.
      </p>

      <h2>What Spritz is</h2>
      <p>
        Spritz is a reference library for fragrances. You can scan or search for
        a bottle and read about its notes, its perfumer, how it performs, and
        how people tend to wear it. You can save fragrances to a personal shelf.
      </p>

      <h2>Your account</h2>
      <p>
        You need an account to save a collection. You are responsible for what
        happens under your account and for keeping your sign-in secure. You must
        be at least 13 years old. Do not share your account or use someone
        else&apos;s.
      </p>

      <h2>Free and Pro</h2>
      <p>
        Spritz has a free tier and a paid Pro tier. Pro is available monthly,
        annually, or as a one-time lifetime purchase.
      </p>
      <ul>
        <li>
          <strong>Monthly</strong> includes a 7-day free trial. If you do not
          cancel before the trial ends, the monthly price is charged and recurs
          each month until you cancel.
        </li>
        <li>
          <strong>Annual</strong> is billed in full at purchase and renews
          yearly until cancelled. It does not include a trial.
        </li>
        <li>
          <strong>Lifetime</strong> is a single payment with no renewal.
        </li>
      </ul>
      <p>
        Payments are handled by Stripe. You can cancel any time from your
        account page, and you keep access through the end of the period you have
        already paid for. Prices can change, but never for a billing period you
        have already paid.
      </p>

      <h2>Refunds</h2>
      <p>
        If Pro is not what you expected, email us within 14 days of being
        charged and we will refund you. If you bought through the Apple App
        Store or Google Play, their refund process applies instead of ours,
        because they process the payment.
      </p>

      <h2>Fair use of scanning</h2>
      <p>
        Scanning is described as unlimited and is intended to be. We reserve the
        right to rate-limit or suspend accounts making automated or abusive
        volumes of requests, because each scan costs us money to process.
      </p>

      <h2>Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          Scrape, crawl, bulk-download, or systematically copy the library
        </li>
        <li>
          Resell, redistribute, or republish our content as your own product
        </li>
        <li>
          Reverse engineer the service, or try to access accounts or data that
          are not yours
        </li>
        <li>
          Upload anything unlawful, or anything you do not have the right to
          upload
        </li>
        <li>Interfere with the service or the infrastructure behind it</li>
      </ul>

      <h2>Content and ownership</h2>
      <p>
        The Spritz name, design, editorial writing, and the organisation of the
        library belong to us. You get a personal, non-transferable licence to
        use the app. You do not get ownership of anything in it.
      </p>
      <p>
        Fragrance names, brand names, and bottle designs belong to their
        respective owners and appear here for identification and reference.
        Spritz is not affiliated with, endorsed by, or sponsored by any
        fragrance house or retailer.
      </p>
      <p>
        Anything you submit stays yours. By submitting it you give us permission
        to store and display it in order to run the service.
      </p>

      <h2>Accuracy</h2>
      <p>
        We work hard to get fragrance information right, but we cannot guarantee
        it. Notes, performance ratings, release years, perfumer credits and
        community takes are compiled from multiple sources and some of it is
        generated or estimated by AI. Formulations also change over time without
        announcement, so what is in the bottle you are holding may differ from
        what is described here.
      </p>
      <p>
        Treat Spritz as a well-researched reference, not an authority. Do not
        rely on it for allergy, ingredient safety, or medical decisions. If you
        react to fragrances, check the ingredient list on the actual product and
        talk to a doctor.
      </p>
      <p>
        Prices and availability shown for retailers come from third-party feeds
        and are frequently out of date. Always confirm on the retailer&apos;s own
        site.
      </p>

      <h2>Affiliate links</h2>
      <p>
        Some retailer links earn us a commission at no extra cost to you. See
        our <a href="/legal/affiliate-disclosure">affiliate disclosure</a>. We
        are not responsible for anything that happens on a retailer&apos;s site,
        including their prices, their shipping, or their products.
      </p>

      <h2>Disclaimer and liability</h2>
      <p>
        Spritz is provided &quot;as is,&quot; without warranties of any kind. We
        do not promise it will be uninterrupted or error-free.
      </p>
      <p>
        To the maximum extent permitted by law, our total liability to you for
        any claim relating to the service is limited to the amount you paid us
        in the 12 months before the claim. We are not liable for indirect or
        consequential damages. Some jurisdictions do not allow these
        limitations, in which case they apply to you only as far as the law
        permits.
      </p>

      <h2>Ending things</h2>
      <p>
        You can delete your account whenever you like. We may suspend or
        terminate an account that breaks these terms. If we terminate your
        account without cause while you have paid time remaining, we will refund
        the unused portion.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. The date at the top will change, and material
        changes will be announced in the app before they take effect. Continuing
        to use Spritz after that means you accept the new version.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of the State of [STATE], United
        States, without regard to conflict of law rules.
      </p>

      <h2>Contact</h2>
      <p>
        Reach us at <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.
      </p>
    </>
  );
}

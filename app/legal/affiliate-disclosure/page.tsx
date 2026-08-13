import type { Metadata } from "next";
import { LEGAL_LAST_UPDATED, LEGAL_CONTACT } from "../constants";

export const metadata: Metadata = {
  title: "Affiliate Disclosure",
  description:
    "Spritz earns a commission on some retailer links. Here is exactly how that works.",
};

export default function AffiliateDisclosurePage() {
  return (
    <>
      <h1>Affiliate Disclosure</h1>
      <p className="font-mono text-[10px] uppercase tracking-widest text-slate">
        Last updated {LEGAL_LAST_UPDATED}
      </p>

      <p>
        <strong>
          Some links on Spritz are affiliate links. If you buy something after
          following one, we may earn a commission. It costs you nothing extra.
        </strong>
      </p>

      <h2>How it works</h2>
      <p>
        When a fragrance page shows a link to buy a bottle, that link sometimes
        carries a tracking code identifying us as the referrer. If you complete
        a purchase, the retailer pays us a small percentage. The price you pay
        is exactly the same as it would be if you went to the retailer directly.
      </p>
      <p>
        We work with affiliate networks including Awin, CJ Affiliate, Rakuten
        Advertising and FlexOffers, and with the retailers on them.
      </p>

      <h2>What it does not affect</h2>
      <p>
        This is the part that matters, so we will be specific.
      </p>
      <ul>
        <li>
          <strong>We do not rank fragrances by commission.</strong> Similar
          fragrances, trending sections, and search results are ordered by
          relevance and popularity. Never by what pays us more.
        </li>
        <li>
          <strong>We do not write reviews to sell things.</strong> Notes,
          performance ratings, and community takes describe the fragrance as it
          is, including when that means saying it is not worth the money.
        </li>
        <li>
          <strong>We do not add fragrances to the library because they are
          profitable</strong>, or leave them out because they are not.
        </li>
      </ul>
      <p>
        Spritz is built to tell you about the bottle you are holding. If we ever
        have to choose between an accurate answer and a profitable one, we will
        give you the accurate one. A library nobody trusts is worthless, and
        that is a business argument as much as a principled one.
      </p>

      <h2>Product images and information</h2>
      <p>
        Product images and details on fragrance pages may be supplied by
        retailers through their affiliate product feeds, and remain the property
        of those retailers or the brands that produced them. Prices and
        availability come from the same feeds and can be out of date. Always
        check the retailer&apos;s own page before buying.
      </p>

      <h2>Why we are telling you</h2>
      <p>
        The US Federal Trade Commission requires clear disclosure of material
        connections between a publisher and the products it links to. This page
        is that disclosure. We would rather over-explain it than have you find
        out later and wonder what else we left out.
      </p>

      <h2>Questions</h2>
      <p>
        Ask us anything about this at{" "}
        <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.
      </p>
    </>
  );
}

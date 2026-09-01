import type { Metadata } from "next";
import { LEGAL_LAST_UPDATED, LEGAL_CONTACT } from "../constants";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Spritz collects, why, and how to get it deleted.",
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="font-mono text-[10px] uppercase tracking-widest text-slate">
        Last updated {LEGAL_LAST_UPDATED}
      </p>

      <p>
        Spritz is a fragrance library. You scan or search for a bottle and we
        tell you what is in it. This page explains what we collect while you do
        that, why we collect it, and how to get rid of it.
      </p>

      <h2>What we collect</h2>
      <p>
        <strong>Your account.</strong> When you sign up we store your email
        address and, if you sign in with Google, the basic profile information
        Google returns. Authentication is handled by Clerk. We never see or
        store your password.
      </p>
      <p>
        <strong>Photos you scan.</strong> When you scan a bottle, the photo is
        sent to an AI vision service to read the label and to an image
        embedding service to compare the bottle&apos;s shape and color against
        our catalog. If neither can identify the bottle and you are signed in,
        we may send the photo to a visual search provider (Google Lens via
        SerpApi) to look it up on the web. We keep the photo so we can debug
        scans that returned the wrong answer and improve how scanning works.
        Stored photos are private and are not shown to other users. We do not
        use your photos to train any model, and we do not share them with
        anyone other than the providers processing that request. You can ask us
        to delete your photos at any time, at{" "}
        <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.
      </p>
      <p>
        <strong>Photos used in the library.</strong> Some bottles in our library
        have no photo. If one of your scans is a clear shot of the bottle, we
        may review it and use it as that fragrance&apos;s library image. Only
        the bottle is relevant to us, so we do not use a photo that shows a
        person, a face, or anything else identifying, and a photo we use is
        never labeled with your name or account. If you would rather we did
        not, email{" "}
        <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a> and we will
        remove it and exclude your scans from this.
      </p>
      <p>
        <strong>Your collection.</strong> The fragrances you mark as owned,
        tried, or wishlisted, so your shelf is there when you come back.
      </p>
      <p>
        <strong>Usage data.</strong> Which pages you open and which features you
        use, via PostHog, so we know what to improve. This is tied to your
        account if you are signed in.
      </p>
      <p>
        <strong>Payment information.</strong> If you subscribe, payment is
        processed by Stripe. Stripe handles your card details directly. We never
        receive or store your card number. We keep a record of your plan and
        billing status so we know what you have access to.
      </p>

      <h2>What we do with it</h2>
      <p>
        We use this data to run the app: identify the bottle you scanned, keep
        your collection, apply your subscription, answer support requests, and
        understand which parts of the product are working. That is the entire
        list.
      </p>
      <p>
        <strong>We do not sell your personal information.</strong> We do not
        share it with advertisers, and we do not build advertising profiles.
      </p>

      <h2>Who we share it with</h2>
      <p>
        Only the services that make the app work, and only what each one needs:
      </p>
      <ul>
        <li>
          <strong>Clerk</strong> — authentication and account management
        </li>
        <li>
          <strong>Supabase</strong> — database and file storage
        </li>
        <li>
          <strong>Vercel</strong> — hosting and delivery
        </li>
        <li>
          <strong>OpenAI and Google Cloud Vision</strong> — reading the label in
          a scanned photo
        </li>
        <li>
          <strong>Voyage AI</strong> — comparing a scanned bottle&apos;s shape and
          color against our catalog
        </li>
        <li>
          <strong>SerpApi (Google Lens)</strong> — web image lookup when a
          bottle can&apos;t be identified from our catalog
        </li>
        <li>
          <strong>Stripe</strong> — payment processing
        </li>
        <li>
          <strong>PostHog</strong> — product analytics
        </li>
      </ul>
      <p>
        We may also disclose information if we are legally required to, or to
        protect the safety and rights of our users.
      </p>

      <h2>Affiliate links</h2>
      <p>
        Some links to retailers are affiliate links, which means we may earn a
        commission if you buy something. Following one of those links takes you
        to the retailer&apos;s own site, where their privacy policy applies, not
        ours. See our{" "}
        <a href="/legal/affiliate-disclosure">affiliate disclosure</a> for the
        full explanation.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Account and collection data is kept while your account is open. Scan
        photos are kept so we can keep improving scanning, and you can ask us
        to delete yours at any time. Analytics data is retained in aggregate.
        If you delete your account, we delete your personal data, including
        your scan photos, within 30 days, other than anything we are required
        to keep for tax or legal reasons, and any photo already reviewed into
        the library.
      </p>

      <h2>Your rights</h2>
      <p>
        Wherever you live, you can ask us to show you what we hold about you,
        correct it, delete it, or export it. If you are in the EU or UK, the
        GDPR gives you these rights explicitly, along with the right to object
        to processing and to complain to your local data protection authority.
        If you are in California, the CCPA gives you equivalent rights, and we
        confirm again that we do not sell personal information.
      </p>
      <p>
        To exercise any of these, email{" "}
        <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>, or see{" "}
        <a href="/support/delete-account">Delete your account</a> for what
        deletion covers and how long it takes.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit and at rest by our infrastructure
        providers. No system is perfectly secure, but we keep the amount of
        personal data we hold deliberately small, which is the most effective
        protection available.
      </p>

      <h2>Children</h2>
      <p>
        Spritz is not intended for anyone under 13, and we do not knowingly
        collect information from children. If you believe a child has given us
        personal data, email us and we will delete it.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this policy we will update the date at the top. Material
        changes will be announced in the app before they take effect.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about any of this go to{" "}
        <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.
      </p>
    </>
  );
}

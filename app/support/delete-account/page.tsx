import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_CONTACT, LEGAL_LAST_UPDATED } from "../../legal/constants";

export const metadata: Metadata = {
  title: "Delete your account",
  description:
    "How to delete your Spritz account and everything attached to it, what gets removed, what is kept, and how long it takes.",
};

export default function DeleteAccountPage() {
  return (
    <>
      <h1>Delete your account</h1>
      <p className="font-mono text-[10px] uppercase tracking-widest text-slate">
        Last updated {LEGAL_LAST_UPDATED}
      </p>

      <p>
        You can delete your Spritz account and everything attached to it at any
        time. You do not need the app installed to ask, and you do not need to
        give a reason.
      </p>

      <h2>How to request it</h2>
      <p>
        Email{" "}
        <a
          href={`mailto:${LEGAL_CONTACT}?subject=Delete%20my%20Spritz%20account`}
        >
          {LEGAL_CONTACT}
        </a>{" "}
        from the address on your account, with the subject{" "}
        <strong>Delete my Spritz account</strong>. Sending from the account
        address is how we confirm the request is really yours. If you signed up
        with Google, use that Google address.
      </p>
      <p>
        We will confirm by email once it is done. If we cannot match the address
        to an account we will tell you rather than quietly doing nothing.
      </p>

      <h2>What gets deleted</h2>
      <ul>
        <li>Your account and sign-in credentials</li>
        <li>Your email address and profile information</li>
        <li>
          Your collection, meaning everything you saved as Own, Tried, or
          Wishlist
        </li>
        <li>Every photo you have ever scanned</li>
        <li>Any reactions or notes you left on a fragrance</li>
        <li>
          The link between you and everything else. Your scan and browsing
          records are stripped of any connection to your account and kept only
          as anonymous totals, which is how we measure whether scanning is
          getting more accurate.
        </li>
      </ul>
      <p>
        This is a deletion, not a deactivation. Your account is not put on hold
        and cannot be recovered afterward, so export anything you want to keep
        first.
      </p>

      <h2>What we keep, and why</h2>
      <ul>
        <li>
          <strong>Anonymous, aggregated usage data.</strong> Counts and totals
          that are no longer connected to you or to any individual account.
        </li>
        <li>
          <strong>Billing records</strong>, where tax and accounting law
          requires us to hold them for a set period.
        </li>
        <li>
          <strong>A bottle photo already reviewed into the library.</strong> If
          one of your scans was used as a fragrance&apos;s catalog image, it
          stays, because it is part of the library rather than part of your
          account. It is never labeled with your name or account. If you would
          rather it did not stay, say so in your email and we will remove it.
        </li>
      </ul>

      <h2>How long it takes</h2>
      <p>
        Your account stops working straight away. Your personal data is removed
        from our systems within 30 days, and from routine backups within a
        further 30 days as those backups age out.
      </p>

      <h2>Cancel your subscription separately</h2>
      <p>
        <strong>
          Deleting your account does not cancel a paid subscription, and we
          cannot cancel it for you.
        </strong>{" "}
        If you subscribed to Pro inside the iPhone app, cancel it in your Apple
        subscription settings. If you subscribed inside the Android app, cancel
        it in your Google Play subscription settings. Both bill you directly and
        will keep billing you until you cancel there, whatever happens to your
        Spritz account. If you subscribed on the web, tell us in the same email
        and we will cancel it as part of the deletion.
      </p>

      <h2>If you only want part of it gone</h2>
      <p>
        You do not have to delete everything to get rid of something. Email us
        and ask us to delete just your scan photos, just your collection, or
        just a single item, and we will do that instead and leave the rest of
        your account alone.
      </p>

      <p>
        <Link href="/support">Support</Link> ·{" "}
        <Link href="/legal/privacy">Privacy Policy</Link>
      </p>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import {
  LEGAL_CONTACT,
  LEGAL_LAST_UPDATED,
  DELETE_ACCOUNT_PATH,
} from "../legal/constants";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Get help with Spritz. Scanning problems, your collection, Pro billing, missing fragrances, and how to reach us.",
};

export default function SupportPage() {
  return (
    <>
      <h1>Support</h1>
      <p className="font-mono text-[10px] uppercase tracking-widest text-slate">
        Last updated {LEGAL_LAST_UPDATED}
      </p>

      <p>
        Spritz is made by one person, so support comes straight to us. Email{" "}
        <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a> and we usually
        reply within two business days. If something is broken, tell us what
        you were doing when it happened and we will get to it faster.
      </p>

      <h2>A scan came back wrong, or found nothing</h2>
      <p>
        Scanning reads the label, so it works best on a bottle that is well lit,
        held steady, and turned so the brand and name are both visible. Glass
        reflections and dim rooms are what usually break it.
      </p>
      <p>
        If the match is wrong, tap <strong>See other close matches</strong> on
        the result to pick the right one. If nothing matched at all, search the
        name instead. Some bottles, especially indie, vintage, and very new
        releases, are not in the library yet.
      </p>

      <h2>A fragrance is missing, or its details are wrong</h2>
      <p>
        Email us the house and the name and we will add it. The same goes for a
        fragrance whose notes, year, perfumer, or bottle photo look wrong. The
        library is built from public information and it does get things wrong.
        Corrections are welcome and we would rather hear about them.
      </p>

      <h2>Your collection</h2>
      <p>
        Anything you save to Own, Tried, or Wishlist is tied to your account, so
        it follows you to any device you sign in on. If your shelf looks empty
        after signing in, check that you are signed in with the same method you
        used originally, since signing in with Google and with email creates two
        separate accounts.
      </p>

      <h2>Pro and billing</h2>
      <p>
        Pro unlocks perfumer credits, full house histories, every note&apos;s
        flavor profile, the community take, on-demand dupes, and an unlimited
        collection.
      </p>
      <p>
        <strong>Where you subscribed is where you cancel.</strong> If you
        subscribed inside the iPhone or Android app, manage or cancel it in your
        App Store or Google Play subscription settings, since we cannot cancel
        those for you. If you subscribed on the web, you can manage it from your
        account page.
      </p>
      <p>
        If you paid and Pro did not unlock, give it a minute and reopen the app.
        If it still has not, email us with the address on your account and we
        will sort it out.
      </p>

      <h2>Your data and your account</h2>
      <p>
        What we collect and why is in the{" "}
        <Link href="/legal/privacy">Privacy Policy</Link>. You can ask us to
        show you what we hold, correct it, export it, or delete it, at any time
        and wherever you live.
      </p>
      <p>
        To delete your account and everything attached to it, see{" "}
        <Link href={DELETE_ACCOUNT_PATH}>Delete your account</Link>.
      </p>

      <h2>Everything else</h2>
      <p>
        Bugs, feature requests, business enquiries, or a fragrance you think we
        have badly misrepresented, all to the same place:{" "}
        <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.
      </p>
      <p>
        <Link href="/legal/privacy">Privacy Policy</Link> ·{" "}
        <Link href="/legal/terms">Terms</Link> ·{" "}
        <Link href="/legal/affiliate-disclosure">Affiliate Disclosure</Link>
      </p>
    </>
  );
}

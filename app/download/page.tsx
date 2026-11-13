import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  APPLE_APP_ID,
  APPLE_PROVIDER_TOKEN,
  appStoreUrl,
  cleanSource,
  playStoreUrl,
} from "@/lib/store-links";
import { StoreButton } from "./store-button";

// Landing page for paid ads: spritzofficial.app/download?ct=meta_t1&utm_...
// Design approved 2026-11-12 (canvas "Spritz /get landing page").
//
// Unlike /get, this page never redirects. Ad platforms review the landing
// page, and Meta treats an automatic bounce to a store as a broken or
// cloaked destination. People tap a button instead.
//
// ?ct= names the App Store Connect campaign (and the Play referrer source),
// so each ad can carry its own: ct=meta_t1, ct=reddit_t1, ...
// PostHog's automatic pageview records the utm_* params.
//
// The site nav, bottom nav and footer are hidden by the data-landing-page
// rule in globals.css, so the only thing to do here is install.

type SearchParams = { ct?: string | string[] };

function campaign(searchParams: SearchParams): string {
  const raw = Array.isArray(searchParams.ct) ? searchParams.ct[0] : searchParams.ct;
  const ct = cleanSource(raw);
  return ct === "direct" ? "download_page" : ct;
}

export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Metadata {
  const ct = campaign(searchParams);
  const affiliate = APPLE_PROVIDER_TOKEN ? `, affiliate-data=ct=${ct}&pt=${APPLE_PROVIDER_TOKEN}` : "";
  return {
    title: "Get the app",
    description:
      "The notes, perfumer, longevity and best season for every fragrance. Free on iPhone and Android.",
    robots: { index: false, follow: true },
    // Apple's Smart App Banner. Safari only: Instagram's in-app browser
    // ignores it, which is why the buttons below carry the page.
    other: { "apple-itunes-app": `app-id=${APPLE_APP_ID}${affiliate}` },
  };
}

const STEPS = [
  {
    title: "Search or scan any fragrance",
    body: "Type a name, or point your camera at the bottle.",
  },
  {
    title: "See what's in it",
    body: "The notes pyramid, who made it, how long it lasts and when to wear it.",
  },
  {
    title: "Save it to your shelf",
    body: "Keep track of what you own, what you've tried and what's next.",
  },
];

export default function DownloadPage({ searchParams }: { searchParams: SearchParams }) {
  const ct = campaign(searchParams);
  const ios = appStoreUrl(ct);
  const android = playStoreUrl(ct, { medium: "paid", campaign: "download_page" });

  return (
    <div data-landing-page className="mx-auto w-full max-w-md bg-cream text-ink">
      <header className="flex h-14 items-center justify-between px-6">
        <span className="font-display text-2xl tracking-[-0.01em]">spritz</span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate">
          Free on iPhone
        </span>
      </header>

      <section className="px-6 pt-4">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          Every fragrance, broken down
        </p>
        <h1 className="mt-4 font-display text-5xl leading-[0.95]">Know what you&apos;re wearing.</h1>
        <p className="mt-4 text-body">
          The notes, perfumer, longevity and best season for every fragrance, from the bottles on
          your shelf to the ones on your wishlist.
        </p>
        <div className="mt-8">
          <StoreButton
            href={ios}
            store="ios"
            position="hero"
            ct={ct}
            className="flex h-[52px] w-full items-center justify-center bg-emerald font-medium tracking-wide text-cream transition hover:bg-emerald/90"
          >
            Download on the App Store
          </StoreButton>
          <p className="mt-2 text-center text-small text-slate">
            Free to scan and save. No card needed.
          </p>
        </div>
      </section>

      <section className="flex justify-center px-6 pt-12">
        <Image
          src="/download/aventus-detail.png"
          alt="Spritz fragrance page for Aventus showing your match score, scent family and notes"
          width={1206}
          height={2263}
          sizes="280px"
          priority
          className="h-auto w-[280px] border border-ink/15 bg-paper"
        />
      </section>

      <section className="px-6 pt-16">
        <h2 className="text-section">How it works</h2>
        <ol className="mt-6 flex flex-col gap-6">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex items-baseline gap-4">
              <span className="w-6 shrink-0 font-display text-xl text-emerald">{i + 1}</span>
              <div className="flex flex-col gap-1">
                <span className="font-medium">{step.title}</span>
                <span className="text-sm leading-normal text-slate">{step.body}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-6 mt-16 flex flex-col gap-4 bg-emerald px-6 py-8">
        <h2 className="text-2xl leading-tight text-cream">
          Your next bottle, without the guesswork.
        </h2>
        <StoreButton
          href={ios}
          store="ios"
          position="footer"
          ct={ct}
          className="flex h-[52px] w-full items-center justify-center bg-cream font-medium tracking-wide text-emerald transition hover:bg-cream/90"
        >
          Download on the App Store
        </StoreButton>
        <StoreButton
          href={android}
          store="android"
          position="footer"
          ct={ct}
          className="flex min-h-[44px] items-center self-center text-sm text-cream underline underline-offset-4"
        >
          On Android? Get it on Google Play
        </StoreButton>
      </section>

      <footer className="flex flex-wrap gap-4 px-6 pb-8 pt-12 font-mono text-[10px] uppercase tracking-widest text-slate">
        <Link href="/legal/privacy" className="inline-flex min-h-[44px] items-center hover:text-ink">
          Privacy
        </Link>
        <Link href="/legal/terms" className="inline-flex min-h-[44px] items-center hover:text-ink">
          Terms
        </Link>
        <span className="inline-flex min-h-[44px] items-center">spritzofficial.app</span>
      </footer>
    </div>
  );
}

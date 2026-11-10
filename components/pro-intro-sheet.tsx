"use client";

// Pro intro sheet (design approved 2026-10-26, modelled on the DashPass
// trial interstitial): a full-height cream panel that slides up the first
// time a non-Pro user opens the Library or Shelf tab, pitches the free
// week with six benefit rows (keep these in step with the pricing page's
// feature table; wear insights is on the pricing page only, since it has
// nothing to show until weeks of wear logs exist), carries the express-consent paragraph
// directly above the CTA (California ARL + App Store 3.1.2(c): billed
// amount in the same weight as the trial), and offers "Not now".
//
// When it shows (D39, 2026-11-09; rules and tests in lib/paywall-triggers.ts):
//   - on the navigation after someone's first fragrance page, once
//   - on the first visit to /library or /collection, once
//   - weekly on app open in the native apps, 7+ days after the last paywall
//   - one paywall per session; never for Pro users or anyone who already
//     used a trial (/api/trial), since this sheet only pitches the trial
// It fires `paywall_viewed` (surface intro_sheet, with the trigger) when it
// opens and `paywall_dismissed` when it is closed without the CTA.
//
// Rendered through a portal on <body>: PageTransition's transform would
// otherwise hijack position:fixed (see FamilyPills). Mounted once from
// app/layout.tsx.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { MONTHLY_PRICE, TRIAL_DAYS } from "@/lib/trial";
import { monthlyPriceFor, useStorePrices } from "@/lib/native/store-prices";
import { isNativeApp } from "@/lib/native";
import { track } from "@/lib/analytics";
import { decide, markShown, observe, type PaywallTrigger } from "@/lib/paywall-triggers";
import { loadPaywallState, registerPaywallVariant, savePaywallState } from "@/lib/paywall-client";

const SETTLE_MS = 400;
const OUT_MS = 380;

// One /api/trial lookup per page load, shared by every trigger check.
let trialUsed: Promise<boolean> | null = null;
function trialAlreadyUsed(): Promise<boolean> {
  if (!trialUsed) {
    trialUsed = fetch("/api/trial")
      .then((r) => (r.ok ? r.json() : { used: false }))
      .then((j: { used?: boolean }) => Boolean(j.used))
      // Offline: still show; the store enforces eligibility anyway.
      .catch(() => false);
  }
  return trialUsed;
}

// Six rows, ordered by what sells: the personal features first (they only
// exist with a shelf, which is why this sheet opens from Library/Shelf),
// then the library depth. "Deeper similar results" was dropped to make
// room; 25 suggestions vs 5 is the weakest pitch on the list.
const BENEFITS: { icon: React.ReactNode; title: string; sub: string; tint: string }[] = [
  {
    tint: "#DCE2EC",
    title: "Your match, and why",
    sub: "A score for any bottle against your taste, with the reasons. Compare any two.",
    icon: (
      // A target: the score is "how close to you".
      <>
        <circle cx="16" cy="16" r="10" />
        <circle cx="16" cy="16" r="5" />
        <circle cx="16" cy="16" r="1" />
      </>
    ),
  },
  {
    tint: "#E7D9BE",
    title: "Layer it",
    sub: "The best pairings from your own shelf, and what each one does.",
    icon: (
      // Two overlapping drops: one scent over another.
      <>
        <path d="M12 6c-3 4-6 7-6 11a6 6 0 0 0 12 0c0-4-3-7-6-11z" />
        <path d="M21 10c-2.5 3.5-5 6-5 9.5a5 5 0 0 0 10 0c0-3.5-2.5-6-5-9.5z" />
      </>
    ),
  },
  {
    tint: "#D7E3D3",
    title: "Cost-effective options",
    sub: "Same scent profile for less, with the saving in dollars.",
    icon: (
      // Two bottles, the second with a price tag: "this one, for less".
      <>
        <rect x="6" y="11" width="8" height="15" rx="1.5" />
        <rect x="16" y="11" width="8" height="15" rx="1.5" />
        <path d="M9 11V8h2v3M19 11V8h2v3" />
        <path d="M22 5h5l1 1v4l-1 1h-5z" />
      </>
    ),
  },
  {
    tint: "#F1E3BF",
    title: "An unlimited shelf",
    sub: "The 10-bottle cap comes off.",
    icon: (
      <>
        <path d="M5 11h22M5 21h22M5 5v22M27 5v22" />
        <path d="M10 11v-4h4v4M18 21v-4h4v4" />
      </>
    ),
  },
  {
    tint: "#E7D9BE",
    title: "Every perfumer",
    sub: "Who made it, and browse everything else they've made.",
    icon: (
      <>
        <circle cx="16" cy="11" r="5" />
        <path d="M6 27c1.5-5 5.5-8 10-8s8.5 3 10 8" />
      </>
    ),
  },
  {
    tint: "#EBD8D2",
    title: "The community take",
    sub: "What people actually say, and whether it's worth the buy.",
    icon: (
      <>
        <path d="M6 8h20v12H14l-6 5v-5H6z" />
        <path d="M11 13h10M11 16h6" />
      </>
    ),
  },
];

export function ProIntroSheet() {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoaded, user } = useUser();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  // A trigger check is in flight (trial lookup + settle delay).
  const busy = useRef(false);
  // Where the person is now, so a check that finishes late can tell they moved on.
  const here = useRef<string | null>(null);
  // Which trigger opened the sheet, for paywall_dismissed.
  const shownBy = useRef<PaywallTrigger | null>(null);
  // Native: the pitch quotes the store's own price, so it waits for it and
  // is skipped when the store has no price or no free intro offer.
  const prices = useStorePrices();
  const price = monthlyPriceFor(prices, MONTHLY_PRICE);
  const storeReady =
    prices.status === "web" || (prices.status === "ready" && prices.plans.monthly.trial !== null);
  const storeName = prices.status !== "web" && prices.platform === "android" ? "Google Play" : "the App Store";

  useEffect(() => setMounted(true), []);

  // Tag every event with the A/B arm (re-registered after sign-out by
  // <PostHogIdentify>, since posthog.reset() clears it).
  useEffect(() => {
    registerPaywallVariant();
  }, []);

  useEffect(() => {
    if (!mounted || !pathname) return;
    here.current = pathname;
    // Record the visit first: sessions and the first fragrance page are
    // tracked even when no paywall can show right now.
    const now = Date.now();
    const state = observe(loadPaywallState(now), { pathname, now, native: isNativeApp() });
    savePaywallState(state);

    if (!isLoaded || open || busy.current) return;
    // No store price yet: skip without using the trigger up.
    if (!storeReady) return;
    if (user?.publicMetadata?.plan === "pro") return;
    const due = decide(state, pathname);
    if (!due) return;

    busy.current = true;
    (async () => {
      try {
        // Someone who already had a trial gets the gates, not the pitch.
        if (await trialAlreadyUsed()) return;
        await new Promise((res) => setTimeout(res, SETTLE_MS));
        if (here.current !== pathname) return; // moved on; the next page decides
        // Re-read: a reload or another tab may have shown one meanwhile.
        const latest = loadPaywallState();
        if (decide(latest, pathname) !== due) return;
        savePaywallState(markShown(latest, due, Date.now()));
        shownBy.current = due;
        track("paywall_viewed", {
          surface: "intro_sheet",
          trigger: due,
          already_pro: false,
          signed_in: Boolean(user),
        });
        setOpen(true);
      } finally {
        busy.current = false;
      }
    })();
  }, [mounted, isLoaded, pathname, user, open, storeReady]);

  function close(then?: () => void) {
    if (leaving) return;
    setLeaving(true);
    // `then` is only passed by the CTA; everything else is a dismissal.
    if (!then) track("paywall_dismissed", { surface: "intro_sheet", trigger: shownBy.current });
    window.setTimeout(() => {
      setOpen(false);
      setLeaving(false);
      then?.();
    }, OUT_MS);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!mounted || !open || price === null) return null;

  return createPortal(
    <div
      className={`pro-intro ${leaving ? "pro-intro--out" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pro-intro-title"
      data-no-longpress
    >
      <button type="button" aria-label="Close" onClick={() => close()} className="pro-intro__backdrop" />

      <div className="pro-intro__panel">
        <div className="mx-auto max-w-md px-6 pt-4 pb-4 min-h-full flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <p className="font-mono text-xs uppercase tracking-widest text-slate">Spritz Pro</p>
            <button
              type="button"
              onClick={() => close()}
              aria-label="Close"
              className="w-9 h-9 -mr-2 flex items-center justify-center text-ink/60 hover:text-ink hover:bg-ink/5 transition"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Spare height on a tall screen is split 2:1, two parts above the
              headline and one part between the reminder and the fine print.
              All of it above left the pitch sitting oddly low; all of it
              below split the pitch from its button. */}
          <div className="flex-[2]" aria-hidden />
          {/* Fixed break: "for" belongs with "7 days" on the second line.
              Left to wrap on its own, the first line ran to the right edge
              and "for" was stranded at the end of it. */}
          <h1 id="pro-intro-title" className="font-display text-[32px] leading-[0.98] mb-4">
            The full library, free
            <br />
            for {TRIAL_DAYS} days.
          </h1>

          <ul className="divide-y divide-ink/10 mb-4">
            {BENEFITS.map((b, i) => (
              <li
                key={b.title}
                className="pro-intro__row flex items-start gap-3 py-2.5"
                style={{ animationDelay: `${420 + i * 40}ms` }}
              >
                <span
                  className="shrink-0 w-9 h-9 flex items-center justify-center text-emerald"
                  style={{ backgroundColor: b.tint }}
                  aria-hidden
                >
                  <svg
                    viewBox="0 0 32 32"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-5 h-5"
                  >
                    {b.icon}
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-normal leading-snug">{b.title}</p>
                  <p className="text-[13px] text-slate leading-snug mt-0.5">{b.sub}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="font-mono text-[10px] uppercase tracking-widest text-emerald mb-3">
            <span className="inline-block w-1.5 h-1.5 bg-brass align-middle mr-2" aria-hidden />
            We&apos;ll remind you on day {TRIAL_DAYS - 2}, two days before anything is charged.
          </p>

          <div className="flex-1 min-h-3" aria-hidden />
          <div>
            <p className="text-[11px] text-slate leading-snug mb-3">
              By tapping Start free trial you agree to the{" "}
              <a href="/legal/terms" className="underline underline-offset-2 text-ink">
                Terms
              </a>{" "}
              and, after {TRIAL_DAYS} days, to{" "}
              <span className="text-ink">{price}/month</span> billed automatically
              {prices.status === "web"
                ? " to your card until you cancel. Cancel anytime in your Account settings."
                : ` through ${storeName} until you cancel. Cancel anytime in ${storeName} or your Account settings.`}
            </p>
            <button
              type="button"
              onClick={() => close(() => router.push("/pricing?plan=monthly"))}
              className="w-full bg-emerald text-cream py-3.5 font-medium tracking-wide hover:bg-emerald/90 transition"
            >
              Start {TRIAL_DAYS}-day free trial
            </button>
            <button
              type="button"
              onClick={() => close()}
              className="block w-full text-center mt-1 py-2 text-sm text-slate hover:text-ink underline underline-offset-4"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

"use client";

// One-screen paywall: arm B of the D39 test (spec:
// claude/spritz-paywall-build-spec.md, design approved 2026-11-09 on the
// "Spritz paywall: current vs draft" canvas).
//
// Unlike the Pro intro sheet, this sells and takes the purchase on the same
// screen: three plan cards that each state their own charge, the trial
// timeline while Monthly is selected, and one button. Monthly is
// preselected because the 7-day trial lives there (2026-07-13) and a free
// week is the lowest-friction first ask. It also shows to people who have
// already had a trial, or whom the store won't give one: then Monthly reads
// as a plain subscription and the timeline is hidden.
//
// Layout: the header, benefits, plans and timeline scroll; the consent
// line, button, billed amount and "Not now" are pinned to the bottom so the
// button is always on screen (the intro sheet once needed a scroll to reach
// its CTA on an iPhone 17).
//
// Store rules carried over from /pricing: inside the apps every amount is
// the store's own localized string; the billed amount sits under the button
// in the same weight as the trial offer (App Store 3.1.2(c)); the consent
// sentence is directly above the button (California ARL); Restore purchases
// and the Terms and Privacy links are on the purchase screen itself.
//
// Opened and closed by <ProIntroSheet>, which owns the trigger rules, the
// slide animation and `paywall_viewed` / `paywall_dismissed`.

import { useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { nativePlatform } from "@/lib/native";
import { track } from "@/lib/analytics";
import { savePaywallResume } from "@/lib/paywall-client";
import type { PaywallTrigger } from "@/lib/paywall-triggers";
import { getPushPermission, requestPushAndRegister, resolvePushSupport } from "@/lib/push";
import { TRIAL_DAYS, WEB_PRICES, trialPrimer } from "@/lib/trial";
import { purchasePro, restorePro, type PurchasePlan } from "@/lib/native/purchases";
import { useStorePrices } from "@/lib/native/store-prices";

const BENEFITS: { text: string; icon: React.ReactNode }[] = [
  {
    text: "Your match for any bottle, with the reasons",
    icon: (
      <>
        <circle cx="16" cy="16" r="10" />
        <circle cx="16" cy="16" r="5" />
        <circle cx="16" cy="16" r="1" />
      </>
    ),
  },
  {
    text: "Layer it: the best pairings from your own shelf",
    icon: (
      <>
        <path d="M12 6c-3 4-6 7-6 11a6 6 0 0 0 12 0c0-4-3-7-6-11z" />
        <path d="M21 10c-2.5 3.5-5 6-5 9.5a5 5 0 0 0 10 0c0-3.5-2.5-6-5-9.5z" />
      </>
    ),
  },
  {
    text: "The community take, and whether it's worth the buy",
    icon: (
      <>
        <path d="M6 8h20v12H14l-6 5v-5H6z" />
        <path d="M11 13h10M11 16h6" />
      </>
    ),
  },
];

export function OneScreenPaywall({
  trigger,
  trialOffered,
  initialPlan,
  leaving,
  onDismiss,
  onLeave,
}: {
  trigger: PaywallTrigger;
  /** This person can still get the free week (not used, and the store offers it). */
  trialOffered: boolean;
  initialPlan: PurchasePlan;
  leaving: boolean;
  /** Closed without buying: fires `paywall_dismissed`. */
  onDismiss: () => void;
  /** Close, then run `then` (a route change or the sign-up modal). Not a dismissal. */
  onLeave: (then: () => void) => void;
}) {
  const { isLoaded, isSignedIn, user } = useUser();
  const clerk = useClerk();
  const router = useRouter();
  const prices = useStorePrices();
  const [plan, setPlan] = useState<PurchasePlan>(initialPlan);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [primerOpen, setPrimerOpen] = useState(false);

  const native = prices.status !== "web";
  const android = native && prices.platform === "android";
  const store = android ? "Google Play" : "the App Store";
  const amounts =
    prices.status === "web"
      ? WEB_PRICES
      : prices.status === "ready"
        ? {
            monthly: prices.plans.monthly.priceString,
            annual: prices.plans.annual.priceString,
            lifetime: prices.plans.lifetime.priceString,
          }
        : null;
  // The host only opens this once prices are known; this covers a store
  // that drops out mid-view. Never a USD fallback inside the apps.
  if (!amounts) return null;

  const trial = plan === "monthly" && trialOffered;

  const cards: { key: PurchasePlan; name: string; line: string; tag?: string }[] = [
    {
      key: "monthly",
      name: "Monthly",
      line: trialOffered
        ? `${TRIAL_DAYS} days free, then ${amounts.monthly}/month`
        : `${amounts.monthly}/month`,
    },
    {
      key: "annual",
      name: "Annual",
      line: `${amounts.annual}/year, billed today`,
      tag: "Half the monthly rate",
    },
    {
      key: "lifetime",
      name: "Lifetime",
      line: `${amounts.lifetime} once. No subscription, no renewals.`,
    },
  ];

  const cta = trial
    ? `Try ${TRIAL_DAYS} days free`
    : plan === "monthly"
      ? `Start Pro for ${amounts.monthly}/month`
      : plan === "annual"
        ? `Start Pro for ${amounts.annual}/year`
        : `Get Lifetime for ${amounts.lifetime}`;
  const ctaSub = trial
    ? `Then ${amounts.monthly}/month. Cancel anytime.`
    : plan === "lifetime"
      ? "One payment. Yours for good."
      : "Billed today. Cancel anytime.";

  const billedVia = native ? `through ${store}` : "to your card";
  const cancelWhere = native ? `in ${store} or your Account settings` : "in your Account settings";
  const consent = trial
    ? `after ${TRIAL_DAYS} days, to ${amounts.monthly}/month billed automatically ${billedVia} until you cancel. Cancel anytime ${cancelWhere}.`
    : plan === "monthly"
      ? `to ${amounts.monthly}/month billed automatically ${billedVia} until you cancel. Cancel anytime ${cancelWhere}.`
      : plan === "annual"
        ? `to ${amounts.annual}/year billed automatically ${billedVia} until you cancel. Cancel anytime ${cancelWhere}.`
        : `to one payment of ${amounts.lifetime}. Nothing renews.`;
  const termsHref =
    native && !android ? "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" : "/legal/terms";
  const primer = trialPrimer(amounts.monthly);

  async function start() {
    if (!isLoaded || busy) return;
    setNotice(null);
    if (!isSignedIn) {
      // Come back to this paywall, same plan, once they have an account.
      savePaywallResume({ plan, trigger });
      if (native) {
        // Clerk's modal renders inside the web view without the native
        // social buttons; the sign-up page carries them.
        onLeave(() => router.push(`/sign-up?redirect_url=${encodeURIComponent("/")}`));
      } else {
        onLeave(() => clerk.openSignUp({ redirectUrl: window.location.href }));
      }
      return;
    }
    // Native trial: offer the day-5 reminder the timeline promises, only
    // when the OS has never been asked.
    if (native && trial) {
      try {
        if ((await resolvePushSupport()) && (await getPushPermission()) === "prompt") {
          setPrimerOpen(true);
          return;
        }
      } catch {
        /* fall through to the purchase */
      }
    }
    await purchase();
  }

  async function primerAccept() {
    setPrimerOpen(false);
    try {
      await requestPushAndRegister();
    } catch {
      /* the trial still starts; they just will not get the reminder */
    }
    await purchase();
  }

  async function purchase() {
    const platform = nativePlatform();
    track("purchase_started", {
      surface: "one_screen",
      plan,
      rail: !native ? "stripe" : platform === "android" ? "play_store" : "app_store",
    });
    setBusy(true);
    try {
      if (native) {
        const outcome = await purchasePro(plan);
        if (outcome.status === "purchased") {
          await user?.reload(); // publicMetadata.plan mirrors the grant
          onLeave(() => {
            router.push("/collection?upgraded=1");
            router.refresh();
          });
        } else if (outcome.status === "unavailable") {
          setNotice("Purchases aren't available right now. Try again in a moment.");
        } else if (outcome.status === "error") {
          setNotice(outcome.message);
        }
        // cancelled: they closed the store sheet, nothing to say.
        return;
      }
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        setNotice("Couldn't start checkout. Try again in a moment.");
      }
    } catch {
      // Never fail silently: a reset button with no message reads as broken.
      setNotice(native ? `Couldn't reach ${store}. Try again in a moment.` : "Couldn't start checkout. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    setNotice(null);
    try {
      const { restored } = await restorePro();
      if (restored) {
        await user?.reload();
        onLeave(() => {
          router.push("/account");
          router.refresh();
        });
      } else {
        setNotice(
          android
            ? "No previous purchase found for this Google account."
            : "No previous purchase found for this Apple ID.",
        );
      }
    } catch {
      setNotice("Couldn't reach the store. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`pro-intro ${leaving ? "pro-intro--out" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="one-screen-paywall-title"
      data-no-longpress
    >
      <button type="button" aria-label="Close" onClick={onDismiss} className="pro-intro__backdrop" />

      {/* The panel's own scrolling is replaced by the inner scroll region,
          so the button block stays pinned. */}
      <div className="pro-intro__panel" style={{ overflowY: "hidden" }}>
        <div className="mx-auto max-w-md h-full flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-mono text-xs uppercase tracking-widest text-slate">Spritz Pro</p>
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Close"
                className="w-11 h-11 -mr-3 flex items-center justify-center text-ink/60 hover:text-ink hover:bg-ink/5 transition"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <h1 id="one-screen-paywall-title" className="font-display text-[32px] leading-[1.02] mb-2">
              Know if it suits you
              <br />
              before you buy.
            </h1>
            <p className="text-[15px] text-slate leading-normal mb-6">
              Pro scores any bottle against your taste and tells you why.
            </p>

            <ul className="flex flex-col gap-3 mb-6">
              {BENEFITS.map((b) => (
                <li key={b.text} className="flex items-start gap-3">
                  <svg
                    viewBox="0 0 32 32"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 w-5 h-5 mt-0.5 text-emerald"
                    aria-hidden
                  >
                    {b.icon}
                  </svg>
                  <span className="text-[15px] leading-snug">{b.text}</span>
                </li>
              ))}
            </ul>

            <div role="radiogroup" aria-label="Choose a plan" className="flex flex-col gap-2 mb-6">
              {cards.map((c) => {
                const on = plan === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setPlan(c.key);
                      setPrimerOpen(false);
                      setNotice(null);
                    }}
                    className={`min-h-[60px] px-4 py-2.5 text-left flex items-center justify-between gap-3 transition ${
                      on ? "bg-paper border-2 border-emerald" : "border border-ink/25"
                    }`}
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="text-base font-medium">{c.name}</span>
                      <span className="text-sm text-ink">{c.line}</span>
                    </span>
                    {c.tag && (
                      <span className="shrink-0 px-2 py-1 bg-brass text-ink text-[11px] uppercase tracking-wider">
                        {c.tag}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {trial && (
              <ol className="flex flex-col gap-3 p-4 bg-paper">
                {[
                  { when: "Today", what: "Everything in Pro unlocks. You pay nothing." },
                  {
                    when: `Day ${TRIAL_DAYS - 2}`,
                    what: "One reminder from us that your monthly plan is about to start.",
                  },
                  {
                    when: `Day ${TRIAL_DAYS}`,
                    what: `${amounts.monthly}/month begins. Cancel before then and you pay nothing.`,
                  },
                ].map((step) => (
                  <li key={step.when} className="flex gap-3">
                    <span className="shrink-0 w-12 font-mono text-[11px] uppercase tracking-widest text-emerald pt-0.5">
                      {step.when}
                    </span>
                    <span className="text-sm text-ink leading-normal">{step.what}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Pinned: consent, button, billed amount, exits. */}
          <div className="px-6 pt-3 pb-3 border-t border-ink/10 bg-cream">
            {primerOpen ? (
              <div role="group" aria-label={primer.title}>
                <p className="font-medium mb-1">{primer.title}</p>
                <p className="text-sm text-slate leading-relaxed mb-3">{primer.body}</p>
                <button
                  type="button"
                  onClick={primerAccept}
                  className="w-full bg-emerald text-cream py-3.5 font-medium tracking-wide hover:bg-emerald/90 transition"
                >
                  Turn on reminders
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrimerOpen(false);
                    void purchase();
                  }}
                  className="block w-full text-center mt-1 py-2 text-sm text-slate hover:text-ink underline underline-offset-4"
                >
                  Skip, start the trial
                </button>
              </div>
            ) : (
              <>
                <p className="text-[11px] text-slate leading-snug mb-3">
                  By tapping {trial ? cta : "the button below"} you agree to the{" "}
                  <a
                    href={termsHref}
                    target={native && !android ? "_blank" : undefined}
                    rel={native && !android ? "noreferrer" : undefined}
                    className="underline underline-offset-2 text-ink"
                  >
                    Terms
                  </a>{" "}
                  and <span className="text-ink">{consent}</span>{" "}
                  <a href="/legal/privacy" className="underline underline-offset-2 text-ink">
                    Privacy Policy
                  </a>
                </p>
                <button
                  type="button"
                  onClick={start}
                  disabled={busy || !isLoaded}
                  className="w-full bg-emerald text-cream py-3.5 font-medium tracking-wide hover:bg-emerald/90 transition disabled:opacity-60"
                >
                  {busy ? "Loading…" : cta}
                </button>
                <p className="mt-2 text-center text-base text-ink">{ctaSub}</p>
                {notice && <p className="mt-2 text-center text-sm text-burgundy">{notice}</p>}
                <div className="mt-1 flex items-center justify-center gap-6">
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="py-2 text-sm text-slate hover:text-ink underline underline-offset-4"
                  >
                    Not now
                  </button>
                  {native && isSignedIn && (
                    <button
                      type="button"
                      onClick={restore}
                      disabled={busy}
                      className="py-2 text-sm text-slate hover:text-ink underline underline-offset-4 disabled:opacity-60"
                    >
                      Restore purchases
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

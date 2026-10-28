"use client";

// /pricing — Pro upgrade surface.
//
// Layout: header → plan toggle (Monthly | Annual) → selected plan card →
// free-vs-Pro comparison table → FAQ → final reassurance.
//
// Plan toggle is local state (no URL param) — keeping the page server-stable
// avoids a flash of the wrong plan card on initial paint.

import { Suspense, useEffect, useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { isNativeApp } from "@/lib/native";
import { getPushPermission, requestPushAndRegister, resolvePushSupport } from "@/lib/push";
import { TRIAL_PRIMER, TRIAL_TIMELINE } from "@/lib/trial";
import {
  getNativePlans,
  purchasePro,
  restorePro,
  type NativePlanInfo,
} from "@/lib/native/purchases";

type Plan = "monthly" | "annual" | "lifetime";

// Plans configured here so the comparison table and CTA stay in sync.
// Lifetime is a one-time purchase, but it lives in the same toggle so it's
// discoverable right alongside Monthly and Annual.
const PLANS: Record<Plan, { label: string; price: string; unit: string; sub: string; cadence: string }> = {
  monthly: {
    label: "Monthly",
    price: "$4.99",
    unit: "/mo",
    sub: "7-day free trial, then $4.99/mo. Cancel anytime.",
    cadence: "monthly",
  },
  annual: {
    label: "Annual",
    price: "$29.99",
    unit: "/yr",
    sub: "Billed annually — that's ~$2.50/mo. Cancel anytime.",
    cadence: "annual",
  },
  lifetime: {
    label: "Lifetime",
    price: "$89",
    unit: " once",
    sub: "One payment, yours forever. No subscription, no renewals.",
    cadence: "lifetime",
  },
};

// One source of truth for the comparison table + the "Pro includes" bullets.
// Order matters: lead with the differences users will feel fastest.
const FEATURE_MATRIX: Array<{ label: string; free: string; pro: string }> = [
  {
    label: "Scan any bottle",
    free: "Unlimited*",
    pro: "Unlimited*",
  },
  {
    label: "Saved collection",
    free: "Up to 10 fragrances",
    pro: "Unlimited",
  },
  {
    label: "Your match: a score against your taste",
    free: "3 new fragrances a week, score only",
    pro: "Unlimited, with the reasons",
  },
  {
    label: "Compare any two fragrances",
    free: "2 pairs a week",
    pro: "Unlimited, with both match scores",
  },
  {
    label: "Layer it: pairings from your own shelf",
    free: "A glimpse of one",
    pro: "Top three, with what each does",
  },
  {
    label: "Wear insights: cost per wear, most complimented, what's gone unworn",
    free: "Not included",
    pro: "Included",
  },
  {
    label: "Similar-fragrance suggestions",
    free: "5 per fragrance",
    pro: "25 per fragrance",
  },
  {
    label: "Cost-effective options (same scent profile, costs less)",
    free: "How many, and the best saving",
    pro: "The full list, with prices",
  },
  {
    label: "Perfumer credits + house history",
    free: "Not included",
    pro: "Every fragrance",
  },
  {
    label: "Note flavor profiles",
    free: "Not included",
    pro: "All notes, expanded",
  },
  {
    label: "Wishlist sale alerts",
    free: "Not included",
    pro: "Included",
  },
  {
    label: "Priority scan queue",
    free: "Not included",
    pro: "Included",
  },
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from any device and you keep Pro access until the end of your current billing period. After that you drop back to Free. Your collection stays intact, just capped at 10 items going forward.",
  },
  {
    q: "What are cost-effective options?",
    a: "Fragrances that smell close to the one you're looking at and cost less, ranked by how much you save for how close the match is. We compare scent profiles across the whole library and check current retailer prices, so you see the saving in dollars, not a vague 'similar'. Free users see how many options exist and the best saving; Pro shows the bottles themselves.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes — the Monthly plan comes with a 7-day free trial. You get full Pro access for a week, and you won't be charged until it ends. Cancel anytime before then and you pay nothing, and the most you'd ever be charged after a trial is $4.99. The Annual plan has no trial — it's billed upfront at $29.99 (~$2.50/mo). And the Free plan is always free: scan unlimited bottles, save up to 10 fragrances, and see when a cheaper match exists.",
  },
  {
    q: "What's the Lifetime option?",
    a: "A one-time payment of $89 that unlocks Pro permanently — no subscription, no renewals. Same Pro feature set as the monthly and annual plans, just paid once and yours for good. There's no trial on Lifetime since it's a single upfront purchase.",
  },
  {
    q: "Do you sell my data?",
    a: "No. We don't sell or share scan history, collection contents, or preferences with anyone. The only data leaving Spritz is what's needed to process payments and authentication (Clerk).",
  },
  {
    q: "What if I scan something you don't have?",
    a: "We log every miss and use it to prioritize what to add next. After a no-match scan you can also tap \"we missed this\" to flag it directly. The catalog grows weekly.",
  },
];

// useSearchParams needs a Suspense boundary for the static prerender of
// this route; the fallback is never seen in practice.
export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingContent />
    </Suspense>
  );
}

function PricingContent() {
  const { isLoaded, isSignedIn, user } = useUser();
  const clerk = useClerk();
  const router = useRouter();
  const [selected, setSelected] = useState<Plan>("annual");
  // ?plan=monthly from the Pro intro sheet lands on the trial card.
  const search = useSearchParams();
  useEffect(() => {
    const p = search.get("plan");
    if (p === "monthly" || p === "annual" || p === "lifetime") setSelected(p);
  }, [search]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Native shell (slice 7): purchases go through the App Store / Play via
  // RevenueCat and prices come from the store, localized. Stripe is never
  // reachable from here (Guideline 3.1.1). Detected after mount so the
  // server render and first client render agree.
  const [native, setNative] = useState(false);
  const [nativePlans, setNativePlans] = useState<Record<Plan, NativePlanInfo> | null>(null);
  useEffect(() => {
    setNative(isNativeApp());
  }, []);
  useEffect(() => {
    if (!native || !isSignedIn) return;
    let cancelled = false;
    getNativePlans()
      .then((plans) => {
        if (!cancelled) setNativePlans(plans);
      })
      .catch(() => {
        if (!cancelled) setNativePlans(null);
      });
    return () => {
      cancelled = true;
    };
  }, [native, isSignedIn]);

  // Optimistic check — server is authoritative, but no point showing
  // "Upgrade" to someone who's already Pro.
  const isAlreadyPro = user?.publicMetadata?.plan === "pro";

  // Native + Monthly: before the store sheet, offer the day-5 reminder
  // (the promise the timeline below makes). Only when the OS has never
  // been asked; "denied" and "granted" both skip straight to purchase.
  const [primerOpen, setPrimerOpen] = useState(false);

  async function maybePrimeThenUpgrade(plan: Plan) {
    if (native && plan === "monthly" && isSignedIn) {
      try {
        if ((await resolvePushSupport()) && (await getPushPermission()) === "prompt") {
          setPrimerOpen(true);
          return;
        }
      } catch {
        /* fall through to the purchase */
      }
    }
    await upgrade(plan);
  }

  async function primerAccept() {
    setPrimerOpen(false);
    try {
      await requestPushAndRegister();
    } catch {
      /* the trial still starts; they just will not get the reminder */
    }
    await upgrade("monthly");
  }

  async function upgrade(plan: Plan) {
    if (!isLoaded) return; // wait for Clerk; prevents hydration races
    if (!isSignedIn) {
      if (native) {
        // Clerk's modal would render inside the webview with the social
        // buttons hidden; the sign-up page carries the native buttons.
        router.push(`/sign-up?redirect_url=${encodeURIComponent("/pricing")}`);
        return;
      }
      // Modal sign-up — keeps the user on /pricing so they can complete
      // the upgrade right after signing up. Session 01 root cause: the
      // silent redirect to /sign-up dropped the upgrade intent on the
      // floor and the user couldn't figure out where they were.
      clerk.openSignUp({
        redirectUrl: typeof window !== "undefined" ? window.location.href : "/pricing",
      });
      return;
    }
    if (native) {
      setBusy(true);
      setNotice(null);
      try {
        const outcome = await purchasePro(plan);
        if (outcome.status === "purchased") {
          await user?.reload(); // publicMetadata.plan mirrors the grant
          router.push("/collection?upgraded=1");
          router.refresh();
        } else if (outcome.status === "unavailable") {
          setNotice("Purchases aren't available right now. Try again in a moment.");
        } else if (outcome.status === "error") {
          setNotice(outcome.message);
        }
        // cancelled: the user closed the sheet, nothing to say.
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        // Surface a clearer error so the button doesn't just hang.
        console.error("[pricing] checkout returned no url:", data);
      }
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
        router.push("/account");
        router.refresh();
      } else {
        setNotice("No previous purchase found for this Apple ID.");
      }
    } catch {
      setNotice("Couldn't reach the store. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  // On native, the store's localized price replaces the hardcoded one and
  // the trial line reflects the store's own introductory offer.
  const web = PLANS[selected];
  const storePlan = nativePlans?.[selected] ?? null;
  const plan = storePlan
    ? {
        ...web,
        price: storePlan.priceString,
        sub:
          selected === "monthly"
            ? storePlan.trial
              ? `${storePlan.trial.replace(/^(\d+) (day|week|month)s?$/, "$1-$2")} free trial, then ${storePlan.priceString}/mo. Cancel anytime.`
              : `${storePlan.priceString}/mo. Cancel anytime.`
            : selected === "annual"
              ? `Billed annually at ${storePlan.priceString}. Cancel anytime.`
              : web.sub,
      }
    : web;

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      {/* Header */}
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate mb-2">
          Spritz Pro
        </p>
        <h1 className="font-display text-5xl leading-[0.95] mb-4">
          The full
          <br />
          library.
        </h1>
        <p className="text-slate text-base leading-relaxed max-w-xs">
          Every perfumer credit, every house story, every note&apos;s flavor
          profile. Plus cost-effective options for any fragrance: what smells
          close, for less.
        </p>
      </header>

      {/* Already-Pro banner — short circuit anyone who shouldn't be here. */}
      {isAlreadyPro && (
        <div className="mb-8 p-4 rounded-xl bg-emerald/10 border border-emerald/30">
          <p className="font-display text-lg text-emerald mb-1">
            You&apos;re already Pro.
          </p>
          <p className="text-sm text-ink">
            {native
              ? "See your plan under Profile."
              : "Manage your subscription from your account menu."}
          </p>
        </div>
      )}

      {/* Plan toggle */}
      <div className="mb-6">
        <div className="flex gap-1 p-1 bg-ink/5 rounded-xl">
          {(Object.keys(PLANS) as Plan[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition relative ${
                selected === key ? "bg-cream shadow-sm text-ink" : "text-ink/60"
              }`}
            >
              {PLANS[key].label}
              {key === "annual" && (
                <span className="ml-2 inline-block px-1.5 py-0.5 bg-brass text-ink text-[10px] font-mono uppercase tracking-wider rounded-full">
                  -50%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Selected plan card. Stroke + CTA use the emerald token — the same
          green as every other CTA in the app. */}
      {/* Annual gets the metallic sweep: a brass highlight travelling round
          the emerald border (globals.css "brass sweep"). The other plans keep
          the static border; the shine marks the -50% plan the way the
          reference paywall marks its featured tier. */}
      <div
        className={`rounded-2xl p-6 mb-10 bg-cream ${
          selected === "annual" ? "brass-sweep" : "border-2 border-emerald"
        }`}
      >
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="font-display text-3xl">{plan.label}</h2>
          <span className="font-display text-3xl">
            {plan.price}
            <span className="text-sm text-slate font-sans">{plan.unit}</span>
          </span>
        </div>
        <p className="text-sm text-slate mb-5">{plan.sub}</p>

        {!isAlreadyPro && (
          <button
            onClick={() => maybePrimeThenUpgrade(selected)}
            disabled={busy}
            className="w-full bg-emerald text-cream py-3 rounded-xl font-medium hover:bg-emerald/90 transition disabled:opacity-60"
          >
            {busy
              ? "Loading…"
              : selected === "lifetime"
                ? "Get Lifetime"
                : selected === "monthly"
                  ? "Start free trial"
                  : `Start Pro · ${plan.cadence}`}
          </button>
        )}

        {primerOpen && (
          <div className="mt-4 rounded-xl border border-ink/10 bg-paper p-4" role="dialog" aria-label={TRIAL_PRIMER.title}>
            <p className="font-medium mb-1">{TRIAL_PRIMER.title}</p>
            <p className="text-sm text-slate leading-relaxed mb-4">{TRIAL_PRIMER.body}</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={primerAccept}
                className="w-full bg-emerald text-cream py-3 rounded-xl font-medium hover:bg-emerald/90 transition"
              >
                Turn on reminders
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrimerOpen(false);
                  void upgrade("monthly");
                }}
                className="w-full py-2 text-sm text-slate hover:text-ink underline underline-offset-4"
              >
                Skip, start the trial
              </button>
            </div>
          </div>
        )}

        <p className="mt-3 text-center font-mono text-xs uppercase tracking-widest text-slate">
          {!isSignedIn
            ? "Sign up first. Takes 30 seconds."
            : native
              ? "Billed through the App Store"
              : "Secure checkout via Stripe"}
        </p>
        {notice && (
          <p className="mt-3 text-center text-sm text-burgundy">{notice}</p>
        )}
        {/* Restore purchases: Apple requires it for the lifetime product
            (non-consumable). Native only; the web has nothing to restore. */}
        {native && isSignedIn && !isAlreadyPro && (
          <button
            type="button"
            onClick={restore}
            disabled={busy}
            className="mt-4 w-full text-center font-mono text-xs uppercase tracking-widest text-slate underline underline-offset-4 disabled:opacity-60"
          >
            Restore purchases
          </button>
        )}
        {/* Guideline 3.1.2: the purchase screen itself has to state the
            renewal terms and link the Terms of Use and Privacy Policy. The
            store build uses Apple's standard EULA (also linked from the App
            Store description); the web links our own terms. */}
        {isSignedIn && !isAlreadyPro && (
          <p className="mt-4 text-center text-[11px] leading-relaxed text-slate">
            {native
              ? "Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel in your App Store account settings. "
              : "Subscriptions renew automatically until cancelled. Manage or cancel anytime from your account. "}
            <a
              href={
                native
                  ? "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
                  : "/legal/terms"
              }
              target={native ? "_blank" : undefined}
              rel={native ? "noreferrer" : undefined}
              className="underline underline-offset-2"
            >
              Terms of Use
            </a>
            {" · "}
            <a href="/legal/privacy" className="underline underline-offset-2">
              Privacy Policy
            </a>
          </p>
        )}
      </div>

      {/* How the trial works — below the plan card so the CTA is reached
          first (Josh, 2026-10-26); Monthly only (the trial lives there, pricing
          decision 2026-07-13). The day-5 line is a promise lib/push-trial.ts
          keeps. Billed amount appears in the same weight as the free days,
          per App Store guideline 3.1.2(c). */}
      {selected === "monthly" && !isAlreadyPro && (
        <section className="mb-10 rounded-2xl border border-ink/10 bg-paper px-5 py-5">
          <h2 className="font-display text-xl mb-3">How your free trial works</h2>
          <ol className="space-y-3">
            {TRIAL_TIMELINE.map((step) => (
              <li key={step.when} className="flex gap-3">
                <span className="shrink-0 w-14 font-mono text-[11px] uppercase tracking-widest text-emerald pt-0.5">
                  {step.when}
                </span>
                <span className="text-sm text-ink leading-relaxed">{step.what}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Comparison table */}
      <section className="mb-10">
        <h2 className="font-display text-2xl mb-4">What&apos;s included</h2>
        <div className="rounded-2xl border border-ink/10 overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-4 py-2 bg-paper/60 border-b border-ink/10">
            <span className="font-mono text-[10px] uppercase tracking-widest text-slate">Feature</span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-slate text-center w-12">Free</span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-emerald text-center w-16">Pro</span>
          </div>
          {FEATURE_MATRIX.map((row, i) => (
            <div
              key={row.label}
              className={`grid grid-cols-[1fr_auto_auto] gap-x-4 px-4 py-3 text-sm items-center ${
                i < FEATURE_MATRIX.length - 1 ? "border-b border-ink/5" : ""
              }`}
            >
              <span className="text-ink leading-snug">{row.label}</span>
              <span className="text-slate text-xs text-center w-12">{row.free}</span>
              <span className="text-ink text-xs text-center w-16 font-medium">{row.pro}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate leading-relaxed">
          * Unlimited within fair-use daily limits that keep Spritz fast for
          everyone and prevent abuse. Normal use never comes close.
        </p>
      </section>

      {/* FAQ */}
      <section className="mb-10">
        <h2 className="font-display text-2xl mb-4">Common questions</h2>
        <div className="space-y-2">
          {FAQ.map((item) => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </section>

      {/* Social proof slot — kept structural so we can drop in real
          testimonials once we have them. For now a quiet credibility line. */}
      <section className="mb-10 text-center py-6 border-t border-b border-ink/10">
        <p className="font-display text-lg text-ink mb-1 italic">
          &ldquo;Finally a fragrance app that respects my intelligence.&rdquo;
        </p>
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          Early user · TF Black Orchid · 6 months Pro
        </p>
      </section>

      {/* Final CTA */}
      {!isAlreadyPro && (
        <div className="text-center">
          <button
            onClick={() => upgrade(selected)}
            disabled={busy}
            className="w-full bg-ink text-cream py-4 rounded-2xl font-medium tracking-wide hover:bg-ink/90 transition disabled:opacity-60 mb-3"
          >
            {busy
              ? "Loading…"
              : selected === "lifetime"
                ? `Get Lifetime · ${plan.price}`
                : `Go Pro · ${plan.price}${plan.unit}`}
          </button>
          <p className="text-xs text-slate font-mono uppercase tracking-widest">
            Cancel anytime · {isSignedIn ? "Secure" : "30-second"} signup
          </p>
        </div>
      )}
    </div>
  );
}

// FAQ accordion — controlled per-item, multiple can be open at once
// (matches the way users actually skim FAQs — open the two relevant ones,
// not one at a time).
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-ink/10 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-ink/[0.02] transition"
      >
        <span className="font-medium text-ink text-sm">{q}</span>
        <span
          aria-hidden
          className={`font-mono text-xs text-slate transition-transform ${
            open ? "rotate-45" : ""
          }`}
        >
          +
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 -mt-1">
          <p className="text-sm text-slate leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  );
}

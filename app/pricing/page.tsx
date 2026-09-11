"use client";

// /pricing — Pro upgrade surface.
//
// Layout: header → plan toggle (Monthly | Annual) → selected plan card →
// free-vs-Pro comparison table → FAQ → final reassurance.
//
// Plan toggle is local state (no URL param) — keeping the page server-stable
// avoids a flash of the wrong plan card on initial paint.

import { useEffect, useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { isNativeApp } from "@/lib/native";
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
    free: "Up to 25 fragrances",
    pro: "Unlimited",
  },
  {
    label: "Similar-fragrance suggestions",
    free: "5 per fragrance",
    pro: "25 per fragrance",
  },
  {
    label: "Curated dupes (community-known)",
    free: "Included",
    pro: "Included",
  },
  {
    label: "AI-generated dupes on demand",
    free: "Not included",
    pro: "Unlimited",
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
    a: "Yes. Cancel from any device and you keep Pro access until the end of your current billing period. After that you drop back to Free. Your collection stays intact, just capped at 25 items going forward.",
  },
  {
    q: "What's a dupe, exactly?",
    a: "A fragrance that smells very close to a more expensive one, usually at a fraction of the price. We split them into two kinds: curated dupes (community-recognized, hand-vetted by us) and AI-generated dupes (Pro feature) that use the fragrance's note profile to suggest cheaper alternatives the community has talked about.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes — the Monthly plan comes with a 7-day free trial. You get full Pro access for a week, and you won't be charged until it ends. Cancel anytime before then and you pay nothing, and the most you'd ever be charged after a trial is $4.99. The Annual plan has no trial — it's billed upfront at $29.99 (~$2.50/mo). And the Free plan is always free: scan unlimited bottles, save up to 25 fragrances, and get curated dupes without paying anything.",
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

export default function PricingPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const clerk = useClerk();
  const router = useRouter();
  const [selected, setSelected] = useState<Plan>("annual");
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
          profile. Plus AI-generated dupes for any fragrance, on demand.
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
      <div className="border-2 border-emerald rounded-2xl p-6 mb-10 bg-cream">
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
            onClick={() => upgrade(selected)}
            disabled={busy}
            className="w-full bg-emerald text-cream py-3 rounded-xl font-medium hover:bg-emerald/90 transition disabled:opacity-60"
          >
            {busy
              ? "Loading…"
              : selected === "lifetime"
                ? "Get Lifetime"
                : `Start Pro · ${plan.cadence}`}
          </button>
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
      </div>

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

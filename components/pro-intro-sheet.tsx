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
// Show rules (localStorage, per device):
//   - first show: first visit to /library or /collection, whichever comes
//     first; the flag is written the moment it opens so the other tab
//     never shows it again
//   - second and final show: only after the user has hit RESHOW_GATE_HITS
//     Pro gates (TrialCta mounts count them) AND RESHOW_AFTER_DAYS have
//     passed since the first dismissal. Never a third. Research: scheduled
//     re-shows raise complaints faster than conversions; behaviour-
//     triggered ones land when the pitch is relevant again.
//   - never for Pro users or anyone who already used a trial (/api/trial)
//
// Rendered through a portal on <body>: PageTransition's transform would
// otherwise hijack position:fixed (see FamilyPills). Mounted once from
// app/layout.tsx.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { MONTHLY_PRICE, TRIAL_DAYS } from "@/lib/trial";

const KEY = "spritz:pro-intro:v1";
const GATE_HITS_KEY = "spritz:pro-gate-hits";
const TRIGGER_PATHS = new Set(["/library", "/collection"]);
const RESHOW_GATE_HITS = 3;
const RESHOW_AFTER_DAYS = 7;
const SETTLE_MS = 400;
const OUT_MS = 380;

interface IntroState {
  shows: number;
  /** Epoch ms of the most recent dismissal. */
  dismissedAt: number | null;
}

function readState(): IntroState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { shows: 0, dismissedAt: null, ...(JSON.parse(raw) as Partial<IntroState>) };
  } catch {
    /* fall through */
  }
  return { shows: 0, dismissedAt: null };
}

function writeState(s: IntroState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: the sheet may show again next launch, acceptable */
  }
}

/** Called by TrialCta on mount: one more Pro gate seen. */
export function recordProGateHit(): void {
  try {
    const n = Number(localStorage.getItem(GATE_HITS_KEY) ?? "0") || 0;
    localStorage.setItem(GATE_HITS_KEY, String(n + 1));
  } catch {
    /* ignore */
  }
}

function gateHits(): number {
  try {
    return Number(localStorage.getItem(GATE_HITS_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

function shouldShow(): boolean {
  const s = readState();
  if (s.shows === 0) return true;
  if (s.shows >= 2) return false;
  const since = s.dismissedAt ? Date.now() - s.dismissedAt : 0;
  return gateHits() >= RESHOW_GATE_HITS && since >= RESHOW_AFTER_DAYS * 24 * 3600 * 1000;
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
  const armed = useRef(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || !isLoaded || open || armed.current) return;
    if (!pathname || !TRIGGER_PATHS.has(pathname)) return;
    if (user?.publicMetadata?.plan === "pro") return;
    if (!shouldShow()) return;
    armed.current = true;
    let cancelled = false;
    (async () => {
      // Someone who already had a trial gets the gates, not the pitch.
      try {
        const r = await fetch("/api/trial");
        const j = (await r.json()) as { used?: boolean };
        if (j.used) return;
      } catch {
        /* offline: still show; the store enforces eligibility anyway */
      }
      await new Promise((res) => setTimeout(res, SETTLE_MS));
      if (cancelled) return;
      const s = readState();
      writeState({ ...s, shows: s.shows + 1 });
      setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [mounted, isLoaded, pathname, user, open]);

  function close(then?: () => void) {
    if (leaving) return;
    setLeaving(true);
    const s = readState();
    writeState({ ...s, dismissedAt: Date.now() });
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

  if (!mounted || !open) return null;

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
          <h1 id="pro-intro-title" className="font-display text-[32px] leading-[0.98] mb-4">
            The full library, free for {TRIAL_DAYS} days.
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
              <span className="text-ink">{MONTHLY_PRICE}/month</span> billed automatically through
              the App Store (or your card on the web) until you cancel. Cancel anytime in your App
              Store or Account settings.
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

"use client";

// The action area of the /account plan card. The page is a Server
// Component and cannot know whether it is inside the native shell, so
// this client piece decides after mount what a Pro or Free user should
// see (D32, D33):
//
//   web,   Stripe Pro     → Manage subscription (Stripe portal)
//   web,   store Pro      → "managed through the App Store / Google Play"
//   native, Stripe Pro    → "managed on the web" — no portal button, no
//                            purchase offer (Guideline 3.1.1)
//   native, store Pro     → Manage subscription → the store's own
//                            subscription page in the browser sheet
//   native, Free          → Go Pro (the /pricing paywall) + Restore purchases
//   web,    Free          → Go Pro
//   lifetime, anywhere    → nothing to manage

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { isNativeApp, nativePlatform } from "@/lib/native";
import { restorePro } from "@/lib/native/purchases";
import { ManageSubscriptionButton } from "@/components/account-actions";

type Source = "stripe" | "apple" | "play" | null;

const STORE_SUBSCRIPTIONS = {
  ios: "https://apps.apple.com/account/subscriptions",
  android: "https://play.google.com/store/account/subscriptions",
} as const;

export function PlanActions({
  plan,
  isLifetime,
  proSource,
  hasStripeCustomer,
}: {
  plan: "free" | "pro";
  isLifetime: boolean;
  proSource: Source;
  hasStripeCustomer: boolean;
}) {
  const [native, setNative] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();
  const { user } = useUser();

  useEffect(() => {
    setNative(isNativeApp());
  }, []);

  // Legacy rows have no source recorded: infer from the Stripe customer.
  const source: Source = proSource ?? (hasStripeCustomer ? "stripe" : null);

  async function openStoreSubscriptions() {
    const platform = nativePlatform();
    const url = platform === "android" ? STORE_SUBSCRIPTIONS.android : STORE_SUBSCRIPTIONS.ios;
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
    } catch {
      window.open(url, "_blank");
    }
  }

  async function restore() {
    setBusy(true);
    setNotice(null);
    try {
      const { restored } = await restorePro();
      if (restored) {
        await user?.reload();
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

  if (plan === "pro") {
    if (isLifetime) {
      return (
        <p className="text-sm text-slate italic">
          You have Lifetime access — paid once, yours forever. Nothing to
          manage or renew.
        </p>
      );
    }
    if (source === "stripe") {
      return native ? (
        <p className="text-sm text-slate italic">
          Your subscription is managed on the web at spritzofficial.app.
        </p>
      ) : (
        <ManageSubscriptionButton />
      );
    }
    if (source === "apple" || source === "play") {
      const storeName = source === "apple" ? "the App Store" : "Google Play";
      return native ? (
        <button
          type="button"
          onClick={openStoreSubscriptions}
          className="w-full border border-ink/20 py-3 text-ink font-medium hover:bg-paper transition"
        >
          Manage subscription
        </button>
      ) : (
        <p className="text-sm text-slate italic">
          Your subscription is managed through {storeName} on your phone.
        </p>
      );
    }
    return (
      <p className="text-sm text-slate italic">
        Subscription managed externally. Contact support to make changes.
      </p>
    );
  }

  return (
    <>
      <Link
        href="/pricing"
        className="block w-full bg-emerald text-cream py-3 font-medium text-center hover:bg-emerald/90 transition"
      >
        Go Pro
      </Link>
      {native && (
        <button
          type="button"
          onClick={restore}
          disabled={busy}
          className="mt-4 w-full text-center font-mono text-xs uppercase tracking-widest text-slate underline underline-offset-4 disabled:opacity-60"
        >
          Restore purchases
        </button>
      )}
      {notice && <p className="mt-3 text-sm text-burgundy">{notice}</p>}
    </>
  );
}

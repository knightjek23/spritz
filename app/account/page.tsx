// /account — signed-in user settings.
//
// Server Component for the read side (pulls plan, email, member-since,
// collection size, scan count from Supabase). Interactive bits — manage
// subscription redirect, sign out — live in components/account-actions.
//
// Auth-gated: redirects to /sign-in if the user isn't signed in.
//
// What's here:
//   - Plan card (Free / Pro) with manage-or-upgrade CTA
//   - Usage stats (collection size, scans this month)
//   - Account info (email, member since)
//   - Account actions (manage profile in Clerk, sign out)
//
// What's intentionally NOT here:
//   - Identity / password / 2FA — Clerk has a hosted page for that. We
//     link out instead of reimplementing it.

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ManageSubscriptionButton, SignOutButton } from "@/components/account-actions";

// Don't cache — plan + usage stats should be fresh on every visit.
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses[0]?.emailAddress ?? "Not set";

  const supabase = createAdminClient();

  // App user record — the source of truth for plan + stripe linkage.
  const { data: appUser } = await supabase
    .from("users")
    .select("id, plan, stripe_customer_id, created_at")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  const plan = (appUser?.plan ?? "free") as "free" | "pro";
  const memberSince = appUser?.created_at ?? null;
  const hasStripeCustomer = !!appUser?.stripe_customer_id;

  // Usage stats — collection size + scans in the trailing 30 days. Both
  // are cheap count queries; index-served at our scale.
  const [{ count: collectionCount }, { count: scanCount30d }] = await Promise.all([
    supabase
      .from("collection_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", appUser?.id ?? ""),
    supabase
      .from("scan_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", appUser?.id ?? "")
      .gte(
        "created_at",
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      ),
  ]);

  return (
    <div className="mx-auto max-w-md px-6 py-10">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          Account
        </p>
        <h1 className="font-display text-4xl mt-2 leading-[0.95]">Settings</h1>
      </header>

      {/* Plan card */}
      <section className="mb-8">
        <div
          className={`rounded-2xl p-6 ${
            plan === "pro"
              ? "border-2 border-emerald bg-emerald/5"
              : "border border-ink/15 bg-cream"
          }`}
        >
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-slate">
                Current plan
              </p>
              <h2 className="font-display text-3xl mt-1">
                {plan === "pro" ? "Spritz Pro" : "Free"}
              </h2>
            </div>
            {plan === "pro" && (
              <span className="px-2 py-1 rounded-full bg-emerald text-cream text-[10px] font-mono uppercase tracking-wider">
                Active
              </span>
            )}
          </div>

          {plan === "pro" ? (
            <>
              <p className="text-sm text-slate mb-5 leading-relaxed">
                AI-generated dupes, full editorial encyclopedia, expanded
                similar-fragrance results, and unlimited collection.
              </p>
              {hasStripeCustomer ? (
                <ManageSubscriptionButton />
              ) : (
                <p className="text-sm text-slate italic">
                  Subscription managed externally. Contact support to make changes.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-slate mb-5 leading-relaxed">
                You&apos;re on the free plan. Pro unlocks AI dupes, full
                encyclopedia depth, and an unlimited collection.
              </p>
              <Link
                href="/pricing"
                className="block w-full bg-emerald text-cream py-3 rounded-xl font-medium text-center hover:bg-emerald/90 transition"
              >
                Go Pro
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Usage */}
      <section className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate mb-3">
          Usage
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-ink/10 p-4">
            <p className="font-display text-3xl">{collectionCount ?? 0}</p>
            <p className="text-xs text-slate mt-1">
              In collection
              {plan === "free" && (
                <span className="block mt-0.5 text-[10px] font-mono uppercase tracking-wider">
                  of 25 free cap
                </span>
              )}
            </p>
          </div>
          <div className="rounded-xl border border-ink/10 p-4">
            <p className="font-display text-3xl">{scanCount30d ?? 0}</p>
            <p className="text-xs text-slate mt-1">
              Scans
              <span className="block mt-0.5 text-[10px] font-mono uppercase tracking-wider">
                last 30 days
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* Account info */}
      <section className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate mb-3">
          Account
        </p>
        <dl className="rounded-xl border border-ink/10 divide-y divide-ink/5">
          <div className="flex items-baseline justify-between px-4 py-3 gap-3">
            <dt className="font-mono text-[10px] uppercase tracking-widest text-slate shrink-0">
              Email
            </dt>
            <dd className="text-sm text-ink truncate text-right">{email}</dd>
          </div>
          {memberSince && (
            <div className="flex items-baseline justify-between px-4 py-3 gap-3">
              <dt className="font-mono text-[10px] uppercase tracking-widest text-slate shrink-0">
                Member since
              </dt>
              <dd className="text-sm text-ink">
                {new Date(memberSince).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                })}
              </dd>
            </div>
          )}
        </dl>
        <p className="mt-3 text-xs text-slate">
          Need to change your email or password? Use the{" "}
          <span className="text-emerald">profile button</span> in the top-right
          of any page (powered by Clerk).
        </p>
      </section>

      {/* Actions */}
      <section className="mb-4">
        <p className="font-mono text-xs uppercase tracking-widest text-slate mb-3">
          Session
        </p>
        <SignOutButton />
      </section>

      {/* Footer note — feedback / support */}
      <p className="mt-10 text-center text-xs font-mono uppercase tracking-widest text-slate">
        Questions? Email <a href="mailto:hi@spritz.app" className="text-emerald">hi@spritz.app</a>
      </p>
    </div>
  );
}

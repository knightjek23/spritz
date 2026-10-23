// /account/history — every day the user logged what they wore.
//
// Server Component. Days newest first; a row opens the fragrance page,
// the × removes the entry (components/wear-history-list handles that).
// "Most worn" at the top: the three bottles worn on the most days in the
// last 90 days. Empty state points back to the home prompt.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { wearHistory, mostWorn } from "@/lib/wear-log";
import { BottleImage } from "@/components/bottle-image";
import { WearHistoryList } from "@/components/wear-history-list";

export const metadata: Metadata = {
  title: "Fragrance history",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function WearHistoryPage() {
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  const { data: appUser } = await createAdminClient()
    .from("users")
    .select("id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  const entries = appUser ? await wearHistory(appUser.id) : [];
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const top = mostWorn(entries, since);
  const dayCount = new Set(entries.map((e) => e.wornOn)).size;

  return (
    <article className="mx-auto max-w-md px-6 py-10">
      <p className="mb-4">
        <Link
          href="/account"
          className="font-mono text-xs uppercase tracking-widest text-slate hover:text-ink"
        >
          ← Account
        </Link>
      </p>

      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">
          {dayCount === 0 ? "Nothing logged yet" : `${dayCount} day${dayCount === 1 ? "" : "s"} logged`}
        </p>
        <h1 className="font-display text-5xl mt-2 leading-[0.95]">Fragrance history</h1>
      </header>

      {entries.length === 0 ? (
        <section className="mb-10">
          <p className="text-sm text-slate leading-relaxed mb-4">
            Each day, pick what you&apos;re wearing from the top of the home screen. It
            lands here, so you can look back at what you reached for and when.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald text-cream font-medium hover:bg-emerald/90 transition"
          >
            Log today&apos;s fragrance
          </Link>
        </section>
      ) : (
        <>
          {top.length > 0 && (
            <section className="mb-10">
              <h2 className="font-display text-2xl mb-1">Most worn</h2>
              <p className="text-sm text-slate mb-4">Last 90 days, by days worn.</p>
              <ul className="grid grid-cols-3 gap-3">
                {top.map(({ fragrance: f, count }) => (
                  <li key={f.id}>
                    <Link href={`/fragrance/${f.id}`} className="group block">
                      <div className="relative w-full aspect-[3/4] rounded-xl bg-paper border border-ink/10 overflow-hidden group-hover:brightness-95 transition">
                        <BottleImage
                          src={f.bottle_image_url}
                          house={f.house}
                          name={f.name}
                          sizes="120px"
                          className="object-contain p-2 mix-blend-multiply"
                        />
                      </div>
                      <div className="mt-2 text-sm font-medium leading-tight line-clamp-2">{f.name}</div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-slate mt-0.5">
                        {count} day{count === 1 ? "" : "s"}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <WearHistoryList initial={entries} />
        </>
      )}
    </article>
  );
}

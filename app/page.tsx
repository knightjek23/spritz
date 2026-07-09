// Home — branches on auth + collection emptiness.
//
//   Signed-out OR signed-in with no `own` items → MarketingHome
//     (static, SEO-friendly, two big CTAs).
//   Signed-in with at least one `own` fragrance → ForYouFeed
//     (personalized recommendations grounded in their shelf).
//
// Server Component. NOTE: because this page calls auth(), Next renders it
// per-request (a route-level `revalidate` would be silently ignored —
// auth() reads request headers, which opts the route out of static/ISR).
// The render itself is cheap, though: every data surface MarketingHome
// touches (trending feeds, trending RPC, catalog scrollers) is wrapped in
// unstable_cache, so an anonymous request is an auth check plus cache
// reads — not the 30-50 Supabase round trips it used to be.
//
// Note: SEO crawlers never see the personalized variant — they hit the
// route without auth cookies, so they always get MarketingHome. The page
// remains indexable.

import { auth } from "@clerk/nextjs/server";
import { getRecommendations } from "@/lib/recommendations";
import { ForYouFeed } from "@/components/for-you-feed";
import { MarketingHome } from "@/components/marketing-home";

export default async function HomePage() {
  const { userId } = auth();

  // Not signed in → marketing. Skip the Supabase round-trip entirely.
  if (!userId) {
    return <MarketingHome />;
  }

  const recs = await getRecommendations(userId);

  // Signed in but no `own` items yet (skipped onboarding, hasn't saved
  // anything from a scan) → still show the marketing home. They can do
  // /welcome again from there if they want a guided start.
  if (recs.ownedCount === 0) {
    return <MarketingHome />;
  }

  return <ForYouFeed data={recs} />;
}

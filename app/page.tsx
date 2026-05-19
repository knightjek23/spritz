// Home — branches on auth + collection emptiness.
//
//   Signed-out OR signed-in with no `own` items → MarketingHome
//     (static, SEO-friendly, two big CTAs).
//   Signed-in with at least one `own` fragrance → ForYouFeed
//     (personalized recommendations grounded in their shelf).
//
// Server Component. Anonymous renders are essentially static (no Supabase
// call). Signed-in renders fetch the user's collection + similarity data
// inline; cached by Next on a short TTL since collections don't churn fast.
//
// Note: SEO crawlers never see the personalized variant — they hit the
// route without auth cookies, so they always get MarketingHome. The page
// remains indexable.

import { auth } from "@clerk/nextjs/server";
import { getRecommendations } from "@/lib/recommendations";
import { ForYouFeed } from "@/components/for-you-feed";
import { MarketingHome } from "@/components/marketing-home";

// Soft revalidation — personalized data can be a minute stale without
// users noticing. Keeps the signed-in path fast.
export const revalidate = 60;

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

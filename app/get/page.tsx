import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { captureServer } from "@/lib/posthog-server";
import {
  APPLE_APP_ID,
  appStoreUrl,
  cleanSource,
  detectPlatform,
  playStoreUrl,
  type Platform,
} from "@/lib/store-links";

// Smart link for socials: spritzofficial.app/get?src=ig_bio
// iPhone -> App Store, Android -> Google Play, everything else -> this page.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Get Spritz",
  description: "The fragrance library in your pocket. Free on iPhone and Android.",
  robots: { index: false, follow: true },
  openGraph: {
    title: "Get Spritz",
    description: "Scan any bottle and learn everything about it. Free on iPhone and Android.",
    url: "https://spritzofficial.app/get",
  },
};

async function trackClick(src: string, platform: Platform, userAgent: string) {
  const capture = captureServer(`get-link-${crypto.randomUUID()}`, "get_link_click", {
    src,
    platform,
    $user_agent: userAgent,
    $process_person_profile: false,
  });
  // Never hold the redirect up more than 400 ms for analytics.
  await Promise.race([capture, new Promise((resolve) => setTimeout(resolve, 400))]);
}

export default async function GetPage({
  searchParams,
}: {
  searchParams: { src?: string | string[] };
}) {
  const rawSrc = Array.isArray(searchParams.src) ? searchParams.src[0] : searchParams.src;
  const src = cleanSource(rawSrc);
  const userAgent = headers().get("user-agent") ?? "";
  const platform = detectPlatform(userAgent);

  await trackClick(src, platform, userAgent);

  // redirect() throws, so it must sit outside any try/catch.
  if (platform === "android") redirect(playStoreUrl(src));
  if (platform === "ios" && APPLE_APP_ID) redirect(appStoreUrl(src));

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#F0EEE9] px-6 py-16 text-center text-[#2C2C2A]">
      <h1 className="text-4xl font-semibold tracking-tight">Get Spritz</h1>
      <p className="mt-3 max-w-sm text-base text-[#78766F]">
        Scan any bottle and learn everything about it. Free on iPhone and Android.
      </p>

      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        {APPLE_APP_ID ? (
          <a
            href={appStoreUrl(src)}
            className="flex h-11 items-center justify-center rounded-full bg-[#0057FF] px-6 text-base font-medium text-white"
          >
            Download on the App Store
          </a>
        ) : null}
        <a
          href={playStoreUrl(src)}
          className="flex h-11 items-center justify-center rounded-full border border-[#2C2C2A] px-6 text-base font-medium"
        >
          Get it on Google Play
        </a>
      </div>

      <p className="mt-8 text-sm text-[#78766F]">
        On a computer? Open <span className="font-medium text-[#2C2C2A]">spritzofficial.app/get</span> on
        your phone.
      </p>
    </main>
  );
}

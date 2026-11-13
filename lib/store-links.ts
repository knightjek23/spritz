/**
 * Store links for the /get smart link.
 *
 * APPLE_APP_ID is Spritz: Fragrance Guide (id6807149616); the env var only overrides it.
 * APPLE_PROVIDER_TOKEN is optional: App Store Connect > Analytics > Sources >
 * Campaigns > "Generate a Campaign Link" shows it as pt=XXXXXX. With it,
 * downloads from each ?src= show up as their own campaign in App Store Connect.
 */
export const APPLE_APP_ID = process.env.NEXT_PUBLIC_APPLE_APP_ID || "6807149616";
// pt=129384522 is Spritz's App Store Connect provider token; the env var only overrides it.
export const APPLE_PROVIDER_TOKEN = process.env.APPLE_PROVIDER_TOKEN || "129384522";
export const ANDROID_PACKAGE = "app.spritzofficial";

export type Platform = "ios" | "android" | "desktop";

/** Only short, safe campaign names get through to the store URLs. */
export function cleanSource(raw: string | null | undefined): string {
  const src = (raw ?? "").trim().toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(src) ? src : "direct";
}

export function detectPlatform(userAgent: string): Platform {
  const ua = userAgent.toLowerCase();
  // Check Android first: some Android in-app browsers mention "like iPhone".
  if (ua.includes("android")) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  return "desktop";
}

export function appStoreUrl(src: string): string {
  const url = new URL(`https://apps.apple.com/app/id${APPLE_APP_ID}`);
  if (APPLE_PROVIDER_TOKEN) {
    url.searchParams.set("pt", APPLE_PROVIDER_TOKEN);
    url.searchParams.set("ct", src);
    url.searchParams.set("mt", "8");
  }
  return url.toString();
}

export function playStoreUrl(
  src: string,
  { medium = "social", campaign = "get_link" }: { medium?: string; campaign?: string } = {},
): string {
  const url = new URL("https://play.google.com/store/apps/details");
  url.searchParams.set("id", ANDROID_PACKAGE);
  // Play reads this as the install referrer (Play Console > Acquisition).
  url.searchParams.set(
    "referrer",
    `utm_source=${src}&utm_medium=${medium}&utm_campaign=${campaign}`,
  );
  return url.toString();
}

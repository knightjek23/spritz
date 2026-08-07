/** @type {import('next').NextConfig} */
//
// OneDrive note: Next's distDir must be relative to the project root, so we
// can't redirect the build cache off the synced volume via config. The
// supported workaround is a Windows junction from .next → a folder outside
// OneDrive (e.g. mklink /J .next C:\NextBuilds\spritz-next). Documented in
// SETUP.md.
const nextConfig = {
  reactStrictMode: true,
  // /encyclopedia → /library rename (2026-07-05). Permanent redirect so
  // any pre-rename link, bookmark, or crawled URL keeps working.
  async redirects() {
    return [
      {
        source: "/encyclopedia",
        destination: "/library",
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      // Supabase storage for scan images + fragrance bottle thumbnails.
      { protocol: "https", hostname: "*.supabase.co" },
      // fimgs.net (Fragrantica CDN): allowed in the optimizer ONLY so the
      // temporary NEXT_PUBLIC_SHOW_SCRAPED_IMAGES review window can render
      // them. Display is gated in lib/bottle-image.ts, so with the flag
      // off nothing actually requests these. Remove this entry at launch
      // once licensed / user-uploaded images have backfilled the catalog.
      { protocol: "https", hostname: "fimgs.net" },
      { protocol: "https", hostname: "*.fimgs.net" },
      // Licensed affiliate-feed image hosts. These are the images we DO
      // have rights to display (via the CJ affiliate agreements), so they
      // stay after fimgs.net is removed at launch. Add a hostname here
      // whenever a new retailer feed is backfilled.
      { protocol: "https", hostname: "www.fragranceshop.com" },
      { protocol: "https", hostname: "fragranceshop.com" },
      { protocol: "https", hostname: "*.perfumania.com" },
      { protocol: "https", hostname: "perfumania.com" },
      { protocol: "https", hostname: "*.jomashop.com" },
      { protocol: "https", hostname: "jomashop.com" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb", // scan images
    },
    // The trending sections read data/*.json at request time via fs. Next won't
    // trace dynamically-read files into the serverless bundle on its own, so on
    // Vercel the loader would get ENOENT and the sections would silently hide.
    // Force the feed files into the bundle for the home routes that render them.
    // (Files are a few KB each; the overhead is negligible.)
    outputFileTracingIncludes: {
      "/": ["./data/*.json"],
      "/**": ["./data/*.json"],
    },
  },
};

export default nextConfig;

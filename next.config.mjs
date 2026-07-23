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
      // fimgs.net (Fragrantica CDN) removed pre-launch: hotlinking their
      // copyrighted bottle photos is legal exposure. The optimizer now
      // refuses fimgs URLs; the app falls back to house initials until
      // licensed (affiliate-feed) images backfill bottle_image_url.
      // Add retailer/CDN hostnames here when those feeds are wired up.
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

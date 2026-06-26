/** @type {import('next').NextConfig} */
//
// OneDrive note: Next's distDir must be relative to the project root, so we
// can't redirect the build cache off the synced volume via config. The
// supported workaround is a Windows junction from .next → a folder outside
// OneDrive (e.g. mklink /J .next C:\NextBuilds\spritz-next). Documented in
// SETUP.md.
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // Supabase storage for scan images + fragrance bottle thumbnails.
      { protocol: "https", hostname: "*.supabase.co" },
      // Fragrantica CDN — bottle images during v1. Mirror to Supabase Storage in v1.5.
      { protocol: "https", hostname: "fimgs.net" },
      { protocol: "https", hostname: "*.fimgs.net" },
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

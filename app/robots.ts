// app/robots.ts — Next 14 native robots.txt.
//
// Open the marketing + encyclopedia surfaces. Block the user-specific and
// payment surfaces so they don't end up indexed (they require auth and
// would just produce sign-in walls in Google's index).

import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",          // never serve API endpoints to crawlers
          "/collection",    // user-specific
          "/sign-in",       // auth flow
          "/sign-up",       // auth flow
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}

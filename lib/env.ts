// Fail-fast environment validation. Imported once from app/layout.tsx so a
// production deploy with missing critical env vars dies loudly at boot
// instead of failing silently downstream (the worst case: NEXT_PUBLIC_APP_URL
// unset → sitemap.xml and robots.txt quietly emit localhost URLs and the
// site never gets indexed).
//
// Fatal ONLY on Vercel production (VERCEL_ENV === "production" — set during
// both the build and at runtime). Everywhere else — local dev, local
// `next build` (which also runs with NODE_ENV=production), previews — it
// warns, so a laptop build against a localhost .env.local still works.

import "server-only";

const REQUIRED_IN_PRODUCTION = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "OPENAI_API_KEY",
] as const;

const isVercelProduction = process.env.VERCEL_ENV === "production";

const problems: string[] = [];

const missing = REQUIRED_IN_PRODUCTION.filter((k) => !process.env[k]);
if (missing.length > 0) {
  problems.push(`missing required environment variables: ${missing.join(", ")}`);
}

if (process.env.NEXT_PUBLIC_APP_URL?.includes("localhost") && isVercelProduction) {
  problems.push(
    "NEXT_PUBLIC_APP_URL points at localhost in production — sitemap/robots/OG URLs would all be wrong",
  );
}

if (problems.length > 0) {
  const message = `[env] ${problems.join("; ")}`;
  if (isVercelProduction) {
    throw new Error(message);
  }
  console.warn(`${message} (continuing — not a Vercel production deploy)`);
}

export {};

// Server-side Supabase client (Server Components, Route Handlers, Server Actions).
// Uses the anon key + (optionally) a Clerk JWT — RLS enforced.
// For service-role / privileged work (webhook handlers, scraper upload) use ./admin.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

export async function createClient() {
  const cookieStore = cookies();

  // Try to inject the Clerk JWT so Supabase RLS sees auth.jwt() ->> 'sub'.
  // Two normal failure modes — neither should crash the page:
  //   1. User isn't signed in → no session, getToken throws.
  //   2. The "supabase" JWT template hasn't been configured in Clerk yet.
  // Both fall through to anonymous Supabase access, which is fine for public
  // reads (fragrances, dupe_pairs). Owner-only writes still require auth and
  // will fail at the RLS policy level if the token is missing.
  let supabaseToken: string | null = null;
  try {
    const { getToken } = auth();
    supabaseToken = await getToken({ template: "supabase" });
  } catch (err) {
    // Log once per request without flooding — useful for spotting misconfigured
    // Clerk templates in production logs without breaking anonymous browsing.
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[supabase/server] getToken({ template: 'supabase' }) failed — " +
        "falling back to anonymous Supabase client. " +
        "Configure the 'supabase' JWT template in Clerk to enable RLS-bound user reads. " +
        `(${err instanceof Error ? err.message : String(err)})`,
      );
    }
  }

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>,
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components can't set cookies — ignore.
          }
        },
      },
      global: supabaseToken
        ? { headers: { Authorization: `Bearer ${supabaseToken}` } }
        : undefined,
    },
  );
}

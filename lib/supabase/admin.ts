// Service-role Supabase client. Bypasses RLS. SERVER ONLY.
// Use for: webhook handlers, scraper uploads, scheduled jobs (dupe pre-compute).
// NEVER import this from a client component or expose its key to the browser.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

let cachedAdmin: SupabaseClient<Database> | null = null;

export function createAdminClient(): SupabaseClient<Database> {
  if (cachedAdmin) return cachedAdmin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "createAdminClient: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  cachedAdmin = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
}

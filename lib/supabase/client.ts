// Browser-side Supabase client. RLS enforced via Clerk JWT.
// Use in client components. For server, use ./server. For admin, use ./admin.

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

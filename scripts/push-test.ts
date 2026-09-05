/**
 * Send a real scan follow-up push to one user, right now.
 *
 *   npm run push:test -- --email you@example.com
 *   npm run push:test -- --email you@example.com --dry
 *
 * Uses the user's most recent matched scan regardless of age and ignores
 * the daily cap, so the whole round trip (APNs -> device -> tap -> opened_at)
 * can be shown working without waiting for tomorrow's cron. Everything
 * else is the production code path in lib/push-scan-followup.ts.
 *
 * Needs .env.local with the APNS_* vars and APNS_ENV matching the build on
 * the phone: "sandbox" for an Xcode install, "production" for TestFlight.
 */

import fs from "node:fs";
import { createRequire } from "node:module";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!m) continue;
  const value = m[2].trim().replace(/^["']|["']$/g, "");
  if (value) process.env[m[1]] = value;
}

// Same server-only stub as scripts/test-account-purge.ts; see the note there.
const req = createRequire(process.cwd() + "/package.json");
try {
  const p = req.resolve("server-only");
  req.cache[p] = {
    id: p,
    filename: p,
    loaded: true,
    exports: {},
    children: [],
    paths: [],
  } as unknown as ReturnType<typeof createRequire>["cache"][string];
} catch {
  /* not installed */
}

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env.local`);
  return v;
}

async function main() {
  const email = arg("email");
  const userArg = arg("user");
  const dry = process.argv.includes("--dry");
  if (!email && !userArg) {
    console.error("usage: npm run push:test -- --email you@example.com [--dry]");
    console.error("       npm run push:test -- --user <users.id uuid>   [--dry]");
    process.exit(2);
  }

  // Two key formats exist. Legacy JWT keys carry a `role` claim; this
  // project has them disabled ("Legacy API keys are disabled"). The current
  // format is a plain string: sb_secret_... is the service-role equivalent,
  // sb_publishable_... is the anon equivalent and returns empty results
  // under RLS instead of an error, which looks exactly like an empty table.
  const serviceKey = need("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey.startsWith("sb_publishable_")) {
    console.error(
      "SUPABASE_SERVICE_ROLE_KEY is a publishable key. Use the sb_secret_... key from " +
        "Supabase > Settings > API keys.",
    );
    process.exit(1);
  }
  if (serviceKey.startsWith("eyJ")) {
    try {
      const claims = JSON.parse(Buffer.from(serviceKey.split(".")[1], "base64url").toString());
      if (claims.role !== "service_role") {
        console.error(`Legacy key has role "${claims.role}", not "service_role". Use the sb_secret_... key.`);
        process.exit(1);
      }
    } catch {
      /* not a JWT after all; let Supabase decide */
    }
  } else if (!serviceKey.startsWith("sb_secret_")) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is neither a legacy JWT nor an sb_secret_ key.");
    process.exit(1);
  }
  console.log(`Supabase url: ${need("NEXT_PUBLIC_SUPABASE_URL")}  key: ${serviceKey.slice(0, 10)}…`);

  const supabase = createClient<Database>(
    need("NEXT_PUBLIC_SUPABASE_URL"),
    serviceKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Email on the users row comes from the Clerk webhook and can be null
  // or differ in case, so match loosely and, on a miss, show what exists.
  let user: { id: string; email: string | null } | null = null;
  if (userArg) {
    const r = await supabase.from("users").select("id, email").eq("id", userArg).maybeSingle();
    user = r.data ?? null;
  } else if (email) {
    const r = await supabase.from("users").select("id, email").ilike("email", email).maybeSingle();
    user = r.data ?? null;
  }
  if (!user) {
    console.error(`No users row for ${userArg ?? email}. Most recent users:`);
    const { data: recent, error: recentErr, count } = await supabase
      .from("users")
      .select("id, email, clerk_user_id, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(8);
    if (recentErr) console.error(`  (users read failed: ${recentErr.message})`);
    console.error(`  users table row count: ${count ?? "unknown"}`);
    for (const u of recent ?? []) {
      console.error(`  ${u.id}  ${u.email ?? "(no email)"}  ${u.clerk_user_id}  ${u.created_at}`);
    }
    console.error("Re-run with --user <id> for the right one.");
    process.exit(1);
  }

  const { data: tokens } = await supabase
    .from("push_tokens")
    .select("platform, enabled, last_seen")
    .eq("user_id", user.id);
  console.log(`User ${user.id}`);
  console.log(`Tokens: ${JSON.stringify(tokens ?? [])}`);
  if (!tokens?.some((t) => t.enabled)) {
    console.error("No enabled token. Open the app, scan a bottle, tap Yes on the primer.");
    process.exit(1);
  }

  const { data: scan } = await supabase
    .from("scan_events")
    .select("id, matched_fragrance_id, created_at")
    .eq("user_id", user.id)
    .not("matched_fragrance_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  console.log(`Latest matched scan: ${JSON.stringify(scan)}`);
  if (!scan) {
    console.error("No matched scan for this user. Scan a bottle first.");
    process.exit(1);
  }

  console.log(`APNS_ENV=${process.env.APNS_ENV ?? "sandbox"}`);
  if (dry) {
    console.log("--dry: stopping before send.");
    return;
  }

  const { runScanFollowup } = await import("../lib/push-scan-followup");
  const result = await runScanFollowup({ onlyUserId: user.id, now: true });
  console.log(JSON.stringify(result, null, 2));
  if (result.sent === 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

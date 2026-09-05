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
  const dry = process.argv.includes("--dry");
  if (!email) {
    console.error("usage: npm run push:test -- --email you@example.com [--dry]");
    process.exit(2);
  }

  const supabase = createClient<Database>(
    need("NEXT_PUBLIC_SUPABASE_URL"),
    need("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: user } = await supabase
    .from("users")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();
  if (!user) {
    console.error(`No users row with email ${email}`);
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

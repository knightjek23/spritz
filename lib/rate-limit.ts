// Per-IP / per-user scan rate limit. PRD §7.
// In-memory implementation for v1 — single Vercel instance per region is fine
// at expected v1 traffic. Swap to Upstash Redis if we shard.

import { createAdminClient } from "./supabase/admin";
import crypto from "crypto";

const ANON_LIMIT = parseInt(process.env.SCAN_RATE_LIMIT_ANON ?? "10", 10);
const FREE_LIMIT = parseInt(process.env.SCAN_RATE_LIMIT_FREE ?? "50", 10);

export function hashIp(ip: string, salt = "cologne-scan-app"): string {
  return crypto.createHash("sha256").update(`${ip}:${salt}`).digest("hex");
}

interface CheckParams {
  userId: string | null;   // app users.id (UUID), null if anon
  isPro: boolean;
  ipHash: string;
}

export async function checkScanRateLimit(
  params: CheckParams,
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  if (params.isPro) return { allowed: true, remaining: Infinity, limit: Infinity };

  const limit = params.userId ? FREE_LIMIT : ANON_LIMIT;
  const supabase = createAdminClient();

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0); // reset daily at UTC midnight

  let query = supabase
    .from("scan_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since.toISOString());

  query = params.userId
    ? query.eq("user_id", params.userId)
    : query.eq("ip_hash", params.ipHash);

  const { count, error } = await query;
  if (error) {
    // Fail open — better to let a scan through than break the app on a DB hiccup.
    console.error("checkScanRateLimit query error", error);
    return { allowed: true, remaining: limit, limit };
  }

  const used = count ?? 0;
  return { allowed: used < limit, remaining: Math.max(0, limit - used), limit };
}

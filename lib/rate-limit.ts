// Scan rate limiting. PRD §7.
//
// DB-backed: counts today's rows in scan_events per user / per hashed IP.
// Works across serverless instances (unlike in-memory), no Redis needed
// at v1 traffic. Swap to Upstash Redis if query volume ever matters.
//
// Failure policy:
//   - Anonymous requests FAIL CLOSED on DB error. Anon scans cost real
//     OpenAI money; an attacker who can induce DB errors must not get
//     unlimited spend.
//   - Signed-in requests fail open. They're identified and capped by
//     account elsewhere; availability wins for real users.
//
// Global budget: a hard daily ceiling across ALL scans (GLOBAL_DAILY_BUDGET)
// so distributed abuse (IP rotation) can't run the OpenAI bill uncapped.
// Set an OpenAI dashboard spend limit as the backstop.

import { createAdminClient } from "./supabase/admin";
import crypto from "crypto";

const ANON_LIMIT = parseInt(process.env.SCAN_RATE_LIMIT_ANON ?? "10", 10);
const FREE_LIMIT = parseInt(process.env.SCAN_RATE_LIMIT_FREE ?? "50", 10);
// Pro is NOT truly unlimited: GPT-4o vision is the priciest AI call, so a
// single Pro user (or a stolen Pro login) with no cap could drain the whole
// global budget and run up the API bill. 300/day is far above any real human
// use — it functions as an anti-abuse ceiling, not a product limit.
const PRO_LIMIT = parseInt(process.env.SCAN_RATE_LIMIT_PRO ?? "300", 10);
const GLOBAL_DAILY_BUDGET = parseInt(
  process.env.SCAN_GLOBAL_DAILY_BUDGET ?? "2000",
  10,
);

// Salt kept as the legacy app name — changing it would orphan existing
// ip_hash values in scan_events (quota resets + broken analytics joins).
export function hashIp(ip: string, salt = "cologne-scan-app"): string {
  return crypto.createHash("sha256").update(`${ip}:${salt}`).digest("hex");
}

function utcMidnight(): string {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0); // reset daily at UTC midnight
  return since.toISOString();
}

interface CheckParams {
  userId: string | null; // app users.id (UUID), null if anon
  isPro: boolean;
  ipHash: string;
}

export async function checkScanRateLimit(
  params: CheckParams,
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const limit = params.isPro
    ? PRO_LIMIT
    : params.userId
      ? FREE_LIMIT
      : ANON_LIMIT;
  const supabase = createAdminClient();
  const since = utcMidnight();

  // Global budget first — applies to everyone, including Pro. This is a
  // spend ceiling, not a user quota; it should only trip under abuse.
  const { count: globalCount, error: globalErr } = await supabase
    .from("scan_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);

  if (globalErr) {
    console.error("checkScanRateLimit global query error", globalErr);
    if (!params.userId) return { allowed: false, remaining: 0, limit };
  } else if ((globalCount ?? 0) >= GLOBAL_DAILY_BUDGET) {
    console.error(
      `Global daily scan budget hit (${globalCount}/${GLOBAL_DAILY_BUDGET})`,
    );
    return { allowed: false, remaining: 0, limit };
  }

  // Per-user (or per-IP for anon) daily quota. This now applies to Pro too,
  // against the higher PRO_LIMIT — Pro is generous, not infinite.
  let query = supabase
    .from("scan_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);

  query = params.userId
    ? query.eq("user_id", params.userId)
    : query.eq("ip_hash", params.ipHash);

  const { count, error } = await query;
  if (error) {
    console.error("checkScanRateLimit query error", error);
    // Anon: fail closed (uncapped OpenAI spend risk). Signed-in: fail open.
    if (!params.userId) return { allowed: false, remaining: 0, limit };
    return { allowed: true, remaining: limit, limit };
  }

  const used = count ?? 0;
  return { allowed: used < limit, remaining: Math.max(0, limit - used), limit };
}

// ---------------------------------------------------------------------------
// Lightweight per-instance IP throttle for cheap public endpoints
// (/api/search, /api/scan/[id]/report). In-memory, so it's per serverless
// instance — not a hard guarantee, but it blunts single-source DoS and
// costs nothing. These endpoints don't spend money, so best-effort is the
// right trade. Don't use this for anything that costs money — use
// checkScanRateLimit for that.
// ---------------------------------------------------------------------------

const buckets = new Map<string, { count: number; resetAt: number }>();
const BUCKET_SWEEP_AT = 5000; // prevent unbounded growth

export function checkIpThrottle(
  key: string,
  maxPerWindow: number,
  windowMs = 60_000,
): boolean {
  const now = Date.now();

  if (buckets.size > BUCKET_SWEEP_AT) {
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= maxPerWindow;
}

/** Client IP for rate limiting. Trustworthy on Vercel (platform overwrites
 *  x-forwarded-for); if self-hosting behind another proxy, revisit. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0"
  );
}

// ---------------------------------------------------------------------------
// Per-user ceiling on paid AI *generation* (AI dupes + consensus).
//
// These endpoints call a model ONLY on a cache miss, and results are cached
// globally per fragrance — so total lifetime spend is already bounded by the
// catalog size (each fragrance is generated once, ever). What this guards is
// *burst* abuse: a single Pro account scripting generation across the whole
// catalog in a short window. In-memory / per-instance is a proportionate
// trade here (no new table, no DB round-trip on the hot path). The hard
// backstop for total spend is a dashboard spend limit on the model provider
// (OpenAI today; Anthropic if you migrate) — set one.
// ---------------------------------------------------------------------------

const AI_GEN_LIMIT = parseInt(process.env.AI_GEN_RATE_LIMIT ?? "20", 10);
const AI_GEN_WINDOW_MS =
  parseInt(process.env.AI_GEN_RATE_WINDOW_MIN ?? "10", 10) * 60_000;

/** Returns true if this user may trigger another paid AI generation now.
 *  Keyed by app user id (UUID). Call only on the cache-miss path, right
 *  before the model call. */
export function checkAiGenLimit(userId: string): boolean {
  return checkIpThrottle(`aigen:${userId}`, AI_GEN_LIMIT, AI_GEN_WINDOW_MS);
}

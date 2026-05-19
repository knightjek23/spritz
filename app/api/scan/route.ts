// POST /api/scan
// Body: { image: base64-encoded JPEG/PNG }
// Two-layer architecture (PRD §7):
//   Layer 1: vision OCR → brand + name
//   Layer 2: fuzzy text match against fragrances table
// Returns top match (or top-3 candidates if confidence < 0.7).
// Logs every attempt to scan_events for the accuracy metric.

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readBottle } from "@/lib/vision";
import { checkScanRateLimit, hashIp } from "@/lib/rate-limit";
import type { Fragrance, ScanResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({
  image: z.string().min(100), // base64
});

const AUTOMATCH_THRESHOLD = 0.7;

export async function POST(req: Request) {
  const t0 = Date.now();

  // Parse + validate
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Identity + rate limit
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
  const ipHash = hashIp(ip);
  const { userId: clerkUserId } = auth();

  const supabase = createAdminClient();
  let appUserId: string | null = null;
  let isPro = false;
  if (clerkUserId) {
    const { data: u } = await supabase
      .from("users")
      .select("id, plan")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();
    if (u) {
      appUserId = u.id;
      isPro = u.plan === "pro";
    }
  }

  const rate = await checkScanRateLimit({ userId: appUserId, isPro, ipHash });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate_limited", limit: rate.limit, remaining: 0 },
      { status: 429 },
    );
  }

  // Layer 1: vision
  const read = await readBottle(parsed.data.image);

  // Layer 2: fuzzy text match
  let matched: Fragrance | null = null;
  let candidates: Array<{ fragrance: Fragrance; confidence: number }> = [];

  if (read.brand && read.name) {
    // Trigram similarity against name + house. pg_trgm `%` operator + similarity().
    // Returns ranked candidates; auto-select if top similarity ≥ 0.7.
    const { data: rows } = await supabase
      .rpc("search_fragrances", {
        p_brand: read.brand,
        p_name: read.name,
        p_limit: 3,
      })
      .returns<Array<Fragrance & { match_score: number }>>();

    if (rows && rows.length > 0) {
      candidates = rows.map((r) => ({ fragrance: r, confidence: r.match_score }));
      const top = candidates[0];
      if (top.confidence >= AUTOMATCH_THRESHOLD) matched = top.fragrance;
    }
  }

  // Log scan_event
  const { data: event } = await supabase
    .from("scan_events")
    .insert({
      user_id: appUserId,
      ip_hash: ipHash,
      detected_brand: read.brand,
      detected_name: read.name,
      matched_fragrance_id: matched?.id ?? null,
      confidence: read.confidence,
      vision_provider: read.provider,
      latency_ms: Date.now() - t0,
    })
    .select("id")
    .single();

  const result: ScanResult = {
    matched,
    candidates,
    confidence: read.confidence,
    detected_brand: read.brand,
    detected_name: read.name,
    scan_event_id: event?.id ?? "",
  };

  return NextResponse.json(result);
}

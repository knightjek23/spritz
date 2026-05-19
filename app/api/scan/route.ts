// POST /api/scan
// Body: { image: base64-encoded JPEG/PNG }
//
// Three-stage scan architecture (PRD §7, extended):
//   Layer 1a — vision OCR:           GPT-4o reads brand + name from label
//   Layer 2  — fuzzy text match:     trigram lookup against fragrances
//   Layer 1b — visual disambiguation: only when text is ambiguous, send
//              the user photo + top candidate bottle images back to GPT-4o
//              and let it pick the best visual match. Picks up shape /
//              color / cap / contour signals that OCR misses.
//
// Logs every attempt to scan_events for the accuracy metric.

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readBottle, disambiguateByImage } from "@/lib/vision";
import { checkScanRateLimit, hashIp } from "@/lib/rate-limit";
import type { Fragrance, ScanResult } from "@/lib/types";

export const runtime = "nodejs";
// Visual disambiguation adds an extra ~3-6s of model latency on top of the
// OCR pass, so we bump the function timeout. Still well inside Vercel's
// hobby tier limit.
export const maxDuration = 45;

const Body = z.object({
  image: z.string().min(100), // base64
});

// Auto-match if text-OCR alone yields a candidate with this similarity.
// Below this, we fall through to visual disambiguation.
const TEXT_AUTOMATCH_THRESHOLD = 0.85;
// Surface a candidate at this minimum even after disambiguation —
// otherwise we'd offer matches we don't have any real confidence in.
const MINIMUM_CANDIDATE_FLOOR = 0.4;
// How many candidates to consider for visual disambiguation. More =
// better recall but linear cost increase (each image is a separate input).
const DISAMBIGUATE_CANDIDATE_COUNT = 5;

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

  // ============== Layer 1a: OCR ==============
  const read = await readBottle(parsed.data.image);

  // ============== Layer 2: text-based candidate lookup ==============
  // Pull DISAMBIGUATE_CANDIDATE_COUNT rows so the disambiguator has
  // material to work with if we end up needing it. The fast path only
  // looks at the top one, so the extra rows are cheap insurance.
  let matched: Fragrance | null = null;
  let candidates: Array<{ fragrance: Fragrance; confidence: number }> = [];
  let matchMethod: ScanResult["match_method"] = "none";
  let visualReason: string | undefined;

  if (read.brand && read.name) {
    const { data: rows } = await supabase
      .rpc("search_fragrances", {
        p_brand: read.brand,
        p_name: read.name,
        p_limit: DISAMBIGUATE_CANDIDATE_COUNT,
      })
      .returns<Array<Fragrance & { match_score: number }>>();

    if (rows && rows.length > 0) {
      candidates = rows.map((r) => ({ fragrance: r, confidence: r.match_score }));
      const top = candidates[0];

      // ============== Fast path: high-confidence text match ==============
      if (top.confidence >= TEXT_AUTOMATCH_THRESHOLD) {
        matched = top.fragrance;
        matchMethod = "text";
      }

      // ============== Layer 1b: visual disambiguation ==============
      // Trigger only when we have multiple plausible candidates and at
      // least one has a bottle image to compare against. Skipped on
      // hopeless reads (top below the floor) and confident reads (above
      // the auto-match threshold).
      else if (top.confidence >= MINIMUM_CANDIDATE_FLOOR) {
        const withImages = candidates
          .map((c, i) => ({
            index: i,
            brand: c.fragrance.house,
            name: c.fragrance.name,
            bottleImageUrl: c.fragrance.bottle_image_url ?? "",
          }))
          .filter((c) => c.bottleImageUrl.length > 0);

        if (withImages.length >= 2) {
          const dis = await disambiguateByImage(parsed.data.image, withImages);
          if (
            dis.matchIndex !== null &&
            dis.matchIndex >= 0 &&
            dis.matchIndex < withImages.length
          ) {
            // dis.matchIndex is an index into withImages, NOT the original
            // candidates array — map it back via the .index field we stored.
            const originalIndex = withImages[dis.matchIndex].index;
            matched = candidates[originalIndex].fragrance;
            matchMethod = "visual";
            visualReason = dis.reason || undefined;

            // Boost the chosen candidate to the top so the response surfaces
            // it as the primary match. Useful for clients that render the
            // candidate list as a disambiguation picker.
            if (originalIndex !== 0) {
              const chosen = candidates.splice(originalIndex, 1)[0];
              candidates.unshift(chosen);
            }
          }
        }
      }
    }
  }

  // ============== Log scan_event ==============
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
    match_method: matchMethod,
    ...(visualReason ? { visual_reason: visualReason } : {}),
  };

  return NextResponse.json(result);
}

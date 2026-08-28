// POST /api/scan
// Body: { image: base64-encoded JPEG/PNG }
//
// Scan v2 (SCAN_V2_DESIGN.md). Three signals, fused:
//   OCR           GPT reads brand + name off the label            (lib/vision.ts)
//   text match    trigram lookup, search_fragrances RPC            (0004)
//   visual match  bottle-embedding cosine kNN, match_bottle_images (0023)
// plus two narrow fallbacks: a GPT-4o tiebreaker for same-house near-ties,
// and (flag-gated) a Google Lens web lookup when the catalog has nothing.
//
// The embedding call starts at t=0 alongside OCR, so the visual layer adds
// ~0 wall-clock. Every external call has a hard timeout (§2.2).
//
// Two response modes, decided by the Accept header:
//   application/x-ndjson  → streamed stage frames (lib/scan-stages.ts), the
//                           client renders a Dynamic Checklist and prefetches
//                           candidate pages before the verdict lands.
//   anything else         → the plain JSON ScanResult (Capacitor shell, old
//                           clients). Same pipeline, no frames.
//
// Logs every attempt to scan_events (after the response, via waitUntil) for
// the accuracy metric and threshold calibration.

import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { auth } from "@clerk/nextjs/server";
import { waitUntil } from "@vercel/functions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, ScanEventCandidate } from "@/lib/supabase/database.types";
import {
  readBottle,
  disambiguateByImage,
  isVisionTimeout,
  TIEBREAK_MAX_CANDIDATES,
  type VisionRead,
} from "@/lib/vision";
import { embedImage, normalizeVisual, visualProvider } from "@/lib/image-embed";
import { storeScanImage } from "@/lib/scan-image-store";
import {
  lookupBottleOnWeb,
  webLookupEnabled,
  cleanTitle,
  WEB_DAILY_BUDGET,
} from "@/lib/web-lookup";
import { checkScanRateLimit, hashIp, clientIp } from "@/lib/rate-limit";
import type { ScanErrorCode, ScanFrame } from "@/lib/scan-stages";
import type {
  Fragrance,
  ScanCandidate,
  ScanMatchMethod,
  ScanResult,
} from "@/lib/types";

export const runtime = "nodejs";
// Worst case is OCR (9 s) + tiebreaker (6 s) + web lookup (8 s) + DB. The
// per-call timeouts are what keep a normal scan far below this.
export const maxDuration = 45;

const Body = z.object({
  // Base64 image. The client normalizes to ≤1024 px JPEG (~250 KB) before
  // sending; the cap protects self-hosted deployments from memory/cost
  // bombs and the charset check rejects non-base64 before OpenAI sees it.
  image: z
    .string()
    .min(100)
    .max(8_000_000)
    .regex(/^[A-Za-z0-9+/=]+$/, "not base64"),
});

// ---------------------------------------------------------------------------
// Thresholds (§4.4). All env-tunable; calibrate from scripts/scan-eval.ts.
// ---------------------------------------------------------------------------
const num = (k: string, d: number) => {
  const v = parseFloat(process.env[k] ?? "");
  return Number.isFinite(v) ? v : d;
};
// Text alone is confident above this.
const TEXT_AUTOMATCH = num("SCAN_TEXT_AUTOMATCH", 0.85);
// Below this, text candidates are noise; don't fuse, don't show.
const TEXT_FLOOR = num("SCAN_TEXT_FLOOR", 0.4);
// Fused score needed to auto-match when text was ambiguous.
const FUSED_AUTOMATCH = num("SCAN_FUSED_AUTOMATCH", 0.75);
// Weight of the text signal in the fused score (visual gets 1 - this).
// 0.75 until the visual layer is calibrated on real scans: with Voyage's
// compressed cosine range (a typical WRONG bottle scores 0.82, same-house
// wrong neighbours reach 0.94 at p90, measured 2026-08-26 on the catalog)
// the visual term may break near-ties but must not override a clear read.
const TEXT_WEIGHT = num("SCAN_FUSE_TEXT_WEIGHT", 0.75);
// Visual-only auto-match (label unreadable): raw cosine + margin over #2.
// 0.97 sits above the catalog's wrong-neighbour p90 (0.944); duplicate
// product photos across rows (p99 = 1.0) are caught by the margin. In
// practice this means "show the picker", which is the safe default.
const VISUAL_AUTOMATCH = num("SCAN_VISUAL_AUTOMATCH", 0.97);
const VISUAL_MARGIN = num("SCAN_VISUAL_MARGIN", 0.03);
// Tiebreaker fires when fused top-2 are within this and share a house.
const TIEBREAK_GAP = num("SCAN_TIEBREAK_GAP", 0.05);

const TEXT_CANDIDATES = 5;
const VISUAL_CANDIDATES = 5;
const MAX_RETURNED = 5;

// ---------------------------------------------------------------------------
// Catalog size for the "Matching against N fragrances" line. Cached per
// instance for an hour; the copy degrades to "every fragrance" if the
// count isn't in yet, it never blocks the scan.
// ---------------------------------------------------------------------------
let catalogCount: { n: number; at: number } | null = null;
async function getCatalogCount(supabase: SupabaseClient<Database>): Promise<number | null> {
  if (catalogCount && Date.now() - catalogCount.at < 3_600_000) return catalogCount.n;
  const { count } = await supabase
    .from("fragrances")
    .select("id", { count: "exact", head: true });
  if (typeof count === "number") catalogCount = { n: count, at: Date.now() };
  return catalogCount?.n ?? null;
}

class ScanError extends Error {
  constructor(public code: ScanErrorCode) {
    super(code);
  }
}

// ---------------------------------------------------------------------------
// The pipeline. `emit` receives stage frames as they happen; the JSON mode
// passes a no-op.
// ---------------------------------------------------------------------------
interface Ctx {
  supabase: SupabaseClient<Database>;
  image: string;
  appUserId: string | null;
  ipHash: string;
  t0: number;
}

type Scored = ScanCandidate & { fused: number };

async function runScan(ctx: Ctx, emit: (f: ScanFrame) => void): Promise<ScanResult> {
  const { supabase, image } = ctx;
  const eventId = randomUUID();

  // Kick off everything that doesn't depend on OCR. The embedding usually
  // lands before OCR does; the count is a warm-cache hit after the first scan.
  const visualEnabled = visualProvider() !== null;
  const embeddingP = visualEnabled ? embedImage(image) : Promise.resolve(null);
  const countP = getCatalogCount(supabase).catch(() => null);

  emit({ type: "stage", stage: "reading" });
  let read: VisionRead;
  try {
    read = await readBottle(image);
  } catch (err) {
    if (isVisionTimeout(err)) throw new ScanError("ocr_timeout");
    console.error("[scan] ocr failed", err);
    throw new ScanError("ocr_failed");
  }
  const textOk = !!(read.brand && read.name);
  emit({ type: "stage", stage: "read", ok: textOk, brand: read.brand, name: read.name });

  // ---- text candidates ----------------------------------------------------
  const byId = new Map<string, Scored>();
  if (textOk) {
    emit({
      type: "stage",
      stage: "matching",
      name: read.name!,
      catalog_size: await countP,
    });
    const { data: rows, error } = await supabase
      .rpc("search_fragrances", {
        p_brand: read.brand!,
        p_name: read.name!,
        p_limit: TEXT_CANDIDATES,
      })
      .returns<Array<Fragrance & { match_score: number }>>();
    if (error) throw new ScanError("catalog_unreachable");
    for (const r of rows ?? []) {
      if (r.match_score < TEXT_FLOOR) continue;
      const { match_score, ...fragrance } = r;
      byId.set(r.id, {
        fragrance: fragrance as Fragrance,
        confidence: match_score,
        text_score: match_score,
        fused: match_score,
      });
    }
    if (byId.size > 0) {
      emit({
        type: "candidates",
        items: [...byId.values()].map((c) => ({
          id: c.fragrance.id,
          name: c.fragrance.name,
          house: c.fragrance.house,
        })),
      });
    }
  }
  const textTop = [...byId.values()].sort((a, b) => b.text_score! - a.text_score!)[0] ?? null;

  // ---- visual candidates --------------------------------------------------
  const embedding = await embeddingP;
  let visualTop: { id: string; sim: number; second: number } | null = null;
  if (embedding) {
    // Scope to the house the label named when the text layer confirmed it
    // exists in the catalog. That's the flanker/concentration case.
    const house = textTop?.fragrance.house ?? null;
    emit({ type: "stage", stage: "comparing", house });

    let rows = await knn(supabase, embedding.vector, house);
    if (house && rows.length === 0) rows = await knn(supabase, embedding.vector, null);

    if (rows.length > 0) {
      visualTop = {
        id: rows[0].fragrance_id,
        sim: rows[0].similarity,
        second: rows[1]?.similarity ?? 0,
      };
      // Fetch full rows for visual-only candidates that text didn't surface.
      const missing = rows.map((r) => r.fragrance_id).filter((id) => !byId.has(id));
      const full = missing.length
        ? await supabase.from("fragrances").select("*").in("id", missing)
        : { data: [] as Fragrance[] };
      const fullById = new Map((full.data ?? []).map((f) => [f.id, f as Fragrance]));

      for (const r of rows) {
        const existing = byId.get(r.fragrance_id);
        if (existing) {
          existing.visual_score = r.similarity;
        } else {
          const f = fullById.get(r.fragrance_id);
          if (!f) continue;
          byId.set(r.fragrance_id, {
            fragrance: f,
            confidence: 0,
            visual_score: r.similarity,
            fused: 0,
          });
        }
      }
    }
  }

  // ---- fuse ---------------------------------------------------------------
  // When the visual layer ran, every candidate is scored on the same
  // TEXT_WEIGHT·t + (1−TEXT_WEIGHT)·v scale with a missing side counted as
  // 0, so a shape-only hit can't outrank a label+shape hit just by having
  // one fewer term. When it didn't run (no key, provider down, 0023 not
  // pushed), fused == text so the text thresholds keep their meaning.
  const visualRan = !!embedding && visualTop !== null;
  for (const c of byId.values()) {
    const t = c.text_score ?? 0;
    const v = c.visual_score != null ? normalizeVisual(c.visual_score) : 0;
    c.fused = visualRan ? TEXT_WEIGHT * t + (1 - TEXT_WEIGHT) * v : t;
    c.confidence = c.fused;
  }
  let ranked = [...byId.values()].sort((a, b) => b.fused - a.fused);

  let matched: Fragrance | null = null;
  let method: ScanMatchMethod = "none";
  let visualReason: string | undefined;
  let partial: ScanResult["partial"];

  if (ranked.length > 0) {
    const top = ranked[0];
    const second = ranked[1];

    if (textOk && textTop && textTop.text_score! >= TEXT_AUTOMATCH) {
      // Rule 1: confident text. Visual can only re-rank within the fused
      // score; if it moved something else to the top, say so.
      matched = top.fragrance;
      method = top.fragrance.id === textTop.fragrance.id ? "text" : "text+visual";
    } else if (textOk && textTop && top.fused >= FUSED_AUTOMATCH) {
      // Rule 2: ambiguous text, fused score carries it.
      matched = top.fragrance;
      method = "text+visual";
    } else if (!textOk && visualTop && top.visual_score != null) {
      // Rule 3: label unreadable, bottle alone.
      if (
        top.visual_score >= VISUAL_AUTOMATCH &&
        top.visual_score - (second?.visual_score ?? 0) >= VISUAL_MARGIN
      ) {
        matched = top.fragrance;
        method = "visual";
      }
      partial = "label_unreadable";
    }

    // Rule 4: tiebreaker. Fused top-2 within a hair, same house, both have
    // catalog images. One GPT-4o look at ≤3 bottles, 6 s cap.
    if (
      second &&
      top.fused - second.fused < TIEBREAK_GAP &&
      top.fragrance.house === second.fragrance.house &&
      (matched || top.fused >= TEXT_FLOOR)
    ) {
      const pool = ranked
        .slice(0, TIEBREAK_MAX_CANDIDATES)
        .map((c, i) => ({
          index: i,
          brand: c.fragrance.house,
          name: c.fragrance.name,
          bottleImageUrl: c.fragrance.bottle_image_url ?? "",
        }))
        .filter((c) => c.bottleImageUrl.length > 0);
      if (pool.length >= 2) {
        emit({ type: "stage", stage: "deciding" });
        const dis = await disambiguateByImage(image, pool);
        if (dis.matchIndex !== null && dis.matchIndex < pool.length) {
          const chosen = ranked[pool[dis.matchIndex].index];
          matched = chosen.fragrance;
          method = "tiebreak";
          visualReason = dis.reason || undefined;
          ranked = [chosen, ...ranked.filter((c) => c !== chosen)];
        }
      }
    }
  }

  // ---- web fallback (Phase 3, flag-gated) ----------------------------------
  let webLookup = false;
  if (!matched && webLookupEnabled() && ctx.appUserId && (await webBudgetOk(supabase))) {
    emit({ type: "stage", stage: "web" });
    webLookup = true;
    const web = await lookupBottleOnWeb(supabase, image, eventId);
    const guesses = [web?.entity, ...(web?.titles ?? [])]
      .filter((t): t is string => !!t)
      .map(cleanTitle)
      .filter((t) => t.length >= 4)
      .slice(0, 4);
    for (const guess of guesses) {
      // Whole title in both slots: the trigram scorer weights name 0.65 and
      // house 0.35, and a retail title contains both.
      const { data: rows } = await supabase
        .rpc("search_fragrances", { p_brand: guess, p_name: guess, p_limit: 1 })
        .returns<Array<Fragrance & { match_score: number }>>();
      const hit = rows?.[0];
      if (hit && hit.match_score >= TEXT_AUTOMATCH) {
        const { match_score, ...fragrance } = hit;
        matched = fragrance as Fragrance;
        method = "web";
        ranked = [
          { fragrance: matched, confidence: match_score, text_score: match_score, fused: match_score },
          ...ranked.filter((c) => c.fragrance.id !== hit.id),
        ];
        break;
      }
    }
    // Even on a miss, the best web title is a better catalog-gap report
    // than "null null".
    if (!matched && !textOk && guesses[0]) {
      read = { ...read, name: guesses[0] };
    }
  }

  // ---- log (after the response) -------------------------------------------
  const candidatesLog: ScanEventCandidate[] = ranked.slice(0, 10).map((c) => ({
    fragrance_id: c.fragrance.id,
    text_score: c.text_score ?? null,
    visual_score: c.visual_score ?? null,
    fused: round(c.fused),
  }));
  const insert = (async () => {
    // Retain the scan frame (private `scan-images` bucket, 30-day purge) so
    // a bad match can be diagnosed later and a good bottle shot can be
    // reviewed into the catalog. Runs inside waitUntil with the log write,
    // so it never adds latency to the user's scan, and a failed upload just
    // leaves image_url null rather than failing the whole event.
    const imagePath = await storeScanImage(supabase, eventId, ctx.image);
    const { error } = await supabase.from("scan_events").insert({
      id: eventId,
      user_id: ctx.appUserId,
      ip_hash: ctx.ipHash,
      image_url: imagePath,
      detected_brand: read.brand,
      detected_name: read.name,
      matched_fragrance_id: matched?.id ?? null,
      confidence: read.confidence,
      vision_provider: read.provider,
      latency_ms: Date.now() - ctx.t0,
      match_method: method,
      candidates: candidatesLog,
      visual_provider: embedding?.provider ?? null,
      web_lookup: webLookup,
    });
    if (error) console.error("[scan] scan_events insert failed", error.message);
  })();
  waitUntil(insert);

  return {
    matched,
    candidates: ranked.slice(0, MAX_RETURNED).map((c) => ({
      fragrance: c.fragrance,
      // Shape-only candidates show their own similarity (the picker labels
      // them "by bottle shape"); everything else shows the fused score.
      // Ranking is always by fused — see candidatesLog for the raw numbers.
      confidence: round(
        c.text_score == null && c.visual_score != null
          ? normalizeVisual(c.visual_score)
          : c.fused,
      ),
      ...(c.text_score != null ? { text_score: round(c.text_score) } : {}),
      ...(c.visual_score != null ? { visual_score: round(c.visual_score) } : {}),
    })),
    confidence: read.confidence,
    detected_brand: read.brand,
    detected_name: read.name,
    scan_event_id: eventId,
    match_method: method,
    ...(visualReason ? { visual_reason: visualReason } : {}),
    ...(partial ? { partial } : {}),
  };
}

async function knn(
  supabase: SupabaseClient<Database>,
  vector: number[],
  house: string | null,
) {
  const { data, error } = await supabase.rpc("match_bottle_images", {
    p_embedding: vector,
    p_limit: VISUAL_CANDIDATES,
    p_house: house,
  });
  if (error) {
    // The visual layer never fails a scan. Most likely cause: migration
    // 0023 not pushed yet.
    console.warn("[scan] match_bottle_images failed:", error.message);
    return [];
  }
  return data ?? [];
}

async function webBudgetOk(supabase: SupabaseClient<Database>): Promise<boolean> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("scan_events")
    .select("id", { count: "exact", head: true })
    .eq("web_lookup", true)
    .gte("created_at", since.toISOString());
  return (count ?? 0) < WEB_DAILY_BUDGET;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  const t0 = Date.now();
  const wantsStream = (req.headers.get("accept") ?? "").includes("application/x-ndjson");

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const ipHash = hashIp(clientIp(req));
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

  const ctx: Ctx = { supabase, image: parsed.data.image, appUserId, ipHash, t0 };

  // ---- JSON mode ------------------------------------------------------------
  if (!wantsStream) {
    try {
      const result = await runScan(ctx, () => {});
      return NextResponse.json(result);
    } catch (err) {
      const code = err instanceof ScanError ? err.code : "scan_failed";
      if (code === "scan_failed") console.error("scan failed", err);
      return NextResponse.json({ error: code }, { status: code === "ocr_timeout" ? 504 : 500 });
    }
  }

  // ---- streaming mode -------------------------------------------------------
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (f: ScanFrame) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(f) + "\n"));
        } catch {
          /* client went away */
        }
      };
      try {
        const result = await runScan(ctx, emit);
        emit({ type: "result", result });
      } catch (err) {
        const code = err instanceof ScanError ? err.code : "scan_failed";
        if (code === "scan_failed") console.error("scan failed", err);
        emit({ type: "error", code });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      // Tell Vercel's edge and any proxy not to buffer the body.
      "x-accel-buffering": "no",
    },
  });
}

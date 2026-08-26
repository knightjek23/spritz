// GET /api/scan/[id]
//
// The audit-trail half of scan v2 (SCAN_V2_DESIGN.md §3.3). Returns a past
// scan's stored candidates in ScanResult shape so two surfaces can show
// the "why" after the live checklist is gone:
//   - the receipt on /fragrance/[id]?scan=<id>  ("Matched by label text +
//     bottle shape · Not it? See 4 other close matches")
//   - /scan?event=<id>, which re-renders the picker from this payload
//
// No auth: scan_event ids are unguessable UUIDs and the payload is public
// catalog data plus the OCR read. Nothing about the user is returned.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Fragrance, ScanMatchMethod, ScanResult } from "@/lib/types";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const supabase = createAdminClient();

  const { data: ev } = await supabase
    .from("scan_events")
    .select(
      "id, detected_brand, detected_name, matched_fragrance_id, confidence, match_method, candidates",
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!ev) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const logged = ev.candidates ?? [];
  const ids = logged.map((c) => c.fragrance_id);
  if (ev.matched_fragrance_id && !ids.includes(ev.matched_fragrance_id)) {
    ids.unshift(ev.matched_fragrance_id);
  }

  const { data: rows } = ids.length
    ? await supabase.from("fragrances").select("*").in("id", ids)
    : { data: [] as Fragrance[] };
  const byId = new Map((rows ?? []).map((f) => [f.id, f as Fragrance]));

  const candidates: ScanResult["candidates"] = logged
    .map((c) => {
      const fragrance = byId.get(c.fragrance_id);
      if (!fragrance) return null;
      return {
        fragrance,
        confidence: c.fused,
        ...(c.text_score != null ? { text_score: c.text_score } : {}),
        ...(c.visual_score != null ? { visual_score: c.visual_score } : {}),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const result: ScanResult = {
    matched: ev.matched_fragrance_id ? (byId.get(ev.matched_fragrance_id) ?? null) : null,
    candidates,
    confidence: ev.confidence ?? 0,
    detected_brand: ev.detected_brand,
    detected_name: ev.detected_name,
    scan_event_id: ev.id,
    match_method: (ev.match_method as ScanMatchMethod | null) ?? "none",
  };

  return NextResponse.json(result, {
    headers: { "cache-control": "private, max-age=300" },
  });
}

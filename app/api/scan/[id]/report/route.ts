// POST /api/scan/[id]/report
//
// User correction for a scan_event that didn't match anything in the catalog.
// Body: { brand?: string, name?: string }. Both optional but at least one
// must be present after trim.
//
// We don't require auth — the value of catalog-expansion signal is higher
// than the cost of letting anonymous users submit corrections. The route
// validates the scan_event_id exists and was unmatched (can't "correct" a
// successful scan), so the abuse surface is small.

import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIpThrottle, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const Body = z.object({
  brand: z.string().trim().max(120).optional(),
  name: z.string().trim().max(120).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  // Best-effort throttle: this writes catalog-expansion signal, so keep
  // one source from poisoning it in bulk. Legit users submit ~1 per scan.
  if (!checkIpThrottle(`report:${clientIp(req)}`, 10)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const brand = parsed.data.brand?.trim() || null;
  const name = parsed.data.name?.trim() || null;

  // At least one field must be present — empty submissions tell us nothing.
  if (!brand && !name) {
    return NextResponse.json(
      { error: "brand_or_name_required" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Verify the scan_event exists AND was an unmatched scan. Reporting a
  // correction on a successful match doesn't make sense and is the most
  // likely abuse vector.
  const { data: event, error: fetchErr } = await supabase
    .from("scan_events")
    .select("id, matched_fragrance_id")
    .eq("id", params.id)
    .maybeSingle();

  if (fetchErr || !event) {
    return NextResponse.json({ error: "scan_not_found" }, { status: 404 });
  }
  if (event.matched_fragrance_id) {
    return NextResponse.json(
      { error: "scan_already_matched" },
      { status: 409 },
    );
  }

  const { error: updErr } = await supabase
    .from("scan_events")
    .update({
      user_reported_brand: brand,
      user_reported_name: name,
      user_reported_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

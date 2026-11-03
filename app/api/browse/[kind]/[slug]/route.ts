// GET /api/browse/note/<slug>?offset=50
// GET /api/browse/family/<slug>?offset=50
//
// The next page of a note or family list for the "See more" button
// (components/browse-list.tsx). Public catalog data, same as the pages
// themselves, so no auth. Cached at the edge for 5 minutes, matching the
// pages' revalidate, so a burst of taps on a popular note costs one query.

import { NextResponse } from "next/server";
import { fetchFamilyPage, fetchNotePage } from "@/lib/browse-pages";

export async function GET(
  req: Request,
  { params }: { params: { kind: string; slug: string } },
) {
  const offset = Number(new URL(req.url).searchParams.get("offset") ?? "0");
  try {
    const page =
      params.kind === "note"
        ? await fetchNotePage(params.slug, offset)
        : params.kind === "family"
          ? await fetchFamilyPage(params.slug, offset)
          : null;
    if (!page) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(page, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

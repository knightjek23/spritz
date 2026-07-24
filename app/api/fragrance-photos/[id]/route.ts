// POST /api/fragrance-photos/[id]
//
// Accepts a user-uploaded photo of the bottle for fragrance [id]. Stores it
// in the "user-bottle-images" Storage bucket and records a row in
// fragrance_photos as status='pending'. Nothing is shown publicly until a
// human approves it (see migration 0020), which keeps unreviewed user
// content off the catalog.
//
// This is the foundation for owning our image library: legally clean,
// fully-owned photos that need no license from anyone.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 30;

const BUCKET = "user-bottle-images";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  // 1. Must be signed in.
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // 2. Fragrance must exist.
  const { data: frag } = await supabase
    .from("fragrances")
    .select("id")
    .eq("id", params.id)
    .maybeSingle();
  if (!frag) {
    return NextResponse.json({ error: "fragrance_not_found" }, { status: 404 });
  }

  // 3. Read the uploaded file.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const file = form.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_photo" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "unsupported_type", message: "JPEG, PNG, or WebP only." },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: "Photos must be under 5 MB." },
      { status: 413 },
    );
  }

  // 4. Store it. Path namespaces by fragrance + user + timestamp so uploads
  //    never collide and are easy to trace back.
  const ext =
    file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const storagePath = `${params.id}/${userId}-${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (upErr) {
    console.error("[fragrance-photos] storage upload failed:", upErr.message);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }

  // 5. Record it as pending moderation.
  const { error: insErr } = await supabase.from("fragrance_photos").insert({
    fragrance_id: params.id,
    clerk_user_id: userId,
    storage_path: storagePath,
  });
  if (insErr) {
    console.error("[fragrance-photos] db insert failed:", insErr.message);
    return NextResponse.json({ error: "record_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: "pending" });
}

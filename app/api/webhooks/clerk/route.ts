// POST /api/webhooks/clerk
// Mirrors Clerk users into our public.users table.
// Configure in Clerk dashboard → Webhooks → endpoint = /api/webhooks/clerk
// Subscribe to: user.created, user.updated, user.deleted.

import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { createAdminClient } from "@/lib/supabase/admin";
import { SCAN_IMAGE_BUCKET } from "@/lib/web-lookup";

export const runtime = "nodejs";

const SECRET = process.env.CLERK_WEBHOOK_SECRET ?? "";

interface ClerkUserEvent {
  type: "user.created" | "user.updated" | "user.deleted";
  data: {
    id: string;
    email_addresses?: Array<{ email_address: string; id: string }>;
    primary_email_address_id?: string | null;
  };
}

export async function POST(req: Request) {
  const svix_id = req.headers.get("svix-id");
  const svix_timestamp = req.headers.get("svix-timestamp");
  const svix_signature = req.headers.get("svix-signature");
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json({ error: "missing_svix_headers" }, { status: 400 });
  }

  const payload = await req.text();
  let event: ClerkUserEvent;
  try {
    const wh = new Webhook(SECRET);
    event = wh.verify(payload, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as ClerkUserEvent;
  } catch (err) {
    console.error("Clerk webhook signature failed", err);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const clerkId = event.data.id;
  const primaryEmailId = event.data.primary_email_address_id;
  const email =
    event.data.email_addresses?.find((e) => e.id === primaryEmailId)?.email_address ??
    event.data.email_addresses?.[0]?.email_address ??
    null;

  if (event.type === "user.created" || event.type === "user.updated") {
    // Upsert by clerk_user_id. We use Clerk's id as the primary key shape;
    // since Clerk gives us strings like "user_xxx" we generate a UUID and store
    // the raw Clerk id as clerk_user_id.
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("clerk_user_id", clerkId)
      .maybeSingle();

    if (existing) {
      await supabase.from("users").update({ email }).eq("id", existing.id);
    } else {
      await supabase
        .from("users")
        .insert({ id: crypto.randomUUID(), clerk_user_id: clerkId, email, plan: "free" });
    }
  } else if (event.type === "user.deleted") {
    // Order matters. scan_events.user_id is `on delete set null`, so once the
    // users row goes, every photo that person ever scanned becomes unlinkable
    // to them — and since scan photos are now retained indefinitely, that
    // means permanently undeletable. Delete the photos FIRST, while we can
    // still find them, or the deletion promise in /legal/privacy is a lie.
    const { data: u } = await supabase
      .from("users")
      .select("id")
      .eq("clerk_user_id", clerkId)
      .maybeSingle();

    if (u) {
      const { data: scans } = await supabase
        .from("scan_events")
        .select("id, image_url")
        .eq("user_id", u.id)
        .not("image_url", "is", null)
        .returns<Array<{ id: string; image_url: string }>>();

      const paths = (scans ?? []).map((s) => s.image_url);
      if (paths.length > 0) {
        // Best effort, in batches. A storage failure must not block the
        // account deletion itself.
        for (let i = 0; i < paths.length; i += 100) {
          const { error: rmErr } = await supabase.storage
            .from(SCAN_IMAGE_BUCKET)
            .remove(paths.slice(i, i + 100));
          if (rmErr) console.error("[clerk] scan photo delete failed", rmErr.message);
        }
        await supabase
          .from("scan_events")
          .update({ image_url: null })
          .eq("user_id", u.id);
      }
    }

    await supabase.from("users").delete().eq("clerk_user_id", clerkId);
  }

  return NextResponse.json({ received: true });
}

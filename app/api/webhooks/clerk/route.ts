// POST /api/webhooks/clerk
// Mirrors Clerk users into our public.users table.
// Configure in Clerk dashboard → Webhooks → endpoint = /api/webhooks/clerk
// Subscribe to: user.created, user.updated, user.deleted.

import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { createAdminClient } from "@/lib/supabase/admin";

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
    await supabase.from("users").delete().eq("clerk_user_id", clerkId);
  }

  return NextResponse.json({ received: true });
}

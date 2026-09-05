-- =====================================================================
-- 0028 — Push notifications (slice 5). Design:
--   docs/superpowers/specs/2026-09-04-slice-5-push-ios-design.md
--
-- push_tokens: one row per device token. Cascades with the user so account
-- deletion (lib/account-deletion.ts) takes them with the users row.
--
-- push_sends: one row per notification actually handed to APNs/FCM. This is
-- what makes two things real that would otherwise be vibes: the one-per-
-- user-per-day cap (the job reads it) and the "push -> session" metric in
-- the one-pager (the open handler stamps opened_at on it).
-- =====================================================================

create table if not exists public.push_tokens (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  token       text not null unique,
  platform    text not null check (platform in ('ios', 'android')),
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

create index if not exists push_tokens_user_enabled_idx
  on public.push_tokens (user_id) where enabled;

create table if not exists public.push_sends (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references public.users(id) on delete cascade,
  token_id       uuid references public.push_tokens(id) on delete set null,
  campaign       text not null,
  fragrance_id   uuid references public.fragrances(id) on delete set null,
  scan_event_id  uuid references public.scan_events(id) on delete set null,
  sent_at        timestamptz not null default now(),
  apns_status    int,
  apns_reason    text,
  opened_at      timestamptz
);

create index if not exists push_sends_user_sent_idx
  on public.push_sends (user_id, sent_at desc);

-- Service role only. Neither table is read by the browser directly; the
-- API routes use the admin client, same as scan_events.
alter table public.push_tokens enable row level security;
alter table public.push_sends  enable row level security;

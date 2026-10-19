-- 0036_wear_log.sql
--
-- "What are you wearing today?" — one row per (user, fragrance, local day).
-- A day can hold more than one bottle (layering) but never the same bottle
-- twice. worn_on is the user's local calendar day, sent by the client; the
-- server never derives it from now() because a 11pm log in California must
-- not land on tomorrow.
--
-- Read by the home prompt (today's rows) and /account/history (all rows,
-- newest day first). Written by POST /api/wear, which also requires the
-- fragrance to be on the user's Owned shelf at the time of logging.

create table if not exists public.wear_log (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,
  fragrance_id  uuid not null references public.fragrances(id) on delete cascade,
  worn_on       date not null,
  created_at    timestamptz not null default now(),
  unique (user_id, fragrance_id, worn_on)
);

create index if not exists wear_log_user_day_idx
  on public.wear_log (user_id, worn_on desc, created_at desc);

alter table public.wear_log enable row level security;
-- All access goes through the server's service_role client; no policies
-- for anon/authenticated, same posture as collection_items.

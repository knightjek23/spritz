-- 0038_pro_features.sql
--
-- Plumbing for the four Pro features shipped together (Oct 2026):
-- match score, compare, layering, wear insights.
--
-- feature_uses — free-tier weekly caps. One row per (user, feature, key).
--   feature: 'match' | 'compare'. key: the fragrance id (match) or the
--   sorted "a:b" pair (compare). Re-opening the same key never spends a
--   use because the row already exists; the cap counts rows whose
--   used_on falls in the trailing 7 days (client's local day, same rule
--   as wear_log). Pro users never write here.
--
-- collection_items.price_paid_cents — optional, entered by the user in the
--   collection sheet. Drives cost per wear in Insights. Null = not entered,
--   and the UI hides cost per wear for that bottle.
--
-- wear_log.compliments — "got a compliment" tap counter on a day's entry.

create table if not exists public.feature_uses (
  user_id   uuid not null references public.users(id) on delete cascade,
  feature   text not null check (feature in ('match', 'compare')),
  key       text not null,
  used_on   date not null,
  primary key (user_id, feature, key)
);

create index if not exists feature_uses_user_feature_day_idx
  on public.feature_uses (user_id, feature, used_on desc);

alter table public.feature_uses enable row level security;
-- Service-role only, same posture as wear_log.

alter table public.collection_items
  add column if not exists price_paid_cents integer
  check (price_paid_cents is null or (price_paid_cents >= 0 and price_paid_cents <= 10000000));

alter table public.wear_log
  add column if not exists compliments smallint not null default 0
  check (compliments >= 0 and compliments <= 99);

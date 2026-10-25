-- 0037_trial.sql
--
-- 7-day Pro trial visibility (design approved 2026-10-25).
--
-- trial_ends_at: set when a subscription arrives in its free intro period
-- (Stripe `trialing`, RevenueCat period_type TRIAL), cleared the moment it
-- converts, is cancelled, or expires. The trial push campaign sends only
-- while this is non-null, so clearing it is the whole "stop reminding"
-- mechanism. trial_used_at: first trial start, kept forever, so the gates
-- stop offering a free week to someone who already had one.

alter table public.users
  add column if not exists trial_ends_at timestamptz,
  add column if not exists trial_used_at timestamptz;

create index if not exists users_trial_ends_at_idx
  on public.users (trial_ends_at)
  where trial_ends_at is not null;

comment on column public.users.trial_ends_at is
  'End of the current free Pro trial; null when not trialing (converted, cancelled, expired).';
comment on column public.users.trial_used_at is
  'When this user first started a free Pro trial; never cleared.';

-- Lifetime Pro purchasers (one-time $89 payment).
--
-- Entitlement still rides on users.plan = 'pro' so every existing gate
-- (API routes, Clerk publicMetadata checks) keeps working unchanged. This
-- flag marks that Pro access as PERMANENT: subscription lifecycle events
-- (notably customer.subscription.deleted) must never downgrade a lifetime
-- buyer back to free. The Stripe webhook reads/writes this column.
alter table public.users
  add column if not exists is_lifetime boolean not null default false;

comment on column public.users.is_lifetime is
  'True for one-time lifetime Pro purchasers. Protects plan=pro from being reverted by subscription events.';

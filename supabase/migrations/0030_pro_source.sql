-- =====================================================================
-- 0030: where a Pro entitlement came from.
--
-- Web subscriptions (Stripe) and store subscriptions (RevenueCat: App
-- Store, Play) both set users.plan = 'pro'. Knowing which one did lets a
-- store expiration leave a Stripe subscriber alone (and vice versa), and
-- lets the account page say "managed on the web" vs "managed through the
-- App Store" instead of "managed externally". NULL = unknown/legacy row.
-- =====================================================================

alter table public.users
  add column if not exists pro_source text
  check (pro_source in ('stripe', 'apple', 'play'));

comment on column public.users.pro_source is
  'Which billing system granted plan=pro: stripe (web), apple (App Store via RevenueCat), play (Google Play via RevenueCat). NULL for legacy rows.';

-- 0040_affiliate_click_tracking.sql
--
-- Two fixes for affiliate click tracking and the "Most shopped this month"
-- home section.
--
-- 1. affiliate_clicks.retailer was limited to scentbird / fragrancenet /
--    nordstrom. Feed offers (fragrance_offers) come from any retailer, so
--    routing them through /api/buy would have broken that check. The value
--    is now any lowercase alphanumeric slug ("fragrancenet",
--    "nicchialuxury"), which is what the route writes.
--
-- 2. most_clicked_fragrances() does the ranking in Postgres. The old code
--    pulled up to 5,000 raw click rows with no ORDER BY and counted them in
--    Node, so once a window held more than 5,000 clicks the ranking ran on
--    an arbitrary subset.

alter table public.affiliate_clicks
  drop constraint if exists affiliate_clicks_retailer_check;

alter table public.affiliate_clicks
  drop constraint if exists affiliate_clicks_retailer_slug;

alter table public.affiliate_clicks
  add constraint affiliate_clicks_retailer_slug
  check (retailer ~ '^[a-z0-9]+$');

create or replace function public.most_clicked_fragrances(
  p_days  int default 30,
  p_limit int default 12
)
returns table (fragrance_id uuid, clicks bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.fragrance_id, count(*)::bigint as clicks
  from public.affiliate_clicks c
  where c.clicked_at >= now() - make_interval(days => p_days)
  group by c.fragrance_id
  order by count(*) desc, max(c.clicked_at) desc
  limit greatest(p_limit, 0);
$$;

-- Click data is internal. Only the server (service role) reads it.
revoke all on function public.most_clicked_fragrances(int, int) from public, anon, authenticated;
grant execute on function public.most_clicked_fragrances(int, int) to service_role;

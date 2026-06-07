-- =====================================================================
-- 0010_trending_fragrances.sql
--
-- Powers the "Trending this week" surface on the home page. Aggregates
-- scan_events by matched_fragrance_id over the trailing 7 days and
-- returns the top N with fragrance details joined in.
--
-- Session 01 Finding 4: the tester anchored Pro value on
-- TikTok / Instagram / celebrity fragrances ("what famous people are
-- wearing"). The trending surface is the encyclopedia-side answer to
-- that instinct, without diluting the encyclopedia positioning by
-- explicitly chasing TikTok branding.
--
-- Scoping decisions:
--   - Only counts SUCCESSFUL scans (matched_fragrance_id IS NOT NULL).
--     A miss scan isn't a vote of interest in any specific bottle.
--   - 7-day window is the right cadence for "trending" — long enough to
--     dampen the random Tuesday spike of one user scanning a bottle
--     thirty times, short enough to actually shift week-to-week.
--   - Public RPC (anon access). The list is editorial-aggregate data,
--     not anything per-user.
-- =====================================================================

create or replace function public.list_trending_fragrances(
  p_limit int default 10,
  p_days  int default 7
)
returns table (
  id                  uuid,
  name                text,
  house               text,
  family              text[],
  gender              text,
  year                int,
  bottle_image_url    text,
  scan_count          int
)
language sql
stable
as $$
  -- Enumerated columns (not f.*) to keep the return shape stable even
  -- as the fragrances table grows new columns (e.g. note_vector at
  -- position 10 would otherwise type-mismatch).
  select
    f.id,
    f.name,
    f.house,
    f.family,
    f.gender,
    f.year,
    f.bottle_image_url,
    count(*)::int as scan_count
  from public.scan_events se
  join public.fragrances f on f.id = se.matched_fragrance_id
  where se.created_at >= now() - (p_days || ' days')::interval
    and se.matched_fragrance_id is not null
  group by
    f.id, f.name, f.house, f.family, f.gender, f.year, f.bottle_image_url
  order by scan_count desc, f.popularity_rank asc nulls last
  limit p_limit;
$$;

grant execute on function public.list_trending_fragrances(int, int)
  to anon, authenticated, service_role;

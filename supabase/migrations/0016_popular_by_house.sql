-- =====================================================================
-- 0016_popular_by_house.sql
--
-- Powers the "Most popular" by-house surface on the Encyclopedia hub:
-- the top p_houses houses, each with their p_per_house most popular
-- fragrances, in one call.
--
-- House ranking = SUM of the popularity_score of the house's 10 best
-- fragrances (decision 2026-07-04). Sum-of-top-10 is avg-of-top-10 with
-- zero-padding for houses that have fewer than 10 scored fragrances —
-- it rewards deep benches (Dior, Chanel, Tom Ford) and prevents a
-- two-fragrance house with one megahit from outranking them, without
-- excluding small houses outright.
--
-- Per-fragrance ordering inside a house uses popularity_rank (global
-- ordinal from the 0015 backfill, unique, so ordering is deterministic
-- with no explicit tie-break needed).
--
-- Depends on the popularity backfill being complete (popularity_score
-- and popularity_rank populated — verified 2026-07-04, 7113/7113).
-- Rows with NULL popularity_score are excluded so a partially-scored
-- catalog can never surface unscored rows as "popular".
--
-- Public RPC (anon access) — editorial-aggregate data, nothing per-user.
-- =====================================================================

create or replace function public.list_popular_by_house(
  p_houses    int default 5,
  p_per_house int default 10
)
returns table (
  house            text,
  house_rank       int,
  id               uuid,
  name             text,
  year             int,
  bottle_image_url text,
  popularity_rank  int,
  house_position   int
)
language sql
stable
as $$
  with per_house as (
    -- Every scored fragrance, numbered within its house by global
    -- popularity (1 = the house's most popular).
    select
      f.id,
      f.name,
      f.house,
      f.year,
      f.bottle_image_url,
      f.popularity_rank,
      f.popularity_score,
      row_number() over (
        partition by f.house
        order by f.popularity_rank asc
      ) as house_position
    from public.fragrances f
    where f.popularity_score is not null
  ),
  house_scores as (
    -- Depth score per house: sum of its 10 best fragrances' scores.
    select ph.house, sum(ph.popularity_score) as depth_score
    from per_house ph
    where ph.house_position <= 10
    group by ph.house
  ),
  top_houses as (
    select
      hs.house,
      row_number() over (
        order by hs.depth_score desc, hs.house asc
      ) as house_rank
    from house_scores hs
    order by hs.depth_score desc, hs.house asc
    limit p_houses
  )
  select
    th.house,
    th.house_rank::int,
    ph.id,
    ph.name,
    ph.year,
    ph.bottle_image_url,
    ph.popularity_rank,
    ph.house_position::int
  from top_houses th
  join per_house ph on ph.house = th.house
  where ph.house_position <= p_per_house
  order by th.house_rank asc, ph.house_position asc;
$$;

grant execute on function public.list_popular_by_house(int, int)
  to anon, authenticated, service_role;

-- Sanity check after applying (expect 50 rows: 5 houses × 10, house_rank
-- 1..5, house_position 1..10 within each):
--
-- select house, house_rank, house_position, name, popularity_rank
-- from public.list_popular_by_house()
-- order by house_rank, house_position;

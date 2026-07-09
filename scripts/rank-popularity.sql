-- rank-popularity.sql
--
-- Phase 2 of the popularity backfill: converts the AI-scored
-- popularity_score (0-10 float) into popularity_rank (integer ordinal,
-- 1 = most popular).
--
-- Run this in Supabase SQL editor AFTER scraper/src/infer-popularity.ts
-- has finished writing popularity_score for every fragrance.
--
-- Uses a CTE with row_number() so ties break deterministically by id
-- (fragrance UUIDs sort as strings — arbitrary but stable across runs).
-- Rows with NULL popularity_score sort to the end and get the highest
-- rank numbers.

with ranked as (
  select
    id,
    row_number() over (
      order by popularity_score desc nulls last, id
    ) as new_rank
  from public.fragrances
)
update public.fragrances f
set popularity_rank = ranked.new_rank
from ranked
where f.id = ranked.id;

-- Sanity check: after running, this should show 100% coverage and a
-- clean 1..N range.
--
-- select
--   count(*) as total,
--   count(popularity_rank) as has_rank,
--   min(popularity_rank) as best,
--   max(popularity_rank) as worst
-- from public.fragrances;

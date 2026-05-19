-- =====================================================================
-- 0004_search_fragrances_full_columns.sql
--
-- Why: The original search_fragrances function (migration 0001) only
-- returned a subset of fragrance columns — most importantly, it dropped
-- bottle_image_url. The typeahead and search page both expect the full
-- Fragrance shape (per lib/types Fragrance) and were rendering empty
-- thumbnail placeholders for every hit.
--
-- Fix: drop and recreate with the full column list, mirroring what
-- find_similar_fragrances (migration 0003) already returns. We also
-- include the `dupes` jsonb column added in 0002 so search results can
-- show "has dupes" badges in the future.
--
-- The signature stays the same (p_brand, p_name, p_limit), so callers
-- in /api/search and /api/scan don't need to change.
-- =====================================================================

drop function if exists public.search_fragrances(text, text, int);

create or replace function public.search_fragrances(
  p_brand text,
  p_name  text,
  p_limit int default 10
)
returns table (
  id                  uuid,
  name                text,
  house               text,
  family              text[],
  gender              text,
  year                int,
  top_notes           jsonb,
  mid_notes           jsonb,
  base_notes          jsonb,
  longevity_score     real,
  longevity_confidence real,
  sillage_score       real,
  sillage_confidence  real,
  season_tags         text[],
  time_tags           text[],
  similar_ids         uuid[],
  perfumer            text,
  house_history       text,
  wear_guidance       jsonb,
  notes_descriptions  jsonb,
  bottle_image_url    text,
  editorial_notes     text,
  fragrantica_url     text,
  avg_retail_price    numeric,
  price_tier          text,
  popularity_rank     int,
  dupes               jsonb,
  created_at          timestamptz,
  updated_at          timestamptz,
  match_score         real
)
language sql
stable
as $$
  select
    f.id, f.name, f.house, f.family, f.gender, f.year,
    f.top_notes, f.mid_notes, f.base_notes,
    f.longevity_score, f.longevity_confidence,
    f.sillage_score,   f.sillage_confidence,
    f.season_tags, f.time_tags, f.similar_ids,
    f.perfumer, f.house_history, f.wear_guidance,
    f.notes_descriptions, f.bottle_image_url, f.editorial_notes,
    f.fragrantica_url, f.avg_retail_price, f.price_tier, f.popularity_rank,
    f.dupes, f.created_at, f.updated_at,
    -- Combined similarity, weighted toward exact name match.
    (0.65 * similarity(f.name,  p_name)
   + 0.35 * similarity(f.house, p_brand))::real as match_score
  from public.fragrances f
  where f.name  % p_name
     or f.house % p_brand
  order by match_score desc
  limit p_limit;
$$;

grant execute on function public.search_fragrances(text, text, int)
  to anon, authenticated, service_role;

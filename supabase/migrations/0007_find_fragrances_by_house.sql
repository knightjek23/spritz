-- =====================================================================
-- 0007_find_fragrances_by_house.sql
--
-- Powers the new /house/[slug] page.
--
-- Slug normalization happens in the function so the call site stays
-- simple: compare a lowercased, hyphen-joined version of the row's house
-- column against the URL slug. Handles apostrophes, ampersands, and
-- spaces uniformly ("L'Atelier Cologne" → "l-atelier-cologne").
-- =====================================================================

create or replace function public.find_fragrances_by_house(
  p_slug  text,
  p_limit int default 100
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
  updated_at          timestamptz
)
language sql
stable
as $$
  -- Enumerate columns explicitly — `select f.*` would put note_vector at
  -- position 10 in the result, which collides with the declared
  -- longevity_score real at the same position (Postgres maps return-table
  -- columns positionally). We never need note_vector on the client anyway.
  select
    f.id, f.name, f.house, f.family, f.gender, f.year,
    f.top_notes, f.mid_notes, f.base_notes,
    f.longevity_score, f.longevity_confidence,
    f.sillage_score,   f.sillage_confidence,
    f.season_tags, f.time_tags, f.similar_ids,
    f.perfumer, f.house_history, f.wear_guidance,
    f.notes_descriptions, f.bottle_image_url, f.editorial_notes,
    f.fragrantica_url, f.avg_retail_price, f.price_tier, f.popularity_rank,
    f.dupes, f.created_at, f.updated_at
  from public.fragrances f
  where lower(regexp_replace(f.house, '[^a-zA-Z0-9]+', '-', 'g')) =
        lower(regexp_replace(p_slug,  '[^a-zA-Z0-9]+', '-', 'g'))
  order by f.popularity_rank asc nulls last, f.name asc
  limit p_limit;
$$;

grant execute on function public.find_fragrances_by_house(text, int)
  to anon, authenticated, service_role;


-- Companion: list every distinct house in the catalog with its count.
-- Used by /houses index to surface non-editorial houses too.
create or replace function public.list_catalog_houses(p_limit int default 500)
returns table (
  house            text,
  slug             text,
  fragrance_count  int
)
language sql
stable
as $$
  select
    f.house,
    lower(regexp_replace(f.house, '[^a-zA-Z0-9]+', '-', 'g')) as slug,
    count(*)::int as fragrance_count
  from public.fragrances f
  where f.house is not null and length(f.house) > 0
  group by f.house
  order by fragrance_count desc, f.house asc
  limit p_limit;
$$;

grant execute on function public.list_catalog_houses(int)
  to anon, authenticated, service_role;

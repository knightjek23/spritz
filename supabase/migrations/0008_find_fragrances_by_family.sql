-- =====================================================================
-- 0008_find_fragrances_by_family.sql
--
-- Powers the /family/[slug] and /families pages.
--
-- The fragrances.family column is text[] — a fragrance can belong to
-- multiple families (e.g. "woody aromatic" gets stored as ['woody',
-- 'aromatic']). Match is case-insensitive against a single canonical
-- family name passed in by the route.
--
-- The list_catalog_families RPC unnests the array column and groups by
-- normalized name so we can render the /families index with per-family
-- counts.
-- =====================================================================

create or replace function public.find_fragrances_by_family(
  p_family text,
  p_limit  int default 100
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
  -- Enumerated columns (not f.*) because the table includes note_vector
  -- at position 10 — return-table mapping is positional and would type-
  -- mismatch against longevity_score real.
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
  where exists (
    select 1 from unnest(coalesce(f.family, array[]::text[])) fam
    where lower(fam) = lower(p_family)
  )
  order by f.popularity_rank asc nulls last, f.name asc
  limit p_limit;
$$;

grant execute on function public.find_fragrances_by_family(text, int)
  to anon, authenticated, service_role;


create or replace function public.list_catalog_families(
  p_limit int default 100
)
returns table (
  family           text,
  fragrance_count  int
)
language sql
stable
as $$
  with all_families as (
    select lower(fam) as family
    from public.fragrances f,
         unnest(coalesce(f.family, array[]::text[])) fam
    where fam is not null and length(fam) > 0
  )
  select family, count(*)::int as fragrance_count
  from all_families
  group by family
  order by fragrance_count desc, family asc
  limit p_limit;
$$;

grant execute on function public.list_catalog_families(int)
  to anon, authenticated, service_role;

-- restore-fragrantica-url.sql
--
-- ROLLBACK for migration 0047. NOT run automatically. Paste into the Supabase
-- SQL editor only if 0047 has to be undone.
--
-- Re-adds fragrances.fragrantica_url, refills it from fragrance_provenance,
-- and restores the five functions to their pre-0047 definitions (taken
-- verbatim from migrations 0003, 0004, 0005, 0009 and 0035).

alter table public.fragrances add column if not exists fragrantica_url text;

update public.fragrances f
set fragrantica_url = p.fragrantica_url
from public.fragrance_provenance p
where p.fragrance_id = f.id
  and p.fragrantica_url is not null
  and f.fragrantica_url is distinct from p.fragrantica_url;

drop function if exists public.search_fragrances(text, text, int);
create function public.search_fragrances(
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

drop function if exists public.find_similar_fragrances(uuid, int);
create function public.find_similar_fragrances(
  p_id    uuid,
  p_limit int default 5
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
  similarity          real
)
language sql
stable
as $$
  with src as (
    select note_vector
    from public.fragrances
    where id = p_id
      and note_vector is not null
  )
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
    (1 - (f.note_vector <=> src.note_vector))::real as similarity
  from public.fragrances f, src
  where f.id <> p_id
    and f.note_vector is not null
  order by f.note_vector <=> src.note_vector asc
  limit p_limit;
$$;

grant execute on function public.find_similar_fragrances(uuid, int)
  to anon, authenticated, service_role;

drop function if exists public.find_fragrances_by_house(text, int);
create function public.find_fragrances_by_house(
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
  where public.house_slug(f.house) = public.house_slug(p_slug)
  order by f.popularity_rank asc nulls last, f.name asc
  limit p_limit;
$$;

grant execute on function public.find_fragrances_by_house(text, int)
  to anon, authenticated, service_role;

drop function if exists public.find_fragrances_by_note(text, int);
create function public.find_fragrances_by_note(
  p_note  text,
  p_limit int default 50
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
  layer               text
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
    -- Which layer the note appears in. Top wins ties (most distinctive).
    case
      when exists (
        select 1 from jsonb_array_elements(coalesce(f.top_notes, '[]'::jsonb)) n
        where lower(n->>'name') = lower(p_note)
      ) then 'top'
      when exists (
        select 1 from jsonb_array_elements(coalesce(f.mid_notes, '[]'::jsonb)) n
        where lower(n->>'name') = lower(p_note)
      ) then 'mid'
      else 'base'
    end as layer
  from public.fragrances f
  where lower(p_note) in (
    select lower(n->>'name')
    from jsonb_array_elements(
      coalesce(f.top_notes,  '[]'::jsonb)
      || coalesce(f.mid_notes, '[]'::jsonb)
      || coalesce(f.base_notes,'[]'::jsonb)
    ) n
  )
  order by f.popularity_rank asc nulls last
  limit p_limit;
$$;

grant execute on function public.find_fragrances_by_note(text, int)
  to anon, authenticated, service_role;

drop function if exists public.find_fragrances_by_family(text, int);
create function public.find_fragrances_by_family(
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
    select 1
    from unnest(coalesce(f.family, array[]::text[])) fam
    where public.normalize_family(fam) = lower(p_family)
  )
  order by f.popularity_rank asc nulls last, f.name asc
  limit p_limit;
$$;

grant execute on function public.find_fragrances_by_family(text, int)
  to anon, authenticated, service_role;


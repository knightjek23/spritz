-- =====================================================================
-- 0005_note_browse_functions.sql
--
-- Powers the new /note/[slug] and /notes index pages.
--
--   find_fragrances_by_note(p_note, p_limit)
--     Given a note name (case-insensitive), returns up to p_limit
--     fragrances that include it in any layer (top/mid/base), ordered
--     by popularity. Used by /note/[slug] to render the catalog list.
--
--   list_canonical_notes(p_limit)
--     Returns every distinct note name that appears anywhere in the
--     catalog along with how many fragrances reference it. Used by
--     /notes (the index page) and as a sanity check that the editorial
--     /editorial/notes/*.md set covers what the catalog actually uses.
--
-- Both run against the JSONB note arrays and avoid a denormalized
-- note_index table for now. We'll add one if list_canonical_notes
-- gets called frequently enough to justify the maintenance cost.
-- =====================================================================

create or replace function public.find_fragrances_by_note(
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


create or replace function public.list_canonical_notes(
  p_limit int default 500
)
returns table (
  name             text,
  fragrance_count  int
)
language sql
stable
as $$
  with all_notes as (
    select lower(n->>'name') as name
    from public.fragrances f,
         jsonb_array_elements(
           coalesce(f.top_notes,  '[]'::jsonb)
           || coalesce(f.mid_notes, '[]'::jsonb)
           || coalesce(f.base_notes,'[]'::jsonb)
         ) n
    where n->>'name' is not null
  )
  select name, count(*)::int as fragrance_count
  from all_notes
  where length(name) > 0
  group by name
  order by fragrance_count desc
  limit p_limit;
$$;

grant execute on function public.list_canonical_notes(int)
  to anon, authenticated, service_role;

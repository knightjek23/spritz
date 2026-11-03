-- =====================================================================
-- 0041_note_family_paging.sql
--
-- "See more" on /note/[slug] and /family/[slug]. The old functions
-- (0005 find_fragrances_by_note, 0009 find_fragrances_by_family) only
-- take a limit, so the pages capped at 60 and 100 bottles even when the
-- note is in hundreds. These take an offset and return the total, so the
-- page can show the real count and load 50 more per tap.
--
--   find_fragrances_by_notes_page(p_notes text[], p_limit, p_offset)
--     Every fragrance carrying ANY of p_notes (case-insensitive exact
--     names, so one page can union "oud" and "agarwood (oud)"), ordered by
--     popularity, with the layer the note sits in and total_count (the
--     full match count, same on every row).
--
--   find_fragrances_by_family_page(p_family, p_limit, p_offset)
--     Same shape for a normalized family slug.
--
-- Slim rows on purpose: only what the list renders. No perfumer (Pro
-- only, 0034), no vectors, no feed blobs. The ORDER BY ends on f.id so
-- paging is stable: rows that tie on popularity_rank (and every unranked
-- bottle ties on NULL) cannot swap between two requests and appear on
-- two pages or on none.
-- =====================================================================

create or replace function public.find_fragrances_by_notes_page(
  p_notes  text[],
  p_limit  int default 50,
  p_offset int default 0
)
returns table (
  id               uuid,
  name             text,
  house            text,
  year             int,
  bottle_image_url text,
  popularity_rank  int,
  layer            text,
  total_count      bigint
)
language sql
stable
as $$
  with wanted as (
    select distinct lower(btrim(n)) as n from unnest(p_notes) n where btrim(n) <> ''
  ),
  hits as (
    select
      f.id, f.name, f.house, f.year, f.bottle_image_url, f.popularity_rank,
      -- Which layer the note appears in. Top wins ties (most distinctive).
      case
        when exists (
          select 1 from jsonb_array_elements(coalesce(f.top_notes, '[]'::jsonb)) t
          where lower(t->>'name') in (select n from wanted)
        ) then 'top'
        when exists (
          select 1 from jsonb_array_elements(coalesce(f.mid_notes, '[]'::jsonb)) m
          where lower(m->>'name') in (select n from wanted)
        ) then 'mid'
        else 'base'
      end as layer
    from public.fragrances f
    where exists (
      select 1
      from jsonb_array_elements(
        coalesce(f.top_notes,  '[]'::jsonb)
        || coalesce(f.mid_notes, '[]'::jsonb)
        || coalesce(f.base_notes,'[]'::jsonb)
      ) x
      where lower(x->>'name') in (select n from wanted)
    )
  )
  select h.*, count(*) over () as total_count
  from hits h
  order by h.popularity_rank asc nulls last, h.name asc, h.id asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.find_fragrances_by_notes_page(text[], int, int)
  to anon, authenticated, service_role;


create or replace function public.find_fragrances_by_family_page(
  p_family text,
  p_limit  int default 50,
  p_offset int default 0
)
returns table (
  id               uuid,
  name             text,
  house            text,
  year             int,
  bottle_image_url text,
  popularity_rank  int,
  total_count      bigint
)
language sql
stable
as $$
  select
    f.id, f.name, f.house, f.year, f.bottle_image_url, f.popularity_rank,
    count(*) over () as total_count
  from public.fragrances f
  where exists (
    select 1
    from unnest(coalesce(f.family, array[]::text[])) fam
    where public.normalize_family(fam) = lower(p_family)
  )
  order by f.popularity_rank asc nulls last, f.name asc, f.id asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.find_fragrances_by_family_page(text, int, int)
  to anon, authenticated, service_role;

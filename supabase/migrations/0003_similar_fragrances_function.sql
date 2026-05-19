-- =====================================================================
-- 0003_similar_fragrances_function.sql
--
-- Runtime pgvector fallback for the "If you like this, explore" section.
--
-- Why this exists:
--   Pre-computed dupe_pairs (built by scripts/compute-dupes.ts) is the
--   primary source for similarity reads — fast, sortable, joinable.
--   But: any fragrance whose note_vector was null at compute-time has
--   zero rows in dupe_pairs. That includes anything added since the last
--   run, anything that was missing notes during early scrapes, and
--   anything we re-vectorized after a parser fix.
--
--   Recomputing 10k × 50 pairs is a heavy batch job. This RPC gives us
--   request-time fallback so the section is never empty as long as the
--   source has a note_vector. The ivfflat index from migration 0001
--   keeps it cheap (~10-30ms at our scale).
--
-- Use:
--   The /api/dupes/[id] route calls this only when dupe_pairs returns
--   no rows for the source fragrance.
-- =====================================================================

create or replace function public.find_similar_fragrances(
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


-- =====================================================================
-- Helper: shared notes between two fragrances.
--
-- Returns the intersection of (top + mid + base) note names between two
-- fragrances, ranked by combined weight. Used by the API route to
-- enrich runtime similarity hits with the same shared_notes shape that
-- pre-computed pairs already carry.
-- =====================================================================
create or replace function public.shared_notes_between(
  p_a uuid,
  p_b uuid,
  p_limit int default 3
)
returns table (
  name   text,
  weight real
)
language sql
stable
as $$
  with a_notes as (
    select
      lower(n->>'name') as name,
      (n->>'weight')::real as weight
    from public.fragrances f,
         jsonb_array_elements(coalesce(f.top_notes,  '[]'::jsonb)
                            || coalesce(f.mid_notes,  '[]'::jsonb)
                            || coalesce(f.base_notes, '[]'::jsonb)) n
    where f.id = p_a
  ),
  b_notes as (
    select
      lower(n->>'name') as name,
      (n->>'weight')::real as weight
    from public.fragrances f,
         jsonb_array_elements(coalesce(f.top_notes,  '[]'::jsonb)
                            || coalesce(f.mid_notes,  '[]'::jsonb)
                            || coalesce(f.base_notes, '[]'::jsonb)) n
    where f.id = p_b
  )
  select a.name, (a.weight + b.weight)::real as weight
  from a_notes a
  join b_notes b using (name)
  where a.name is not null and length(a.name) > 0
  order by weight desc
  limit p_limit;
$$;

grant execute on function public.shared_notes_between(uuid, uuid, int)
  to anon, authenticated, service_role;

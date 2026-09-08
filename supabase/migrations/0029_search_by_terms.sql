-- =====================================================================
-- 0029: keyword search across notes and families
--
-- "musk, iris, citrus" in the search bar → the most popular fragrances
-- that carry those notes / sit in those families. Each term arrives
-- already resolved by lib/search-terms.ts as a jsonb object:
--
--   { "key": "musk",                       -- what the UI shows back
--     "names": ["musk", "white musk"],     -- exact catalog note names
--     "pattern": "\\mmusk\\M",             -- word-boundary regex, or null
--     "family": null }                     -- normalized family slug, or null
--
-- A fragrance matches a term when any note in any layer equals one of
-- `names`, or matches `pattern` as a whole word (so "musk" also finds
-- "egyptian musk"), or when any of its accords normalizes to `family`.
-- Ranking: number of distinct terms matched, then popularity_rank
-- (1 = most popular, fully backfilled per 0016), then name.
--
-- No new index: the note arrays have none today and 7k rows scan in
-- well under 100ms. Revisit with a note_index table if that changes.
-- =====================================================================

create or replace function public.find_fragrances_by_terms(
  p_terms jsonb,
  p_limit int default 40
)
returns table (
  id               uuid,
  name             text,
  house            text,
  family           text[],
  year             int,
  bottle_image_url text,
  popularity_rank  int,
  matched          text[],
  match_count      int
)
language sql
stable
as $$
  with terms as (
    select
      t->>'key' as key,
      array(
        select lower(x) from jsonb_array_elements_text(coalesce(t->'names', '[]'::jsonb)) x
      ) as names,
      nullif(t->>'pattern', '') as pattern,
      nullif(lower(t->>'family'), '') as fam
    from jsonb_array_elements(p_terms) t
  ),
  frag_notes as (
    select f.id, lower(n->>'name') as note
    from public.fragrances f,
         jsonb_array_elements(
           coalesce(f.top_notes,  '[]'::jsonb)
           || coalesce(f.mid_notes, '[]'::jsonb)
           || coalesce(f.base_notes,'[]'::jsonb)
         ) n
    where n->>'name' is not null
  ),
  frag_fams as (
    select f.id, public.normalize_family(fam) as fam
    from public.fragrances f,
         unnest(coalesce(f.family, array[]::text[])) fam
  ),
  hits as (
    select distinct fn.id, t.key
    from terms t
    join frag_notes fn
      on (cardinality(t.names) > 0 and fn.note = any(t.names))
      or (t.pattern is not null and fn.note ~ t.pattern)
    union
    select distinct ff.id, t.key
    from terms t
    join frag_fams ff on t.fam is not null and ff.fam = t.fam
  ),
  scored as (
    select id, array_agg(key order by key) as matched, count(*)::int as match_count
    from hits
    group by id
  )
  select
    f.id, f.name, f.house, f.family, f.year, f.bottle_image_url,
    f.popularity_rank, s.matched, s.match_count
  from scored s
  join public.fragrances f on f.id = s.id
  order by s.match_count desc, f.popularity_rank asc nulls last, f.name asc
  limit p_limit;
$$;

grant execute on function public.find_fragrances_by_terms(jsonb, int)
  to anon, authenticated, service_role;

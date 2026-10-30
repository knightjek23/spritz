-- 0040_search_terms_house_filter.sql
--
-- Keyword search learns houses: "creed patchouli" → Creed fragrances that
-- carry patchouli. Before this, a query was a keyword query only when every
-- word was a note or family, so a house name anywhere in it dropped the
-- whole thing back to a fuzzy name search, and "creed patchouli" returned
-- nothing useful.
--
-- A house term is a FILTER, not a scored match. "creed patchouli" means
-- Creed bottles with patchouli; a Dior with patchouli must never appear.
-- Note and family terms keep scoring as before, so "patchouli vanilla"
-- still ranks bottles with both above bottles with one.
--
-- House matching goes through public.house_slug() (0035), the one slug
-- rule shared with the JS side, so this cannot drift from houseSlug(). The
-- client sends the canonical slug plus any alias spellings
-- (slugsForCanonicalHouse: "maison-margiela" also sends
-- "maison-martin-margiela"), and the stored house is slugged the same way.
--
-- Also: a query that is ONLY houses ("creed", "tom ford") now returns that
-- house's most popular bottles as the keyword section. Previously the
-- house row linked to the house page but the list itself was the fuzzy
-- name match, which for "creed" is mostly bottles called Creed-something.
--
-- Return shape unchanged from 0029, so create or replace is fine.

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
      nullif(lower(t->>'family'), '') as fam,
      -- Canonical house slugs this term may match (empty for note/family terms).
      array(
        select lower(x) from jsonb_array_elements_text(coalesce(t->'house_slugs', '[]'::jsonb)) x
      ) as house_slugs
    from jsonb_array_elements(p_terms) t
  ),
  house_terms as (
    select key, house_slugs from terms where cardinality(house_slugs) > 0
  ),
  scored_terms as (
    select key, names, pattern, fam from terms where cardinality(house_slugs) = 0
  ),
  -- Candidate rows: when any house term is present, only that house's
  -- fragrances, matched through the shared slug function.
  candidates as (
    select f.id, f.name, f.house, f.family, f.year, f.bottle_image_url, f.popularity_rank
    from public.fragrances f
    where not exists (select 1 from house_terms)
       or exists (
         select 1 from house_terms ht
         where public.house_slug(f.house) = any(ht.house_slugs)
       )
  ),
  frag_notes as (
    select c.id, lower(n->>'name') as note
    from candidates c
    join public.fragrances f on f.id = c.id,
         jsonb_array_elements(
           coalesce(f.top_notes,  '[]'::jsonb)
           || coalesce(f.mid_notes, '[]'::jsonb)
           || coalesce(f.base_notes,'[]'::jsonb)
         ) n
    where n->>'name' is not null
  ),
  frag_fams as (
    select c.id, public.normalize_family(fam) as fam
    from candidates c
    join public.fragrances f on f.id = c.id,
         unnest(coalesce(f.family, array[]::text[])) fam
  ),
  hits as (
    select distinct fn.id, t.key
    from scored_terms t
    join frag_notes fn
      on (cardinality(t.names) > 0 and fn.note = any(t.names))
      or (t.pattern is not null and fn.note ~ t.pattern)
    union
    select distinct ff.id, t.key
    from scored_terms t
    join frag_fams ff on t.fam is not null and ff.fam = t.fam
  ),
  scored as (
    select id, array_agg(key order by key) as matched, count(*)::int as match_count
    from hits
    group by id
  )
  -- With scored terms present: candidates that matched at least one, ranked
  -- by how many. House-only query: every candidate, by popularity, with the
  -- house key as the match so the UI can label the section.
  select
    c.id, c.name, c.house, c.family, c.year, c.bottle_image_url, c.popularity_rank,
    coalesce(s.matched, array(select key from house_terms)) as matched,
    coalesce(s.match_count, 0) as match_count
  from candidates c
  left join scored s on s.id = c.id
  where (not exists (select 1 from scored_terms)) or s.id is not null
  order by coalesce(s.match_count, 0) desc, c.popularity_rank asc nulls last, c.name asc
  limit p_limit;
$$;

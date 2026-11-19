-- 0047_drop_public_fragrantica_url.sql
--
-- Take fragrances.fragrantica_url off the public catalog table.
--
-- public.fragrances is readable by anyone holding the app's public key, and
-- this column was an internal match key that no screen displays. From here
-- on it lives only in public.fragrance_provenance, which the server alone
-- can read (migration 0043). Nothing a user sees changes.
--
-- Design: "Spritz data provenance spec", section "Design: take
-- fragrantica_url off the public table" (approved 19 Nov 2026).
--
-- What this does, in order:
--   1. Brings fragrance_provenance up to date: a row for any fragrance
--      added since 0043, and the URL copied across wherever it is missing.
--   2. Safety check. If any fragrance has a URL that is not safely in
--      fragrance_provenance, it raises and NOTHING below runs.
--   3. Recreates the five functions that returned the column, without it.
--      Same arguments, same other columns, same order, same permissions.
--      A return type cannot be changed in place, hence drop + create.
--   4. Drops the column.
--   5. Indexes fragrance_provenance.fragrantica_url for the two scripts
--      that look rows up by it (scraper/src/import-targets.ts,
--      scripts/research-match.ts).
--
-- Steps 2 to 5 sit inside ONE do-block on purpose. A do-block is a single
-- statement, so it either completes or leaves everything as it was: there
-- is never a moment when a function is missing, or exists but selects a
-- column that is gone. That holds however the migration runner batches
-- statements.
--
-- Rollback: scripts/restore-fragrantica-url.sql (not run automatically).

-- 1a. Provenance row for any fragrance created since 0043.
insert into public.fragrance_provenance (
  fragrance_id, fragrantica_url,
  notes_origin, family_origin, perfumer_origin,
  legacy_family, legacy_top_notes, legacy_mid_notes, legacy_base_notes,
  legacy_perfumer, legacy_saved_at
)
select
  f.id,
  f.fragrantica_url,
  case when f.fragrantica_url is not null then 'fragrantica' else 'unknown' end,
  case when f.fragrantica_url is not null then 'fragrantica' else 'unknown' end,
  case when f.perfumer is not null and f.fragrantica_url is not null
       then 'fragrantica' else 'unknown' end,
  f.family, f.top_notes, f.mid_notes, f.base_notes,
  f.perfumer, now()
from public.fragrances f
where not exists (
  select 1 from public.fragrance_provenance p where p.fragrance_id = f.id
);

-- 1b. Copy the URL across wherever provenance does not have it yet.
update public.fragrance_provenance p
set fragrantica_url = f.fragrantica_url,
    updated_at = now()
from public.fragrances f
where f.id = p.fragrance_id
  and f.fragrantica_url is not null
  and p.fragrantica_url is distinct from f.fragrantica_url;

do $mig$
declare
  not_copied int;
begin
  -- 2. Safety check: every URL on the public table must already be in
  --    fragrance_provenance before the column is allowed to go.
  select count(*) into not_copied
  from public.fragrances f
  left join public.fragrance_provenance p on p.fragrance_id = f.id
  where f.fragrantica_url is not null
    and (p.fragrance_id is null or p.fragrantica_url is distinct from f.fragrantica_url);
  if not_copied > 0 then
    raise exception
      '0047 stopped: % fragrance(s) have a fragrantica_url that is not in fragrance_provenance. Nothing was changed.',
      not_copied;
  end if;

  -- 3. Recreate the five functions without the column.
  -- search_fragrances
  execute 'drop function if exists public.search_fragrances(text, text, int)';
  execute $fn$
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
        f.avg_retail_price, f.price_tier, f.popularity_rank,
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
  $fn$;
  execute 'grant execute on function public.search_fragrances(text, text, int) to anon, authenticated, service_role';

  -- find_similar_fragrances
  execute 'drop function if exists public.find_similar_fragrances(uuid, int)';
  execute $fn$
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
        f.avg_retail_price, f.price_tier, f.popularity_rank,
        f.dupes, f.created_at, f.updated_at,
        (1 - (f.note_vector <=> src.note_vector))::real as similarity
      from public.fragrances f, src
      where f.id <> p_id
        and f.note_vector is not null
      order by f.note_vector <=> src.note_vector asc
      limit p_limit;
    $$;
  $fn$;
  execute 'grant execute on function public.find_similar_fragrances(uuid, int) to anon, authenticated, service_role';

  -- find_fragrances_by_house
  execute 'drop function if exists public.find_fragrances_by_house(text, int)';
  execute $fn$
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
        f.avg_retail_price, f.price_tier, f.popularity_rank,
        f.dupes, f.created_at, f.updated_at
      from public.fragrances f
      where public.house_slug(f.house) = public.house_slug(p_slug)
      order by f.popularity_rank asc nulls last, f.name asc
      limit p_limit;
    $$;
  $fn$;
  execute 'grant execute on function public.find_fragrances_by_house(text, int) to anon, authenticated, service_role';

  -- find_fragrances_by_note
  execute 'drop function if exists public.find_fragrances_by_note(text, int)';
  execute $fn$
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
        f.avg_retail_price, f.price_tier, f.popularity_rank,
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
  $fn$;
  execute 'grant execute on function public.find_fragrances_by_note(text, int) to anon, authenticated, service_role';

  -- find_fragrances_by_family
  execute 'drop function if exists public.find_fragrances_by_family(text, int)';
  execute $fn$
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
        f.avg_retail_price, f.price_tier, f.popularity_rank,
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
  $fn$;
  execute 'grant execute on function public.find_fragrances_by_family(text, int) to anon, authenticated, service_role';

  -- 4. Drop the column. Any index on it goes with it.
  execute 'alter table public.fragrances drop column fragrantica_url';
end
$mig$;

-- 5. Lookups by URL now go through the provenance table.
create index if not exists fragrance_provenance_fragrantica_url_idx
  on public.fragrance_provenance (fragrantica_url)
  where fragrantica_url is not null;

-- ---------------------------------------------------------------------------
-- Checks to run by hand after `supabase db push` (one at a time):
--
--   -- should return 0 rows: the column is gone from the public table
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'fragrances'
--     and column_name = 'fragrantica_url';
--
--   -- every fragrance has a provenance row; with_url should be about 13,020
--   select (select count(*) from public.fragrances)           as fragrances,
--          (select count(*) from public.fragrance_provenance) as provenance,
--          (select count(*) from public.fragrance_provenance
--            where fragrantica_url is not null)               as with_url;
--
--   -- each should return rows without error
--   select id, name, match_score from public.search_fragrances('Dior', 'Sauvage', 3);
--   select id, name from public.find_fragrances_by_house('creed', 3);
-- ---------------------------------------------------------------------------

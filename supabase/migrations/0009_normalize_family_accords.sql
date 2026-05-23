-- =====================================================================
-- 0009_normalize_family_accords.sql
--
-- The fragrances.family column stores Fragrantica accord strings
-- ("warm spicy", "white floral", "powdery", "balsamic"...) which don't
-- map 1:1 to the curated family taxonomy in lib/families.ts. This
-- causes /families to either show 0 counts (when no accord matches a
-- slug exactly) or a confused mix of curated families and raw accords.
--
-- Fix: introduce a SQL function normalize_family(text) that maps raw
-- accord names to the canonical family slug, then update both
-- list_catalog_families and find_fragrances_by_family to use it.
--
-- Mapping decisions:
--   - "white floral", "soft floral", "yellow floral" → floral
--   - "warm spicy", "fresh spicy" → spicy
--   - "woody floral", "dry woody" → woody
--   - "powdery", "rose", "iris" → floral (powdery is borderline, but
--     in practice powdery accords are floral-adjacent)
--   - "vanilla", "sweet", "almond", "honey", "coconut", "chocolate" → gourmand
--   - "balsamic", "resinous", "incense" → oriental
--   - "earthy", "mossy" → green
--   - "lavender", "rosemary", "sage", "mint" → aromatic
--   - "marine", "ozonic" → aquatic
--   - "animalic", "smoky" → leather
--   - "musky", "soft musky" → musky
--   - "white musk", "synthetic" → synthetic
--   - exact matches (citrus, floral, fruity, green, aromatic, spicy,
--     woody, oriental, amber, leather, musky, gourmand, aquatic,
--     ozonic, chypre, fougere) → unchanged
--   - everything else → other
-- =====================================================================

create or replace function public.normalize_family(p_accord text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(trim(p_accord), ''))
    -- Exact family slug matches (no transformation needed)
    when 'citrus'   then 'citrus'
    when 'floral'   then 'floral'
    when 'fruity'   then 'fruity'
    when 'green'    then 'green'
    when 'aromatic' then 'aromatic'
    when 'spicy'    then 'spicy'
    when 'woody'    then 'woody'
    when 'oriental' then 'oriental'
    when 'amber'    then 'amber'
    when 'leather'  then 'leather'
    when 'musky'    then 'musky'
    when 'gourmand' then 'gourmand'
    when 'aquatic'  then 'aquatic'
    when 'ozonic'   then 'ozonic'
    when 'synthetic' then 'synthetic'
    when 'chypre'   then 'chypre'
    when 'fougere'  then 'fougere'

    -- Floral variants
    when 'white floral'   then 'floral'
    when 'soft floral'    then 'floral'
    when 'yellow floral'  then 'floral'
    when 'powdery'        then 'floral'
    when 'rose'           then 'floral'
    when 'iris'           then 'floral'
    when 'violet'         then 'floral'

    -- Spicy variants
    when 'warm spicy'  then 'spicy'
    when 'fresh spicy' then 'spicy'

    -- Woody variants
    when 'woody floral' then 'woody'
    when 'dry woody'    then 'woody'

    -- Aromatic / herbal
    when 'lavender'  then 'aromatic'
    when 'rosemary'  then 'aromatic'
    when 'sage'      then 'aromatic'
    when 'mint'      then 'aromatic'
    when 'herbal'    then 'aromatic'

    -- Gourmand / sweet edibles
    when 'sweet'     then 'gourmand'
    when 'vanilla'   then 'gourmand'
    when 'almond'    then 'gourmand'
    when 'honey'     then 'gourmand'
    when 'coconut'   then 'gourmand'
    when 'chocolate' then 'gourmand'
    when 'caramel'   then 'gourmand'
    when 'coffee'    then 'gourmand'

    -- Oriental / amber-adjacent / resinous
    when 'balsamic'  then 'oriental'
    when 'resinous'  then 'oriental'
    when 'incense'   then 'oriental'

    -- Green / earthy
    when 'earthy'    then 'green'
    when 'mossy'     then 'green'
    when 'fresh'     then 'green'

    -- Aquatic / marine
    when 'marine'    then 'aquatic'

    -- Leather / animalic / smoky
    when 'animalic'  then 'leather'
    when 'smoky'     then 'leather'
    when 'tobacco'   then 'leather'

    -- Musky
    when 'soft musky' then 'musky'

    -- Synthetic
    when 'white musk' then 'synthetic'

    -- Catch-all
    else 'other'
  end;
$$;

grant execute on function public.normalize_family(text) to anon, authenticated, service_role;


-- =====================================================================
-- list_catalog_families: now groups by the normalized family slug.
-- Two accords that map to the same family (e.g. "warm spicy" + "fresh
-- spicy" → "spicy") count once per fragrance to avoid double-counting.
-- =====================================================================
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
  with per_fragrance as (
    -- Each fragrance contributes one row per distinct normalized family.
    select distinct
      f.id,
      public.normalize_family(fam) as family
    from public.fragrances f,
         unnest(coalesce(f.family, array[]::text[])) fam
    where fam is not null and length(trim(fam)) > 0
  )
  select family, count(*)::int as fragrance_count
  from per_fragrance
  where family <> 'other'           -- hide the catch-all from the index
  group by family
  order by fragrance_count desc, family asc
  limit p_limit;
$$;

grant execute on function public.list_catalog_families(int)
  to anon, authenticated, service_role;


-- =====================================================================
-- find_fragrances_by_family: match by normalized family slug, not raw
-- accord. So /family/spicy returns fragrances tagged with "spicy",
-- "warm spicy", OR "fresh spicy".
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

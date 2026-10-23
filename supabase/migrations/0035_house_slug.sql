-- 0035_house_slug.sql
--
-- One house-slug rule, shared with lib/slugs.ts houseSlug().
--
-- Until now the SQL side (find_fragrances_by_house, list_catalog_houses)
-- turned every non-alphanumeric run into "-" and never trimmed, so
-- "Chloé" became "chlo-", while the JS side stripped accents and
-- apostrophes and trimmed, giving "chlo". Every house link built in JS
-- (fragrance page, perfumer pills, dupes, popular-by-house tabs) 404ed
-- for any house with an accent or apostrophe; /houses and the sitemap
-- only worked because they used the SQL slug. Both sides now agree on:
--
--   unaccent -> lower -> drop apostrophes -> [^a-z0-9]+ to "-" -> trim "-"
--
-- "Chloé" -> "chloe", "L'Artisan Parfumeur" -> "lartisan-parfumeur",
-- "Van Cleef & Arpels" -> "van-cleef-arpels". Old "chlo-" URLs stop
-- resolving; the sitemap regenerates on deploy.

create extension if not exists unaccent with schema extensions;

create or replace function public.house_slug(p_name text)
returns text
language sql
immutable
strict
as $$
  select btrim(
    regexp_replace(
      regexp_replace(lower(extensions.unaccent(p_name)), '[''’]', '', 'g'),
      '[^a-z0-9]+', '-', 'g'
    ),
    '-'
  );
$$;

grant execute on function public.house_slug(text) to anon, authenticated, service_role;

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
    public.house_slug(f.house) as slug,
    count(*)::int as fragrance_count
  from public.fragrances f
  where f.house is not null and length(f.house) > 0
  group by f.house
  order by fragrance_count desc, f.house asc
  limit p_limit;
$$;

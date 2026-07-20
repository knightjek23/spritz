-- audit-trending-catalog.sql
--
-- Which trending-feed fragrances exist in the catalog, and which are
-- missing (need scraping). Run in the Supabase SQL editor.
--
-- `in_catalog` = an exact name + house row exists → the card links.
-- `closest_name_same_house` = the nearest fragrance name we DO have from
--   that house. If in_catalog is false but this shows a near-identical
--   name, it's a spelling/word-order mismatch (fixable by aliasing),
--   not a truly missing fragrance. If it's blank or unrelated, the
--   fragrance genuinely isn't in the catalog and needs scraping.
--
-- The wanted() list is every distinct entry across the google_trends,
-- retailer_bestsellers, and weekly feeds (as of the current feeds).

with wanted(name, house) as (
  values
    ('Baccarat Rouge 540', 'Maison Francis Kurkdjian'),
    ('Bleu de Chanel',     'Chanel'),
    ('Libre',              'Yves Saint Laurent'),
    ('Coco Mademoiselle',  'Chanel'),
    ('J''adore',           'Dior'),
    ('Molecule 01',        'Escentric Molecules'),
    ('Myslf',              'Yves Saint Laurent'),
    ('Vanilla Sex',        'Tom Ford'),
    ('Vanilla 28',         'Kayali'),
    ('Born In Roma Donna', 'Valentino'),
    ('Donna Born In Roma', 'Valentino'),
    ('Uomo Born In Roma',  'Valentino')
)
select
  w.house as feed_house,
  w.name  as feed_name,
  exists (
    select 1 from public.fragrances f
    where lower(f.name) = lower(w.name)
      and f.house ilike w.house
  ) as in_catalog,
  (
    select f.name
    from public.fragrances f
    where f.house ilike w.house
    order by similarity(f.name, w.name) desc
    limit 1
  ) as closest_name_same_house
from wanted w
order by in_catalog asc, w.house, w.name;

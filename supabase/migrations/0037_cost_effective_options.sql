-- 0037_cost_effective_options.sql
--
-- "Cost-effective options": fragrances that smell close to a given one and
-- cost less, ranked by how much you save per unit of similarity.
--
-- Why this replaces the dupe engine: "Known dupes" depended on editorial
-- entries and AI recall, and only a small slice of the catalog ever had
-- either. Scent similarity (note_vector) and retailer prices (the
-- fragrance_offers feed) cover far more of it, so this finds candidates for
-- most fragrances that have a price and a vector.
--
-- The only real price source is fragrance_offers. fragrances.avg_retail_price
-- and price_tier were never populated by the scraper (0 rows as of Oct 2026),
-- so nothing here reads them.
--
-- Ranking. A candidate must be at least MIN_SIM similar and at least
-- MIN_SAVING cheaper. Among those, the score rewards both closeness and
-- saving, so a 90% match at half the price beats an 80% match at a tenth
-- and beats a 95% match that saves two dollars:
--
--   score = similarity * saving_fraction
--
-- Nothing clever beyond that; it reads well in the UI as "72% match, saves
-- $85" and a user can see why one row outranks another.

create or replace function public.find_cost_effective_options(
  p_id         uuid,
  p_limit      int     default 10,
  p_min_sim    real    default 0.60,
  p_min_saving numeric default 10   -- in the source's currency
)
returns table (
  id                  uuid,
  name                text,
  house               text,
  family              text[],
  year                int,
  bottle_image_url    text,
  popularity_rank     int,
  similarity          real,
  price               numeric,
  currency            text,
  retailer            text,
  product_url         text,
  source_price        numeric,
  saving              numeric,
  saving_pct          int,
  score               real
)
language sql
stable
as $$
  with src as (
    -- The source fragrance's vector and its cheapest priced offer.
    select
      f.note_vector,
      o.price    as price,
      o.currency as currency
    from public.fragrances f
    join lateral (
      select price, currency
      from public.fragrance_offers
      where fragrance_id = f.id and price is not null and in_stock
      order by price asc
      limit 1
    ) o on true
    where f.id = p_id and f.note_vector is not null
  ),
  -- Nearest neighbours by scent, a generous pool so the price filter still
  -- leaves enough. ivfflat makes this cheap.
  near as (
    select
      f.id, f.name, f.house, f.family, f.year, f.bottle_image_url,
      f.popularity_rank,
      (1 - (f.note_vector <=> src.note_vector))::real as similarity,
      src.price    as source_price,
      src.currency as source_currency
    from public.fragrances f, src
    where f.id <> p_id and f.note_vector is not null
    order by f.note_vector <=> src.note_vector asc
    limit 120
  ),
  -- Cheapest in-stock offer for each neighbour, same currency as the source
  -- so the saving is a real number and not a FX guess.
  priced as (
    select
      n.*,
      o.price, o.currency, o.retailer, o.product_url
    from near n
    join lateral (
      select price, currency, retailer, product_url
      from public.fragrance_offers
      where fragrance_id = n.id
        and price is not null
        and in_stock
        and currency = n.source_currency
      order by price asc
      limit 1
    ) o on true
  )
  select
    p.id, p.name, p.house, p.family, p.year, p.bottle_image_url,
    p.popularity_rank,
    p.similarity,
    p.price, p.currency, p.retailer, p.product_url,
    p.source_price,
    (p.source_price - p.price)                                   as saving,
    round(100 * (p.source_price - p.price) / p.source_price)::int as saving_pct,
    (p.similarity * ((p.source_price - p.price) / p.source_price))::real as score
  from priced p
  where p.similarity >= p_min_sim
    and p.source_price - p.price >= p_min_saving
  order by score desc, p.similarity desc
  limit p_limit;
$$;

-- Server-only: the API route is the gate (Pro sees the full list, free
-- sees a teaser). The anon key must not be able to pull the list directly.
revoke execute on function public.find_cost_effective_options(uuid, int, real, numeric)
  from anon, authenticated;
grant execute on function public.find_cost_effective_options(uuid, int, real, numeric)
  to service_role;

-- Coverage check after applying (how many fragrances can this work for?):
--
-- select count(distinct f.id)
-- from public.fragrances f
-- join public.fragrance_offers o on o.fragrance_id = f.id and o.price is not null
-- where f.note_vector is not null;

-- 0039_price_source_priority.sql
--
-- Prefer the most trustworthy price source per fragrance, not the cheapest.
--
-- 0038 picked each fragrance's price as the lowest price_per_ml across all
-- fragrance_prices rows. With one estimate per fragrance that was harmless.
-- The --fill tiers (house_median, house_estimate, gpt_guess) add rougher
-- rows, and "lowest wins" would let a rough $60 guess override a confident
-- $140 estimate for the same bottle, making savings look better than they
-- are. Sources now rank by trust:
--
--   0  offer           a retailer listing (fragrance_offers)
--   1  gpt_estimate    confident per-fragrance list price
--   2  house_median    median of the house's confident estimates
--   3  house_estimate  the model's view of the house's typical price
--   4  gpt_guess       forced guess
--   9  anything else
--
-- Ties within a source still go to the lower price. Return shape is
-- unchanged, so `create or replace` is fine here.

create or replace function public.find_cost_effective_options(
  p_id         uuid,
  p_limit      int     default 10,
  p_min_sim    real    default 0.60,
  p_min_saving numeric default 10
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
  price_source        text,
  source_price        numeric,
  source_price_source text,
  saving              numeric,
  saving_pct          int,
  score               real
)
language sql
stable
as $$
  with
  best_price as (
    select distinct on (fragrance_id)
      fragrance_id, price100, currency, retailer, product_url, price_source
    from (
      select fragrance_id, price as price100, currency, retailer, product_url,
             'offer'::text as price_source, 0 as pri
      from public.fragrance_offers
      where price is not null and in_stock
      union all
      select fragrance_id, price_per_ml * 100, currency, retailer, product_url,
             source,
             case source
               when 'gpt_estimate'   then 1
               when 'house_median'   then 2
               when 'house_estimate' then 3
               when 'gpt_guess'      then 4
               else 9
             end
      from public.fragrance_prices
    ) x
    order by fragrance_id, pri, price100
  ),
  src as (
    select f.note_vector, b.price100 as price, b.currency, b.price_source
    from public.fragrances f
    join best_price b on b.fragrance_id = f.id
    where f.id = p_id and f.note_vector is not null
  ),
  near as (
    select
      f.id, f.name, f.house, f.family, f.year, f.bottle_image_url, f.popularity_rank,
      (1 - (f.note_vector <=> src.note_vector))::real as similarity,
      src.price as source_price, src.currency as source_currency,
      src.price_source as source_price_source
    from public.fragrances f, src
    where f.id <> p_id and f.note_vector is not null
    order by f.note_vector <=> src.note_vector asc
    limit 120
  ),
  priced as (
    select n.*, b.price100 as price, b.currency, b.retailer, b.product_url, b.price_source
    from near n
    join best_price b on b.fragrance_id = n.id and b.currency = n.source_currency
  )
  select
    p.id, p.name, p.house, p.family, p.year, p.bottle_image_url, p.popularity_rank,
    p.similarity,
    p.price, p.currency, p.retailer, p.product_url, p.price_source,
    p.source_price, p.source_price_source,
    (p.source_price - p.price)                                    as saving,
    round(100 * (p.source_price - p.price) / p.source_price)::int  as saving_pct,
    (p.similarity * ((p.source_price - p.price) / p.source_price))::real as score
  from priced p
  where p.similarity >= p_min_sim
    and p.source_price - p.price >= p_min_saving
  order by score desc, p.similarity desc
  limit p_limit;
$$;

-- 0038_fragrance_prices.sql
--
-- Reference prices for fragrances, separate from fragrance_offers.
--
-- fragrance_offers = a retailer's live listing with an affiliate URL. It
-- earns commission and powers the Buy button, but only covers fragrances a
-- partner feed carries (roughly a third of the catalog, skewed away from
-- luxury houses).
--
-- fragrance_prices = a reference price per fragrance so the cost-effective
-- ranking can run for the rest. One row per fragrance per source. The
-- first source is a model estimate of list price (scraper/src/
-- estimate-prices.ts); a retailer-feed or shopping-API source can be added
-- later under its own `source` value without a schema change.
--
-- Every price is normalised to a size so savings compare like with like:
-- `price_per_ml` is the comparable number, `size_ml` records what the
-- price was quoted for. A price with no size is useless and is not stored.
--
-- `source = 'gpt_estimate'` rows are the model's recollection of MSRP, not
-- an observed listing. The UI labels them as estimates and the API never
-- prefers one over a real offer. Treat them as wipeable, like the
-- concentration 'ai' rows were: delete where source = 'gpt_estimate' and
-- nothing else is affected.

create table if not exists public.fragrance_prices (
  id            uuid primary key default gen_random_uuid(),
  fragrance_id  uuid not null references public.fragrances(id) on delete cascade,
  source        text not null,              -- 'gpt_estimate' | 'feed' | 'shopping_api' ...
  price         numeric not null,
  currency      text not null default 'USD',
  size_ml       numeric not null,
  price_per_ml  numeric generated always as (price / size_ml) stored,
  confidence    real,                       -- model self-rating for estimates; null otherwise
  retailer      text,                       -- null for estimates
  product_url   text,                       -- null for estimates
  fetched_at    timestamptz not null default now(),
  unique (fragrance_id, source)
);

create index if not exists fragrance_prices_fragrance_idx
  on public.fragrance_prices (fragrance_id, price_per_ml asc);

-- Public read, like offers: nothing user-specific. Writes via service role.
alter table public.fragrance_prices enable row level security;
drop policy if exists "fragrance_prices_public_read" on public.fragrance_prices;
create policy "fragrance_prices_public_read"
  on public.fragrance_prices for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Cost-effective options, v2: compare on price per ml at a common 100 ml,
-- and fall back to a reference price when there is no affiliate offer.
--
-- Priority for the price of ANY fragrance (source or candidate):
--   1. cheapest in-stock fragrance_offers row (real listing, earns commission)
--   2. fragrance_prices, lowest price_per_ml across sources
-- The row says which it used (`price_source`) so the UI can label estimates.
--
-- Offers carry no size, so they are assumed to be the standard 100 ml
-- bottle. That is the common retail size for the feeds we ingest but is an
-- assumption; a wrong size on an offer shows as a wrong saving. Adding a
-- size_ml column to fragrance_offers and parsing it from feed titles is the
-- fix if this bites.
--
-- DROP first: this version returns two more columns than 0037's, and
-- Postgres refuses `create or replace` when the return type changes
-- (error 42P13). Nothing depends on the function except the API route, so
-- dropping it is safe.
-- ---------------------------------------------------------------------------
drop function if exists public.find_cost_effective_options(uuid, int, real, numeric);

create function public.find_cost_effective_options(
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
  price               numeric,      -- for 100 ml
  currency            text,
  retailer            text,
  product_url         text,
  price_source        text,         -- 'offer' | 'gpt_estimate' | ...
  source_price        numeric,      -- for 100 ml
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
    -- One best price per fragrance, offers first, then references.
    select distinct on (fragrance_id)
      fragrance_id, price100, currency, retailer, product_url, price_source
    from (
      select fragrance_id, price as price100, currency, retailer, product_url,
             'offer'::text as price_source, 0 as pri
      from public.fragrance_offers
      where price is not null and in_stock
      union all
      select fragrance_id, price_per_ml * 100, currency, retailer, product_url,
             source, 1
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

revoke execute on function public.find_cost_effective_options(uuid, int, real, numeric)
  from anon, authenticated;
grant execute on function public.find_cost_effective_options(uuid, int, real, numeric)
  to service_role;

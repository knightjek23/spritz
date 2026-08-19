-- 0022_fragrance_offers.sql
--
-- Per-retailer buy offers for a fragrance. Powers the "Buy this fragrance"
-- CTA: one offer links straight out, several expand into a picker showing
-- each retailer and its price.
--
-- Why a table rather than more columns on `fragrances`: the number of
-- retailers per fragrance is open-ended (FragranceNet, FragranceShop,
-- Perfumania, Jomashop, Notino...), and each carries its own URL, price and
-- freshness. Affiliate feeds already ship all three, so the same backfill
-- that fills bottle_image_url can populate this.
--
-- Prices go stale, hence `updated_at`. The UI should treat an old price as
-- indicative, not a guarantee, and the retailer's own page is authoritative.

create table if not exists public.fragrance_offers (
  id            uuid primary key default gen_random_uuid(),
  fragrance_id  uuid not null references public.fragrances(id) on delete cascade,
  -- Free text rather than an enum so a new retailer doesn't need a
  -- migration. Store the display name ("FragranceNet", "Perfumania").
  retailer      text not null,
  product_url   text not null,
  price         numeric,
  currency      text not null default 'USD',
  in_stock      boolean not null default true,
  updated_at    timestamptz not null default now(),
  -- One offer per retailer per fragrance; re-running a feed updates in place.
  unique (fragrance_id, retailer)
);

-- The detail page's only query: every offer for one fragrance, cheapest
-- first (nulls last so a priced offer always outranks an unpriced one).
create index if not exists fragrance_offers_fragrance_idx
  on public.fragrance_offers (fragrance_id, price asc nulls last);

-- Public read: offers are commercial listings, nothing user-specific.
-- Writes happen through the service-role scraper only.
alter table public.fragrance_offers enable row level security;

drop policy if exists "fragrance_offers_public_read" on public.fragrance_offers;
create policy "fragrance_offers_public_read"
  on public.fragrance_offers
  for select
  to anon, authenticated
  using (true);

-- Sanity check after backfilling:
--
-- select count(*) as offers,
--        count(distinct fragrance_id) as fragrances_with_offers,
--        count(distinct retailer) as retailers
-- from public.fragrance_offers;
--
-- Fragrances with more than one offer (these show the picker):
-- select count(*) from (
--   select fragrance_id from public.fragrance_offers
--   group by fragrance_id having count(*) > 1
-- ) t;

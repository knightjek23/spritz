-- 0045_popularity_signals.sql
--
-- Popularity v2 (approved by Josh 2026-11-12). Adds a measured popularity
-- ranking ALONGSIDE the existing AI-guessed popularity_rank. Nothing that
-- exists is changed: the app keeps reading popularity_rank until Josh
-- approves the switch to popularity_rank_v2.
--
--   popularity_snapshots          one row per crawl (coverage gate)
--   fragrance_popularity_signals  per-fragrance retail signals per crawl
--   fragrance_sales_claims        cited public sales/rank claims (tier A/B/C)
--   fragrances.popularity_rank_v2 / popularity_v2_score / popularity_v2_inputs
--   apply_popularity_v2(jsonb)    bulk writer for scraper/src/rank-popularity-v2.ts
--
-- v2 score (scraper/src/rank-popularity-v2.ts):
--   50% FragranceNet Top Sellers position percentile
--   25% FragranceNet review count percentile (log scale)
--   25% existing AI popularity_score percentile
--   rows with no FragranceNet signal fall back to the AI percentile alone;
--   tier A sales-verified fragrances are lifted above every unverified row.

-- ---------------------------------------------------------------------------
-- Crawl snapshots
-- ---------------------------------------------------------------------------
create table if not exists public.popularity_snapshots (
  source           text not null,
  snapshot_date    date not null,
  pages_total      int  not null,
  pages_fetched    int  not null,
  products_listed  int  not null,
  coverage         numeric not null,          -- pages_fetched / pages_total
  created_at       timestamptz not null default now(),
  primary key (source, snapshot_date)
);

-- ---------------------------------------------------------------------------
-- Per-fragrance retail signals
-- ---------------------------------------------------------------------------
create table if not exists public.fragrance_popularity_signals (
  fragrance_id     uuid not null references public.fragrances(id) on delete cascade,
  source           text not null,             -- 'fragrancenet'
  snapshot_date    date not null,
  sku              text,
  product_path     text,
  position         int,                       -- 1 = top seller in the full listing
  total_listed     int,
  review_count     int,
  rating           numeric,
  is_top_seller    boolean,
  is_trending      boolean,
  match_method     text,                      -- 'sku' | 'path'
  created_at       timestamptz not null default now(),
  primary key (fragrance_id, source, snapshot_date),
  foreign key (source, snapshot_date) references public.popularity_snapshots(source, snapshot_date) on delete cascade
);
create index if not exists fragrance_popularity_signals_latest
  on public.fragrance_popularity_signals (source, snapshot_date desc);

-- ---------------------------------------------------------------------------
-- Cited sales / rank claims (research: "Fragrance blockbuster sales figures")
-- ---------------------------------------------------------------------------
create table if not exists public.fragrance_sales_claims (
  id               uuid primary key default gen_random_uuid(),
  fragrance_id     uuid references public.fragrances(id) on delete set null,  -- null = line/franchise claim
  label            text not null,             -- fragrance as named by the source
  house            text not null,
  tier             text check (tier in ('A', 'B', 'C')),
  pending          boolean not null default false,  -- secondhand, display as C until checked
  figure           text not null,
  unit_type        text,
  period           text,
  geography        text,
  source_type      text,                      -- independent | brand-claimed | unattributed
  source_url       text,
  confidence       text,
  notes            text,
  created_at       timestamptz not null default now()
);
create index if not exists fragrance_sales_claims_fragrance on public.fragrance_sales_claims (fragrance_id);

-- ---------------------------------------------------------------------------
-- v2 columns on fragrances (nullable; nothing reads them yet)
-- ---------------------------------------------------------------------------
alter table public.fragrances
  add column if not exists popularity_rank_v2   int,
  add column if not exists popularity_v2_score  numeric,
  add column if not exists popularity_v2_inputs text;   -- e.g. 'fn+reviews+ai', 'ai', 'none'
create index if not exists fragrances_popularity_rank_v2 on public.fragrances (popularity_rank_v2);

-- ---------------------------------------------------------------------------
-- Server only
-- ---------------------------------------------------------------------------
alter table public.popularity_snapshots          enable row level security;
alter table public.fragrance_popularity_signals  enable row level security;
alter table public.fragrance_sales_claims        enable row level security;
revoke all on public.popularity_snapshots         from anon, authenticated;
revoke all on public.fragrance_popularity_signals from anon, authenticated;
revoke all on public.fragrance_sales_claims       from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bulk writer: [{id, rank, score, inputs}, ...] -> rows updated
-- ---------------------------------------------------------------------------
create or replace function public.apply_popularity_v2(p_rows jsonb)
returns int
language sql
security definer
set search_path = public
as $$
  with r as (
    select (e->>'id')::uuid as id,
           (e->>'rank')::int as rnk,
           (e->>'score')::numeric as sc,
           e->>'inputs' as inp
    from jsonb_array_elements(p_rows) e
  ), u as (
    update public.fragrances f
       set popularity_rank_v2   = r.rnk,
           popularity_v2_score  = r.sc,
           popularity_v2_inputs = r.inp
      from r
     where f.id = r.id
    returning 1
  )
  select count(*)::int from u;
$$;
revoke all on function public.apply_popularity_v2(jsonb) from public, anon, authenticated;
grant execute on function public.apply_popularity_v2(jsonb) to service_role;

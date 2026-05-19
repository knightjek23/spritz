-- =====================================================================
-- Cologne Scan App — initial schema
-- Implements PRD §9 (Data Model). Top-10k fragrance bootstrap.
-- =====================================================================

-- Required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "vector";       -- pgvector for note_vector cosine similarity
create extension if not exists "pg_trgm";      -- trigram fuzzy search for OCR error tolerance


-- =====================================================================
-- fragrances — bootstrapped from Fragrantica scrape (top 10k by popularity)
-- =====================================================================
create table if not exists public.fragrances (
  id                  uuid primary key default uuid_generate_v4(),
  name                text not null,
  house               text not null,
  family              text[] default '{}',
  gender              text check (gender in ('masculine', 'feminine', 'unisex')),
  year                int,

  -- Notes as [{name: 'bergamot', weight: 0.0-1.0}, ...]
  top_notes           jsonb default '[]'::jsonb,
  mid_notes           jsonb default '[]'::jsonb,
  base_notes          jsonb default '[]'::jsonb,

  -- 500-dim weighted vector across canonical note dictionary (PRD §8)
  note_vector         vector(500),

  longevity_score     real,    -- 0–10
  longevity_confidence real,   -- 0–1, tightness of community vote spread
  sillage_score       real,    -- 0–10
  sillage_confidence  real,    -- 0–1
  season_tags         text[] default '{}',
  time_tags           text[] default '{}',
  similar_ids         uuid[] default '{}',  -- Fragrantica's pre-computed similars

  -- Encyclopedia content (drives the "informative, not suggestive" positioning per PRD §1)
  perfumer            text,                       -- "Francis Kurkdjian", etc.
  house_history       text,                       -- ~100-word brand story
  wear_guidance       jsonb default '{}'::jsonb,  -- {occasions, how_to_wear, layering_notes}
  notes_descriptions  jsonb default '{}'::jsonb,  -- {note_name_lower: "what it smells like"}
  bottle_image_url    text,                       -- canonical product shot
  editorial_notes     text,                       -- optional curator commentary (Pro-gated rendering)

  -- Internal only — never exposed in UI per data note
  fragrantica_url     text,

  avg_retail_price    numeric(10, 2),  -- internal use only (affiliate retailer routing)
  price_tier          text check (price_tier in ('budget', 'mid', 'designer', 'niche')),
  popularity_rank     int,

  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),

  unique (name, house)
);

create index if not exists fragrances_name_trgm_idx
  on public.fragrances using gin (name gin_trgm_ops);
create index if not exists fragrances_house_trgm_idx
  on public.fragrances using gin (house gin_trgm_ops);
create index if not exists fragrances_family_idx
  on public.fragrances using gin (family);
create index if not exists fragrances_popularity_idx
  on public.fragrances (popularity_rank);
create index if not exists fragrances_price_tier_idx
  on public.fragrances (price_tier);

-- Vector index for cosine similarity (used at scrape-time pre-compute, not at request time)
create index if not exists fragrances_note_vector_idx
  on public.fragrances using ivfflat (note_vector vector_cosine_ops)
  with (lists = 100);


-- =====================================================================
-- users — mirrors Clerk identity, plus app-level fields
-- =====================================================================
create table if not exists public.users (
  id                  uuid primary key,         -- Clerk user id (UUID-shaped)
  clerk_user_id       text unique not null,     -- Raw Clerk id string
  email               text,
  plan                text default 'free' check (plan in ('free', 'pro')),
  stripe_customer_id  text unique,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index if not exists users_clerk_user_id_idx on public.users (clerk_user_id);


-- =====================================================================
-- collection_items — Own / Tried / Wishlist
-- Free tier capped at 25 total (enforced in app, not DB, for easy tuning per Q5)
-- =====================================================================
create table if not exists public.collection_items (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.users(id) on delete cascade,
  fragrance_id    uuid not null references public.fragrances(id) on delete cascade,
  status          text not null check (status in ('own', 'tried', 'wishlist')),
  note            text,                         -- P1 — collection notes
  added_at        timestamptz default now(),
  unique (user_id, fragrance_id, status)
);

create index if not exists collection_items_user_idx on public.collection_items (user_id, added_at desc);
create index if not exists collection_items_user_status_idx on public.collection_items (user_id, status);


-- =====================================================================
-- scan_events — every scan attempt, success or fail
-- Drives accuracy metric + Q7 (track misses for catalog expansion)
-- =====================================================================
create table if not exists public.scan_events (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid references public.users(id) on delete set null,
  ip_hash               text,                         -- sha256(ip + salt) — for rate limit + abuse triage
  image_url             text,                         -- Supabase Storage, retained 30d
  detected_brand        text,
  detected_name         text,
  matched_fragrance_id  uuid references public.fragrances(id) on delete set null,
  confidence            real,
  vision_provider       text check (vision_provider in ('gpt4o', 'google')),
  latency_ms            int,
  created_at            timestamptz default now()
);

create index if not exists scan_events_user_idx on public.scan_events (user_id, created_at desc);
create index if not exists scan_events_created_idx on public.scan_events (created_at desc);
create index if not exists scan_events_unmatched_idx
  on public.scan_events (created_at desc)
  where matched_fragrance_id is null;


-- =====================================================================
-- affiliate_clicks — every Buy CTA click (revenue attribution)
-- =====================================================================
create table if not exists public.affiliate_clicks (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references public.users(id) on delete set null,
  fragrance_id    uuid not null references public.fragrances(id) on delete cascade,
  retailer        text not null check (retailer in ('scentbird', 'fragrancenet', 'nordstrom')),
  clicked_at      timestamptz default now()
);

create index if not exists affiliate_clicks_fragrance_idx on public.affiliate_clicks (fragrance_id, clicked_at desc);
create index if not exists affiliate_clicks_clicked_idx on public.affiliate_clicks (clicked_at desc);


-- =====================================================================
-- dupe_pairs — pre-computed top-50 dupes per fragrance (PRD §8)
-- 10k fragrances × 50 dupes = 500k rows. Recompute when DB grows ±10%.
-- =====================================================================
create table if not exists public.dupe_pairs (
  fragrance_a     uuid not null references public.fragrances(id) on delete cascade,
  fragrance_b     uuid not null references public.fragrances(id) on delete cascade,
  score           real not null,                -- 0.0–1.0
  shared_notes    jsonb,                        -- [{name, weight_a, weight_b}, ...]
  computed_at     timestamptz default now(),
  primary key (fragrance_a, fragrance_b),
  check (fragrance_a <> fragrance_b)
);

create index if not exists dupe_pairs_a_score_idx
  on public.dupe_pairs (fragrance_a, score desc);


-- =====================================================================
-- updated_at triggers
-- =====================================================================
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger fragrances_touch before update on public.fragrances
  for each row execute function public.touch_updated_at();

create trigger users_touch before update on public.users
  for each row execute function public.touch_updated_at();


-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.fragrances        enable row level security;
alter table public.users             enable row level security;
alter table public.collection_items  enable row level security;
alter table public.scan_events       enable row level security;
alter table public.affiliate_clicks  enable row level security;
alter table public.dupe_pairs        enable row level security;

-- fragrances: read-only public catalog
create policy "fragrances are public-readable"
  on public.fragrances for select
  using (true);

-- dupe_pairs: read-only public (server filters by free/pro tier in API layer)
create policy "dupe_pairs are public-readable"
  on public.dupe_pairs for select
  using (true);

-- users: owner can read self
-- (Auth model uses Clerk JWT — `auth.jwt() ->> 'sub'` matches users.clerk_user_id)
create policy "users can read self"
  on public.users for select
  using (clerk_user_id = (select auth.jwt() ->> 'sub'));

-- collection_items: owner-only CRUD
create policy "collection: owner can select"
  on public.collection_items for select
  using (user_id in (
    select id from public.users where clerk_user_id = (select auth.jwt() ->> 'sub')
  ));
create policy "collection: owner can insert"
  on public.collection_items for insert
  with check (user_id in (
    select id from public.users where clerk_user_id = (select auth.jwt() ->> 'sub')
  ));
create policy "collection: owner can update"
  on public.collection_items for update
  using (user_id in (
    select id from public.users where clerk_user_id = (select auth.jwt() ->> 'sub')
  ));
create policy "collection: owner can delete"
  on public.collection_items for delete
  using (user_id in (
    select id from public.users where clerk_user_id = (select auth.jwt() ->> 'sub')
  ));

-- scan_events + affiliate_clicks: write via service role (server) only.
-- Owners can read their own scan history (used by P1 scan-history feature).
create policy "scans: owner can read self"
  on public.scan_events for select
  using (user_id in (
    select id from public.users where clerk_user_id = (select auth.jwt() ->> 'sub')
  ));


-- =====================================================================
-- RPC: search_fragrances
-- Used by /api/scan (Layer 2 lookup) and /api/search (manual fallback).
-- Trigram similarity on (house, name) — handles OCR noise.
-- =====================================================================
create or replace function public.search_fragrances(
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
  sillage_score       real,
  season_tags         text[],
  time_tags           text[],
  similar_ids         uuid[],
  avg_retail_price    numeric,
  price_tier          text,
  popularity_rank     int,
  match_score         real
)
language sql
stable
as $$
  select
    f.id, f.name, f.house, f.family, f.gender, f.year,
    f.top_notes, f.mid_notes, f.base_notes,
    f.longevity_score, f.sillage_score,
    f.season_tags, f.time_tags, f.similar_ids,
    f.avg_retail_price, f.price_tier, f.popularity_rank,
    -- Combined similarity, weighted toward exact name match.
    (0.65 * similarity(f.name,  p_name)
   + 0.35 * similarity(f.house, p_brand))::real as match_score
  from public.fragrances f
  where f.name  % p_name
     or f.house % p_brand
  order by match_score desc
  limit p_limit;
$$;

grant execute on function public.search_fragrances(text, text, int) to anon, authenticated, service_role;


-- =====================================================================
-- Helper view: unmatched scan misses (drives catalog expansion per Q7)
-- =====================================================================
create or replace view public.unmatched_scans_summary as
select
  detected_brand,
  detected_name,
  count(*) as miss_count,
  max(created_at) as last_miss_at
from public.scan_events
where matched_fragrance_id is null
  and detected_name is not null
group by detected_brand, detected_name
order by miss_count desc;

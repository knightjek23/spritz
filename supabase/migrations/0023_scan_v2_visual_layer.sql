-- 0023_scan_v2_visual_layer.sql
--
-- Scan v2 (SCAN_V2_DESIGN.md §4): bottle shape/color as a first-class scan
-- signal, plus the per-scan score log that lets us calibrate thresholds
-- from real traffic instead of guessing.
--
-- Push with:  supabase db push        (or `npm run db:migrate`)
-- Then fill:  cd scraper && pnpm embed:images --dry && pnpm embed:images
--
-- pgvector is already enabled (0001, note_vector). HNSW needs pgvector
-- >= 0.5; Supabase ships 0.8+, which also has iterative scans (used below
-- so a house-scoped query doesn't come back short after post-filtering).

-- =====================================================================
-- bottle_image_embeddings — one row per IMAGE, not per fragrance.
--
-- Why per image: approved user photos (fragrance_photos, 0020) are real
-- bottles in real hands, the exact domain a scan lives in. They sit beside
-- the catalog image and vote for the same fragrance_id. `source` also
-- makes the hotlinked-catalog set purgeable in one statement:
--   delete from bottle_image_embeddings where source = 'catalog';
-- `model` makes a provider swap a script re-run, not a migration.
-- =====================================================================
create table if not exists public.bottle_image_embeddings (
  id            uuid primary key default gen_random_uuid(),
  fragrance_id  uuid not null references public.fragrances(id) on delete cascade,
  source        text not null check (source in ('catalog', 'affiliate', 'user_photo')),
  image_url     text not null,
  model         text not null,
  embedding     vector(1024) not null,
  created_at    timestamptz not null default now(),
  unique (fragrance_id, image_url, model)
);

create index if not exists bottle_image_embeddings_hnsw_idx
  on public.bottle_image_embeddings
  using hnsw (embedding vector_cosine_ops);

create index if not exists bottle_image_embeddings_fragrance_idx
  on public.bottle_image_embeddings (fragrance_id);

-- Service-role only. Nothing in the app reads this table except the RPC
-- below, which is called with the admin client.
alter table public.bottle_image_embeddings enable row level security;

-- =====================================================================
-- match_bottle_images — cosine kNN, best image per fragrance.
--
-- p_house (optional, ilike) scopes the search to one house. That's where
-- shape matters most and labels help least: flankers and concentrations
-- share a name and differ by bottle. With a filter, an HNSW scan can
-- return fewer than p_limit rows once post-filtered; iterative_scan
-- (pgvector 0.8) keeps pulling until it has enough. set_config is wrapped
-- so the function still works on an older pgvector.
-- =====================================================================
create or replace function public.match_bottle_images(
  p_embedding vector(1024),
  p_limit     int  default 10,
  p_house     text default null
)
returns table (
  fragrance_id      uuid,
  similarity        real,
  name              text,
  house             text,
  bottle_image_url  text
)
language plpgsql
stable
as $$
#variable_conflict use_column
begin
  begin
    perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
  exception when others then
    null;
  end;

  return query
  with nn as (
    select
      e.fragrance_id,
      1 - (e.embedding <=> p_embedding) as sim
    from public.bottle_image_embeddings e
    join public.fragrances f on f.id = e.fragrance_id
    where p_house is null or f.house ilike p_house
    order by e.embedding <=> p_embedding
    limit greatest(p_limit * 4, 40)
  )
  select
    nn.fragrance_id,
    max(nn.sim)::real as similarity,
    f.name,
    f.house,
    f.bottle_image_url
  from nn
  join public.fragrances f on f.id = nn.fragrance_id
  group by nn.fragrance_id, f.name, f.house, f.bottle_image_url
  order by similarity desc
  limit p_limit;
end;
$$;

grant execute on function public.match_bottle_images(vector, int, text) to service_role;

-- Coverage report for `pnpm embed:images` (no silent partial results).
create or replace function public.count_embedded_fragrances(p_model text)
returns int
language sql
stable
as $$
  select count(distinct fragrance_id)::int
  from public.bottle_image_embeddings
  where model = p_model;
$$;

grant execute on function public.count_embedded_fragrances(text) to service_role;

-- =====================================================================
-- scan_events — score log for calibration + the audit-trail receipt.
--
-- candidates: [{fragrance_id, text_score, visual_score, fused}] in final
-- rank order. The detail page's "Not it? See N other close matches" reads
-- this back through GET /api/scan/[id].
-- =====================================================================
alter table public.scan_events
  add column if not exists match_method    text,
  add column if not exists candidates      jsonb,
  add column if not exists visual_provider text,
  add column if not exists web_lookup      boolean not null default false;

-- Daily budget check for the web fallback counts these rows.
create index if not exists scan_events_web_lookup_idx
  on public.scan_events (created_at desc)
  where web_lookup;

-- =====================================================================
-- Storage (one-time, dashboard): Storage -> New bucket -> "scan-images"
-- -> Private. Used only by the Phase 3 web fallback; objects are removed
-- right after the lookup. Add a 30-day lifecycle rule as the backstop.
-- =====================================================================

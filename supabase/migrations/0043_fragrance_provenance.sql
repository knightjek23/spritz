-- 0043_fragrance_provenance.sql
--
-- Source record for catalog fields, split in two on purpose.
--
-- public.fragrance_provenance  (server only)
--   Where each stored value originally came from, plus a copy of the notes,
--   family and perfumer as they stood before any provenance work touched
--   them. No RLS policy and no grants to anon/authenticated: only the
--   service role reads or writes it. This is the internal record.
--
-- public.fragrances  (public catalog, new columns)
--   Only what the "Sources" footer on a fragrance page needs: whether the
--   notes have been checked against a brand or retailer page, the page they
--   were checked against, and whether the accords are Spritz-computed.
--
-- THIS MIGRATION IS ADDITIVE. It changes no existing column and no existing
-- value on public.fragrances. Every row keeps rendering exactly as before:
-- the new columns default to "unverified" / false and nothing reads them yet.
--
-- Deliberately NOT done here (each needs its own change, after the code that
-- depends on it has shipped):
--   * dropping fragrances.fragrantica_url and removing it from the search
--     functions (lib/trending/join.ts still matches on it)
--   * flattening note weights
--   * replacing family with computed accords
--
-- Rollback: the legacy_* columns hold the pre-change notes, family and
-- perfumer for every row, so any later change can be reversed per row.

create table if not exists public.fragrance_provenance (
  fragrance_id       uuid primary key references public.fragrances(id) on delete cascade,

  -- Internal match key, copied from fragrances.fragrantica_url.
  fragrantica_url    text,

  -- Where the value CURRENTLY stored on public.fragrances came from.
  notes_origin       text not null default 'unknown'
                       check (notes_origin in ('fragrantica', 'brand', 'retailer', 'unknown')),
  family_origin      text not null default 'unknown'
                       check (family_origin in ('fragrantica', 'computed', 'unknown')),
  perfumer_origin    text not null default 'unknown'
                       check (perfumer_origin in ('fragrantica', 'brand', 'retailer', 'unknown')),

  -- Snapshot taken by this migration, before any provenance change.
  legacy_family      text[],
  legacy_top_notes   jsonb,
  legacy_mid_notes   jsonb,
  legacy_base_notes  jsonb,
  legacy_perfumer    text,
  legacy_saved_at    timestamptz,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Server only. RLS on with no policy means anon and authenticated see zero
-- rows; the revoke makes that explicit at the privilege level too.
alter table public.fragrance_provenance enable row level security;
revoke all on public.fragrance_provenance from anon, authenticated;

-- Footer-facing columns on the public catalog.
alter table public.fragrances
  add column if not exists notes_status text not null default 'unverified'
    check (notes_status in ('unverified', 'match', 'replaced', 'not_found', 'needs_review')),
  add column if not exists notes_source_url     text,
  add column if not exists notes_verified_at    timestamptz,
  add column if not exists notes_tiers_verified boolean not null default false,
  add column if not exists family_computed      boolean not null default false,
  add column if not exists perfumer_source_url  text;

-- One provenance row per existing fragrance, with the snapshot.
-- A row that carries a fragrantica_url was written by the Fragrantica
-- scraper, so its notes, family and perfumer are recorded as such. A row
-- without one has no known origin and is recorded as 'unknown'.
insert into public.fragrance_provenance (
  fragrance_id, fragrantica_url,
  notes_origin, family_origin, perfumer_origin,
  legacy_family, legacy_top_notes, legacy_mid_notes, legacy_base_notes,
  legacy_perfumer, legacy_saved_at
)
select
  f.id,
  f.fragrantica_url,
  case when f.fragrantica_url is not null then 'fragrantica' else 'unknown' end,
  case when f.fragrantica_url is not null then 'fragrantica' else 'unknown' end,
  case when f.perfumer is not null and f.fragrantica_url is not null
       then 'fragrantica' else 'unknown' end,
  f.family, f.top_notes, f.mid_notes, f.base_notes,
  f.perfumer, now()
from public.fragrances f
on conflict (fragrance_id) do nothing;

-- ---------------------------------------------------------------------------
-- Checks to run by hand after `supabase db push`:
--
--   -- every fragrance has a provenance row
--   select (select count(*) from public.fragrances)            as fragrances,
--          (select count(*) from public.fragrance_provenance)  as provenance;
--
--   -- nothing verified yet, nothing computed yet
--   select notes_status, family_computed, count(*)
--   from public.fragrances group by 1, 2;
--
--   -- origin breakdown
--   select notes_origin, count(*) from public.fragrance_provenance group by 1;
-- ---------------------------------------------------------------------------

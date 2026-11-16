-- 0046_promote_popularity_v2.sql
--
-- Make popularity v2 the ranking the app uses (approved by Josh 2026-11-14).
--
-- popularity_rank is read by ~10 places in the app and ~18 database
-- functions, so instead of repointing each of them, v2 is COPIED into
-- popularity_rank. The previous (AI-only) ranking is kept in
-- popularity_rank_v1 so the switch can be undone.
--
-- Future re-rankings promote themselves:
--   cd scraper && pnpm rank:popularity-v2 --write --promote
-- which calls public.promote_popularity_v2() after writing v2.
--
-- Safe to re-run: the backup only fills rows that don't have one yet, and
-- the copy refuses to run if any fragrance is missing a v2 rank.
--
-- UNDO (restores the AI ranking everywhere):
--   update public.fragrances
--      set popularity_rank = popularity_rank_v1
--    where popularity_rank_v1 is not null;

alter table public.fragrances
  add column if not exists popularity_rank_v1 int;

comment on column public.fragrances.popularity_rank_v1 is
  'AI-only popularity_rank as it stood before popularity v2 was promoted (0046). Backup for undo.';

create or replace function public.promote_popularity_v2()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  missing int;
  changed int;
begin
  select count(*) into missing from public.fragrances where popularity_rank_v2 is null;
  if missing > 0 then
    raise exception '% fragrance(s) have no popularity_rank_v2. Run: cd scraper && pnpm rank:popularity-v2 --write', missing;
  end if;

  -- One-time backup of the pre-v2 rank (rows added later are backed up the
  -- first time they are promoted).
  update public.fragrances
     set popularity_rank_v1 = popularity_rank
   where popularity_rank_v1 is null
     and popularity_rank is not null;

  update public.fragrances
     set popularity_rank = popularity_rank_v2
   where popularity_rank is distinct from popularity_rank_v2;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.promote_popularity_v2() from public, anon, authenticated;
grant execute on function public.promote_popularity_v2() to service_role;

-- Promote now.
select public.promote_popularity_v2() as rows_switched_to_v2;

-- ---------------------------------------------------------------------------
-- Checks to run after:
--
--   -- every row is on v2, and every old rank is backed up
--   select count(*)                                              as fragrances,
--          count(*) filter (where popularity_rank = popularity_rank_v2) as on_v2,
--          count(popularity_rank_v1)                             as backed_up
--   from public.fragrances;
--
--   -- the new top 10
--   select popularity_rank, house, name
--   from public.fragrances order by popularity_rank limit 10;
-- ---------------------------------------------------------------------------

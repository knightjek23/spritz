-- =====================================================================
-- 0042_trending_activity.sql
--
-- "Trending this week" from all the activity we already record, not just
-- scans. 0010's list_trending_fragrances counted successful scans only,
-- which at current volume meant one or two bottles on the shelf. This
-- scores each fragrance over the trailing window on four signals, each
-- counted as DISTINCT PEOPLE, so one person scanning the same bottle
-- thirty times, or wearing it every day, is one vote, not thirty:
--
--   scanned it        x 3   strongest intent: bottle in hand, in a store
--   wore it           x 2   "What are you wearing" log (wear_log)
--   shelved it        x 2   own / tried / wishlist added (collection_items)
--   clicked to buy    x 1   buy-link click (affiliate_clicks)
--
-- Anonymous scans and clicks (no user_id) are counted per ip_hash for
-- scans and per row for clicks, so a signed-out visitor still counts.
--
-- Ties break on how many different signals agree, then catalog
-- popularity, then id (stable order). 0010's function is left in place;
-- nothing calls it after this ships, it can be dropped later.
--
-- Public RPC: returns aggregate counts only, never who did what.
-- =====================================================================

create or replace function public.list_trending_activity(
  p_limit int default 10,
  p_days  int default 7
)
returns table (
  id               uuid,
  name             text,
  house            text,
  year             int,
  bottle_image_url text,
  score            int,
  scanners         int,
  wearers          int,
  shelvers         int,
  clickers         int
)
language sql
stable
as $$
  with win as (
    select now() - make_interval(days => greatest(p_days, 1)) as since
  ),
  scans as (
    select se.matched_fragrance_id as fid,
           count(distinct coalesce(se.user_id::text, se.ip_hash, se.id::text))::int as n
    from public.scan_events se, win
    where se.matched_fragrance_id is not null
      and se.created_at >= win.since
    group by 1
  ),
  wears as (
    select w.fragrance_id as fid, count(distinct w.user_id)::int as n
    from public.wear_log w, win
    where w.created_at >= win.since
    group by 1
  ),
  shelves as (
    select c.fragrance_id as fid, count(distinct c.user_id)::int as n
    from public.collection_items c, win
    where c.added_at >= win.since
    group by 1
  ),
  clicks as (
    select a.fragrance_id as fid,
           count(distinct coalesce(a.user_id::text, a.id::text))::int as n
    from public.affiliate_clicks a, win
    where a.clicked_at >= win.since
    group by 1
  ),
  scored as (
    select ids.fid,
           coalesce(s.n, 0) as scanners,
           coalesce(w.n, 0) as wearers,
           coalesce(sh.n, 0) as shelvers,
           coalesce(c.n, 0) as clickers
    from (
      select fid from scans
      union select fid from wears
      union select fid from shelves
      union select fid from clicks
    ) ids
    left join scans   s  on s.fid  = ids.fid
    left join wears   w  on w.fid  = ids.fid
    left join shelves sh on sh.fid = ids.fid
    left join clicks  c  on c.fid  = ids.fid
  )
  select
    f.id, f.name, f.house, f.year, f.bottle_image_url,
    (3 * sc.scanners + 2 * sc.wearers + 2 * sc.shelvers + sc.clickers)::int as score,
    sc.scanners, sc.wearers, sc.shelvers, sc.clickers
  from scored sc
  join public.fragrances f on f.id = sc.fid
  order by
    score desc,
    ((sc.scanners > 0)::int + (sc.wearers > 0)::int
      + (sc.shelvers > 0)::int + (sc.clickers > 0)::int) desc,
    f.popularity_rank asc nulls last,
    f.id asc
  limit greatest(p_limit, 0);
$$;

grant execute on function public.list_trending_activity(int, int)
  to anon, authenticated, service_role;

-- audit-mirror-readiness.sql
--
-- Run this in the Supabase SQL editor BEFORE `pnpm mirror:images`.
-- It answers: how many rows are we about to touch, what shape are the URLs
-- in, and is there anything the mirror would wrongly overwrite?
--
-- Nothing here writes. Safe to run any time.

-- 1. The headline: what's in bottle_image_url right now.
--    'fimgs (bare)'   -> https://fimgs.net/...      <- the mirror's candidates
--    'fimgs (subdom)' -> https://pics.fimgs.net/... <- also candidates
--    'supabase mirror'-> already mirrored, skipped on re-run
--    'other'          -> licensed / affiliate images, NEVER touched
select
  case
    when bottle_image_url is null                        then 'NULL'
    when bottle_image_url ~* '^https?://fimgs\.net/'     then 'fimgs (bare)'
    when bottle_image_url ~* '://[^/]*\.fimgs\.net/'     then 'fimgs (subdomain)'
    when bottle_image_url ilike '%/bottle-images/%'      then 'supabase mirror'
    else                                                      'other'
  end as current_kind,
  count(*) as rows,
  round(100.0 * count(*) / sum(count(*)) over (), 1) as pct
from public.fragrances
group by 1
order by rows desc;

-- 2. Sanity: total catalog size, and how many rows carry ANY image.
select
  count(*)                     as total_rows,
  count(bottle_image_url)      as has_any_url,
  count(*) - count(bottle_image_url) as null_url
from public.fragrances;

-- 3. Placeholder check. Fragrantica serves one shared "IMAGE COMING SOON"
--    graphic for many fragrances, so a URL used by MORE THAN ONE row is
--    almost certainly a placeholder, not a real bottle photo. The mirror
--    skips known placeholder patterns; anything surfacing here that ISN'T
--    already matched by PLACEHOLDER_PATTERNS in lib/bottle-image.ts should
--    be added there before the run (otherwise you mirror junk).
select bottle_image_url, count(*) as used_by_rows
from public.fragrances
where bottle_image_url is not null
group by bottle_image_url
having count(*) > 1
order by used_by_rows desc
limit 25;

-- 4. Popularity-weighted view. A 7k catalog has a long tail nobody opens.
--    What matters is whether the fragrances users actually reach have
--    images. This is the number to judge the run by, before and after.
select
  case
    when popularity_rank <= 100  then 'top 100'
    when popularity_rank <= 500  then 'top 500'
    when popularity_rank <= 1000 then 'top 1000'
    when popularity_rank <= 2500 then 'top 2500'
    else                              'the tail'
  end as band,
  count(*) as rows,
  count(*) filter (where bottle_image_url ilike '%fimgs.net%')      as on_fimgs,
  count(*) filter (where bottle_image_url ilike '%/bottle-images/%') as mirrored,
  count(*) filter (
    where bottle_image_url is not null
      and bottle_image_url not ilike '%fimgs.net%'
      and bottle_image_url not ilike '%/bottle-images/%'
  ) as licensed
from public.fragrances
where popularity_rank is not null
group by 1
order by min(popularity_rank);

-- 5. Storage estimate. Fragrantica's 375x500 thumbs run roughly 20-40 KB
--    each, so multiply the fimgs count by ~30 KB to size the bucket.
--    ~7,000 images is on the order of 200 MB — comfortably inside the
--    Supabase free tier's 1 GB storage, but worth knowing before you start.
select
  count(*) filter (where bottle_image_url ilike '%fimgs.net%') as images_to_mirror,
  pg_size_pretty(
    (count(*) filter (where bottle_image_url ilike '%fimgs.net%') * 30 * 1024)::bigint
  ) as rough_storage_estimate
from public.fragrances;

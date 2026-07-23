-- blank-unlicensed-images.sql
--
-- Pre-launch legal hardening: stop serving unlicensed bottle images.
-- Nulls bottle_image_url for every row pointing at Fragrantica's CDN
-- (fimgs.net) or our mirror of it (the "bottle-images" Supabase Storage
-- bucket). Both are copyrighted brand/Fragrantica photos we don't have a
-- license to display.
--
-- Every render site already treats a null bottle_image_url as "no image"
-- and shows the house-initials fallback, so this is all that's needed to
-- clear the images from the live app. Non-destructive to everything else
-- on the row; the original URLs remain in the scraper's data/raw if ever
-- needed, and licensed (affiliate-feed) images will backfill this column
-- later at their own URLs.
--
-- Run in the Supabase SQL editor.

-- 1. How many rows will be cleared, split by source (run first to preview):
select
  case
    when bottle_image_url ilike '%fimgs.net%' then 'fimgs.net (hotlink)'
    when bottle_image_url ilike '%/bottle-images/%' then 'supabase mirror'
    else 'other'
  end as source,
  count(*) as rows
from public.fragrances
where bottle_image_url is not null
group by 1
order by 2 desc;

-- 2. The actual clear. Uncomment and run once the preview looks right.
-- update public.fragrances
-- set bottle_image_url = null
-- where bottle_image_url ilike '%fimgs.net%'
--    or bottle_image_url ilike '%/bottle-images/%';

-- 3. Confirm none remain (should return 0):
-- select count(*) as unlicensed_remaining
-- from public.fragrances
-- where bottle_image_url ilike '%fimgs.net%'
--    or bottle_image_url ilike '%/bottle-images/%';
